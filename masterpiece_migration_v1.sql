-- ##################################################################
-- PHARMCONNECT MASTERPIECE MIGRATION (Phase 2 & 3)
-- ##################################################################

-- 1. Upgrade drug_reservations with Delivery & Payment Support
ALTER TABLE public.drug_reservations 
  ADD COLUMN IF NOT EXISTS delivery_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'NOT_STARTED'
    CHECK (delivery_status IN ('NOT_STARTED', 'PENDING_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'FAILED')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED', 'ESCROW_LOCKED')),
  ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;

-- 2. Create Escrow Transactions Table
CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reservation_id  UUID REFERENCES public.drug_reservations(id) ON DELETE CASCADE NOT NULL,
  pharmacy_id     UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  platform_fee    NUMERIC(10,2) DEFAULT 0, -- e.g. amount * 0.02
  status          TEXT DEFAULT 'AWAITING_PAYMENT'
                  CHECK (status IN ('AWAITING_PAYMENT', 'ESCROW_LOCKED', 'ESCROW_RELEASED', 'REFUNDED')),
  paynow_reference TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS for escrow (Admin and Pharmacy only)
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pharmacy admins can see their escrow"
  ON public.escrow_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
    AND pharmacy_id = escrow_transactions.pharmacy_id
  ));

-- 3. B2B Wholesale Demand Heatmaps (Phase 3)
-- Materialized view to identify "Dry Zones" (High searches, low stock)
CREATE MATERIALIZED VIEW IF NOT EXISTS b2b_demand_heatmap AS
SELECT 
  DATE_TRUNC('hour', created_at) AS hour_bucket,
  city,
  query AS drug_search,
  COUNT(*) AS search_volume,
  SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) AS unfulfilled_demand
FROM public.drug_searches
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_b2b_demand_heatmap 
ON b2b_demand_heatmap (hour_bucket, city, drug_search);

-- 4. Geo-Spatial Indexing Upgrade (Phase 4 groundwork)
-- Add GIST index to pharmacies if not exists for lightning fast postgis searches
-- (Assuming PostGIS was enabled in earlier migrations)
-- ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);
-- UPDATE public.pharmacies SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326) WHERE lat IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_pharmacies_geom ON public.pharmacies USING GIST (geom);
