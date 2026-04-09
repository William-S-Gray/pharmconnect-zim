-- ##################################################################
-- PHARMCONNECT PHASE 2 MIGRATION
-- Run this in the Supabase SQL Editor
-- ##################################################################

-- 1. Enable PostGIS extension (for future geo queries; harmless if already enabled)
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search

-- 2. Add whatsapp_number to pharmacies (optional field)
ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- 3. Drug Reservations table (anonymous patient orders)
CREATE TABLE IF NOT EXISTS public.drug_reservations (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pharmacy_id     UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
  drug_id         UUID REFERENCES public.drugs(id) ON DELETE SET NULL,
  drug_name       TEXT NOT NULL,           -- denormalised for display
  patient_name    TEXT NOT NULL,
  patient_phone   TEXT NOT NULL,
  quantity        INTEGER DEFAULT 1,
  unit_price      NUMERIC(10,2),           -- price at time of reservation
  status          TEXT DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','CONTACTED','FULFILLED','CANCELLED')),
  notes           TEXT,
  reference_code  TEXT UNIQUE,             -- short human-readable code
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate a short reference code on insert
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference_code := 'RX-' || UPPER(SUBSTRING(MD5(NEW.id::TEXT), 1, 6));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_reservation_code ON public.drug_reservations;
CREATE TRIGGER set_reservation_code
  BEFORE INSERT ON public.drug_reservations
  FOR EACH ROW EXECUTE FUNCTION public.generate_reservation_code();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS drug_reservations_updated_at ON public.drug_reservations;
CREATE TRIGGER drug_reservations_updated_at
  BEFORE UPDATE ON public.drug_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. RLS for drug_reservations
ALTER TABLE public.drug_reservations ENABLE ROW LEVEL SECURITY;

-- Anyone can create a reservation (anonymous)
DROP POLICY IF EXISTS "Public can insert reservations" ON public.drug_reservations;
CREATE POLICY "Public can insert reservations"
  ON public.drug_reservations FOR INSERT WITH CHECK (true);

-- Only pharmacy members can read/update their reservations
DROP POLICY IF EXISTS "Pharmacy members can read own reservations" ON public.drug_reservations;
CREATE POLICY "Pharmacy members can read own reservations"
  ON public.drug_reservations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
    AND pharmacy_id = drug_reservations.pharmacy_id
  ));

DROP POLICY IF EXISTS "Pharmacy admins can update reservations" ON public.drug_reservations;
CREATE POLICY "Pharmacy admins can update reservations"
  ON public.drug_reservations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
    AND pharmacy_id = drug_reservations.pharmacy_id
  ));

-- 5. Add drug_reservations and pharmacy_stock to realtime
-- (Skip with error if already added — safe to run)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_reservations;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'drug_reservations already in realtime publication';
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_stock;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pharmacy_stock already in realtime publication';
END $$;

-- 6. MAIN RPC: find_nearby_pharmacies
-- Accepts a drug query (name or symptom), user coordinates, optional city filter
-- Returns: drug_name, pharmacy details, price, stock_status, distance_km
-- Includes built-in symptom → drug keyword mapping

DROP FUNCTION IF EXISTS public.find_nearby_pharmacies(TEXT, FLOAT8, FLOAT8, FLOAT8, TEXT);

CREATE OR REPLACE FUNCTION public.find_nearby_pharmacies(
  p_query      TEXT,
  p_lat        FLOAT8 DEFAULT NULL,
  p_lng        FLOAT8 DEFAULT NULL,
  p_radius_km  FLOAT8 DEFAULT 50,
  p_city       TEXT   DEFAULT NULL
)
RETURNS TABLE (
  pharmacy_id   UUID,
  pharmacy_name TEXT,
  suburb        TEXT,
  city          TEXT,
  phone         TEXT,
  lat           FLOAT8,
  lng           FLOAT8,
  drug_id       UUID,
  drug_name     TEXT,
  drug_strength TEXT,
  unit_price    NUMERIC,
  quantity      INTEGER,
  stock_status  TEXT,
  distance_km   FLOAT8
) AS $$
DECLARE
  v_search TEXT;
BEGIN
  -- Symptom → drug keyword expansion
  v_search := LOWER(TRIM(p_query));
  v_search := CASE
    WHEN v_search ILIKE '%running stomach%' OR v_search ILIKE '%diarrhoea%' OR v_search ILIKE '%diarrhea%' OR v_search ILIKE '%loose stool%'
      THEN 'oral rehydration OR loperamide OR metronidazole OR flagyl OR ORS'
    WHEN v_search ILIKE '%headache%' OR v_search ILIKE '%head pain%'
      THEN 'paracetamol OR ibuprofen OR aspirin'
    WHEN v_search ILIKE '%fever%' OR v_search ILIKE '%temperature%' OR v_search ILIKE '%malaria%'
      THEN 'paracetamol OR coartem OR artemether OR quinine'
    WHEN v_search ILIKE '%cough%' OR v_search ILIKE '%cold%' OR v_search ILIKE '%flu%'
      THEN 'amoxicillin OR dextromethorphan OR bromhexine OR cetirizine'
    WHEN v_search ILIKE '%blood pressure%' OR v_search ILIKE '%hypertension%'
      THEN 'amlodipine OR losartan OR enalapril OR hydrochlorothiazide'
    WHEN v_search ILIKE '%diabetes%' OR v_search ILIKE '%sugar%'
      THEN 'metformin OR glibenclamide OR insulin'
    WHEN v_search ILIKE '%stomach pain%' OR v_search ILIKE '%ulcer%' OR v_search ILIKE '%acid%' OR v_search ILIKE '%heartburn%'
      THEN 'omeprazole OR ranitidine OR antacid OR lansoprazole'
    WHEN v_search ILIKE '%infection%' OR v_search ILIKE '%bacteria%'
      THEN 'amoxicillin OR ciprofloxacin OR metronidazole'
    WHEN v_search ILIKE '%pain%' OR v_search ILIKE '%ache%'
      THEN 'paracetamol OR ibuprofen OR diclofenac'
    WHEN v_search ILIKE '%cholesterol%'
      THEN 'atorvastatin OR simvastatin'
    ELSE p_query
  END;

  RETURN QUERY
  SELECT
    ph.id                                  AS pharmacy_id,
    ph.name                                AS pharmacy_name,
    ph.suburb                              AS suburb,
    ph.city                                AS city,
    ph.phone                               AS phone,
    ph.lat                                 AS lat,
    ph.lng                                 AS lng,
    d.id                                   AS drug_id,
    COALESCE(d.common_name, d.generic_name) AS drug_name,
    d.strength                             AS drug_strength,
    ps.unit_price                          AS unit_price,
    ps.quantity                            AS quantity,
    CASE
      WHEN ps.quantity = 0 OR NOT ps.is_available THEN 'OUT_OF_STOCK'
      WHEN ps.quantity <= ps.threshold      THEN 'LOW_STOCK'
      ELSE                                       'IN_STOCK'
    END                                    AS stock_status,
    -- Haversine distance in km
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND ph.lat IS NOT NULL AND ph.lng IS NOT NULL
      THEN ROUND(CAST(
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(ph.lat) - RADIANS(p_lat)) / 2), 2) +
          COS(RADIANS(p_lat)) * COS(RADIANS(ph.lat)) *
          POWER(SIN((RADIANS(ph.lng) - RADIANS(p_lng)) / 2), 2)
        ))
      AS NUMERIC), 1)::FLOAT8
      ELSE 0
    END                                    AS distance_km
  FROM public.pharmacy_stock ps
  JOIN public.pharmacies ph ON ph.id = ps.pharmacy_id
  JOIN public.drugs d ON d.id = ps.drug_id
  WHERE
    ph.status = 'APPROVED'
    AND (p_city IS NULL OR LOWER(ph.city) = LOWER(p_city))
    AND (
      -- Direct drug name match (handles 'Paracetamol' matching 'Paracetamol 500mg' AND vice versa)
      (d.generic_name ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || d.generic_name || '%')
      OR (d.common_name ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || d.common_name || '%')
      OR (d.strength ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || d.strength || '%')
      OR EXISTS (
        SELECT 1 FROM UNNEST(d.brand_names) bn
        WHERE bn ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || bn || '%'
      )
      OR EXISTS (
        SELECT 1 FROM UNNEST(d.search_terms) st
        WHERE st ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || st || '%'
      )
      -- Symptom-expanded keywords (split by OR)
      OR (v_search <> p_query AND (
        d.generic_name ILIKE ANY(
          ARRAY(SELECT '%' || TRIM(kw) || '%'
                FROM UNNEST(STRING_TO_ARRAY(v_search, ' OR ')) AS kw)
        )
        OR d.common_name ILIKE ANY(
          ARRAY(SELECT '%' || TRIM(kw) || '%'
                FROM UNNEST(STRING_TO_ARRAY(v_search, ' OR ')) AS kw)
        )
      ))
    )
    -- Radius filter (only if coordinates provided)
    AND (
      p_lat IS NULL OR p_lng IS NULL OR ph.lat IS NULL OR ph.lng IS NULL
      OR (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(ph.lat) - RADIANS(p_lat)) / 2), 2) +
          COS(RADIANS(p_lat)) * COS(RADIANS(ph.lat)) *
          POWER(SIN((RADIANS(ph.lng) - RADIANS(p_lng)) / 2), 2)
        )) <= p_radius_km
      )
    )
  ORDER BY distance_km ASC, ps.unit_price ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.find_nearby_pharmacies(TEXT, FLOAT8, FLOAT8, FLOAT8, TEXT)
  TO anon, authenticated;

-- 7. RPC: get_symptom_suggestions
-- Returns suggested drug names for a symptom query (for SmartEmptyState)
DROP FUNCTION IF EXISTS public.get_symptom_suggestions(TEXT);

CREATE OR REPLACE FUNCTION public.get_symptom_suggestions(p_query TEXT)
RETURNS TABLE (
  symptom_detected  BOOLEAN,
  suggested_drugs   TEXT[],
  suggested_query   TEXT,
  tip               TEXT
) AS $$
DECLARE
  v_lower TEXT := LOWER(TRIM(p_query));
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN v_lower ILIKE '%running stomach%' OR v_lower ILIKE '%diarrhoea%' OR v_lower ILIKE '%diarrhea%' OR v_lower ILIKE '%loose stool%' THEN TRUE
      WHEN v_lower ILIKE '%headache%' OR v_lower ILIKE '%head pain%' THEN TRUE
      WHEN v_lower ILIKE '%fever%' OR v_lower ILIKE '%temperature%' OR v_lower ILIKE '%malaria%' THEN TRUE
      WHEN v_lower ILIKE '%cough%' OR v_lower ILIKE '%cold%' OR v_lower ILIKE '%flu%' THEN TRUE
      WHEN v_lower ILIKE '%blood pressure%' OR v_lower ILIKE '%hypertension%' THEN TRUE
      WHEN v_lower ILIKE '%diabetes%' OR v_lower ILIKE '%sugar%' THEN TRUE
      WHEN v_lower ILIKE '%stomach pain%' OR v_lower ILIKE '%ulcer%' OR v_lower ILIKE '%heartburn%' THEN TRUE
      WHEN v_lower ILIKE '%pain%' OR v_lower ILIKE '%ache%' THEN TRUE
      ELSE FALSE
    END AS symptom_detected,

    CASE
      WHEN v_lower ILIKE '%running stomach%' OR v_lower ILIKE '%diarrhoea%' OR v_lower ILIKE '%diarrhea%' THEN ARRAY['ORS', 'Loperamide', 'Metronidazole']
      WHEN v_lower ILIKE '%headache%' THEN ARRAY['Paracetamol', 'Ibuprofen', 'Aspirin']
      WHEN v_lower ILIKE '%fever%' OR v_lower ILIKE '%malaria%' THEN ARRAY['Paracetamol', 'Coartem', 'Artemether']
      WHEN v_lower ILIKE '%cough%' OR v_lower ILIKE '%cold%' THEN ARRAY['Amoxicillin', 'Bromhexine', 'Cetirizine']
      WHEN v_lower ILIKE '%blood pressure%' OR v_lower ILIKE '%hypertension%' THEN ARRAY['Amlodipine', 'Losartan', 'Enalapril']
      WHEN v_lower ILIKE '%diabetes%' THEN ARRAY['Metformin', 'Glibenclamide']
      WHEN v_lower ILIKE '%stomach pain%' OR v_lower ILIKE '%heartburn%' THEN ARRAY['Omeprazole', 'Antacid', 'Ranitidine']
      WHEN v_lower ILIKE '%pain%' THEN ARRAY['Paracetamol', 'Ibuprofen', 'Diclofenac']
      ELSE ARRAY[]::TEXT[]
    END AS suggested_drugs,

    CASE
      WHEN v_lower ILIKE '%running stomach%' OR v_lower ILIKE '%diarrhea%' THEN 'ORS'
      WHEN v_lower ILIKE '%headache%' THEN 'Paracetamol'
      WHEN v_lower ILIKE '%fever%' OR v_lower ILIKE '%malaria%' THEN 'Coartem'
      WHEN v_lower ILIKE '%cough%' THEN 'Amoxicillin'
      WHEN v_lower ILIKE '%blood pressure%' THEN 'Amlodipine'
      WHEN v_lower ILIKE '%diabetes%' THEN 'Metformin'
      WHEN v_lower ILIKE '%heartburn%' THEN 'Omeprazole'
      ELSE p_query
    END AS suggested_query,

    CASE
      WHEN v_lower ILIKE '%running stomach%' OR v_lower ILIKE '%diarrhea%' THEN 'For diarrhoea, ORS (Oral Rehydration Salts) is the first-line treatment to prevent dehydration. Always consult a pharmacist.'
      WHEN v_lower ILIKE '%headache%' THEN 'Paracetamol is the recommended first-line treatment for headaches. If headaches are frequent, consult a doctor.'
      WHEN v_lower ILIKE '%fever%' OR v_lower ILIKE '%malaria%' THEN 'Any fever in Zimbabwe should be taken seriously as malaria risk. Seek a rapid diagnostic test first.'
      WHEN v_lower ILIKE '%cough%' THEN 'Most coughs are viral and do not need antibiotics. See a pharmacist for appropriate symptom relief.'
      ELSE 'Always consult a qualified pharmacist or doctor before taking any medication.'
    END AS tip;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_symptom_suggestions(TEXT)
  TO anon, authenticated;

-- ##################################################################
-- DONE. Verify by running:
--   SELECT * FROM find_nearby_pharmacies('paracetamol', -17.8292, 31.0522, 50, 'Harare');
--   SELECT * FROM get_symptom_suggestions('running stomach');
-- ##################################################################
