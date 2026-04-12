-- ##################################################################
-- PHARMCONNECT GEOSPATIAL UPGRADE (Phase 4)
-- ##################################################################

-- 1. Enable PostGIS (essential for spatial indexing)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add Geography and H3 columns to pharmacies
ALTER TABLE public.pharmacies 
  ADD COLUMN IF NOT EXISTS location_geog GEOGRAPHY(POINT, 4326),
  ADD COLUMN IF NOT EXISTS h3_index_res8 TEXT;

-- 3. Backfill location_geog from existing lat/lng
UPDATE public.pharmacies 
SET location_geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location_geog IS NULL;

-- 4. Create Spatial Indices
CREATE INDEX IF NOT EXISTS idx_pharmacies_location_geog ON public.pharmacies USING GIST (location_geog);
CREATE INDEX IF NOT EXISTS idx_pharmacies_h3_index_res8 ON public.pharmacies (h3_index_res8);

-- 5. Find Nearby Pharmacies V2 (PostGIS Optimized)
-- This replaces the manual Haversine math with ST_DWithin and the <-> distance operator
DROP FUNCTION IF EXISTS public.find_nearby_pharmacies_v2(TEXT, FLOAT8, FLOAT8, FLOAT8, TEXT);

CREATE OR REPLACE FUNCTION public.find_nearby_pharmacies_v2(
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
  v_search_geog GEOGRAPHY;
BEGIN
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_search_geog := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  END IF;

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
    -- Distance using PostGIS (meters to km)
    CASE 
      WHEN v_search_geog IS NOT NULL THEN (ST_Distance(ph.location_geog, v_search_geog) / 1000)::FLOAT8
      ELSE 0
    END AS distance_km
  FROM public.pharmacy_stock ps
  JOIN public.pharmacies ph ON ph.id = ps.pharmacy_id
  JOIN public.drugs d ON d.id = ps.drug_id
  WHERE
    ph.status = 'APPROVED'
    AND (p_city IS NULL OR LOWER(ph.city) = LOWER(p_city))
    -- Use PostGIS index for radius filter
    AND (
      v_search_geog IS NULL 
      OR ST_DWithin(ph.location_geog, v_search_geog, p_radius_km * 1000)
    )
    AND (
      (d.generic_name ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || d.generic_name || '%')
      OR (d.common_name ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || d.common_name || '%')
      OR EXISTS (
        SELECT 1 FROM UNNEST(d.brand_names) bn
        WHERE bn ILIKE '%' || p_query || '%' OR p_query ILIKE '%' || bn || '%'
      )
    )
  ORDER BY distance_km ASC, ps.unit_price ASC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
