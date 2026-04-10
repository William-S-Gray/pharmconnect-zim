-- ##################################################################
-- SMART SEARCH & DRUG REQUESTS MIGRATION
-- Run this in the Supabase SQL Editor or via CLI
-- ##################################################################

CREATE TABLE IF NOT EXISTS public.drug_requests (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requested_query TEXT NOT NULL,
  city            TEXT,
  contact_info    TEXT, -- Optional WhatsApp/Phone
  status          TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REVIEWED', 'RESTOCKED', 'IGNORED')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS drug_requests_updated_at ON public.drug_requests;
CREATE TRIGGER drug_requests_updated_at
  BEFORE UPDATE ON public.drug_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS for drug_requests
ALTER TABLE public.drug_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can create a request (anonymous)
DROP POLICY IF EXISTS "Public can insert drug requests" ON public.drug_requests;
CREATE POLICY "Public can insert drug requests"
  ON public.drug_requests FOR INSERT WITH CHECK (true);

-- Only super admins can read or update all requests
DROP POLICY IF EXISTS "Super admins can manage drug requests" ON public.drug_requests;
CREATE POLICY "Super admins can manage drug requests"
  ON public.drug_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND global_role = 'super_admin'
    )
  );
