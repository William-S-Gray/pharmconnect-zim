-- 1. Create drug_searches table for analytics
CREATE TABLE IF NOT EXISTS public.drug_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    query TEXT NOT NULL,
    city TEXT DEFAULT 'Harare',
    result_count INTEGER DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) -- Optional: link to user if logged in
);

-- 2. Add Index for fast aggregation in dashboard
CREATE INDEX IF NOT EXISTS idx_drug_searches_query ON public.drug_searches(query);
CREATE INDEX IF NOT EXISTS idx_drug_searches_city ON public.drug_searches(city);

-- 3. Configure RLS
ALTER TABLE public.drug_searches ENABLE ROW LEVEL SECURITY;

-- Anonymous users can insert (to track guest searches)
DROP POLICY IF EXISTS "Public can insert searches" ON public.drug_searches;
CREATE POLICY "Public can insert searches" ON public.drug_searches
    FOR INSERT WITH CHECK (true);

-- Only super admins can view raw search data
DROP POLICY IF EXISTS "Super admins can view searches" ON public.drug_searches;
CREATE POLICY "Super admins can view searches" ON public.drug_searches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND global_role = 'super_admin'
        )
    );

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_searches;

-- 5. Grant permissions
GRANT INSERT ON public.drug_searches TO anon, authenticated;
GRANT SELECT ON public.drug_searches TO authenticated;
