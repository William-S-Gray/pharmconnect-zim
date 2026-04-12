-- B2B Wholesale Demand Heatmaps - Materialized Views Implementation
-- Run this in Supabase SQL Editor

-- 1. Create a materialized view that aggregates searches every hour
-- Wholesalers will use this to see where to dispatch bulk stock

CREATE MATERIALIZED VIEW IF NOT EXISTS b2b_demand_heatmap AS
SELECT 
  DATE_TRUNC('hour', created_at) AS hour_bucket,
  city,
  query AS drug_search,
  COUNT(*) AS search_volume,
  -- Calculate how many of these searches resulted in 0 stock found
  SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END) AS unfulfilled_demand
FROM drug_searches
GROUP BY 1, 2, 3;

-- 2. Create index for fast B2B portal querying
CREATE UNIQUE INDEX idx_b2b_demand_heatmap 
ON b2b_demand_heatmap (hour_bucket, city, drug_search);

-- 3. Create a Postgres Function to refresh the heatmap (called by pg_cron hourly)
CREATE OR REPLACE FUNCTION refresh_b2b_demand_heatmap()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY b2b_demand_heatmap;
END;
$$ LANGUAGE plpgsql;

-- To query the dry zones (high demand, 0 stock)
-- SELECT city, drug_search, unfulfilled_demand 
-- FROM b2b_demand_heatmap 
-- WHERE unfulfilled_demand > 50 
-- ORDER BY unfulfilled_demand DESC;
