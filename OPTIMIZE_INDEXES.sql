-- ##################################################################
-- PERFORMANCE OPTIMIZATION: Database Indexes & Extensions
-- ##################################################################

-- 1. Enable pg_trgm for fast text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Drug Search (Core functionality)
-- ilike query on common_name and generic_name is expensive (Sequential Scan)
-- GIN pg_trgm_ops allows index-backed similarity/substring search
CREATE INDEX IF NOT EXISTS drugs_common_name_trgm_idx ON public.drugs USING gin (common_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS drugs_generic_name_trgm_idx ON public.drugs USING gin (generic_name gin_trgm_ops);

-- 3. Pharmacy Stock Lookups
-- These tables grow fast and are queried frequently in the search results
CREATE INDEX IF NOT EXISTS pharmacy_stock_pharmacy_id_idx ON public.pharmacy_stock(pharmacy_id);
CREATE INDEX IF NOT EXISTS pharmacy_stock_drug_id_idx ON public.pharmacy_stock(drug_id);
-- Compound index for filtered queries in search
CREATE INDEX IF NOT EXISTS pharmacy_stock_is_available_idx ON public.pharmacy_stock(is_available);

-- 4. User Membership & RBAC
-- Frequent joins on user_id and pharmacy_id
CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_pharmacy_id_idx ON public.memberships(pharmacy_id);

-- 5. Notifications & Pending Approvals
-- Partial index for 'unread' notifications (usually what we fetch)
CREATE INDEX IF NOT EXISTS notifications_user_id_is_unread_idx ON public.notifications(user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS pending_approvals_pharmacy_id_status_idx ON public.pending_approvals(pharmacy_id, status);

-- 6. Analytics (Search Logs)
CREATE INDEX IF NOT EXISTS drug_searches_created_at_idx ON public.drug_searches(created_at DESC);
