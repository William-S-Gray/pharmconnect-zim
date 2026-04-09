-- ##################################################################
-- DATABASE REPAIR MIGRATION
-- Run this in the Supabase SQL Editor to fix 500 errors and state desync.
-- ##################################################################

-- 1. Ensure Lifecycle Columns exist (Idempotent)
DO $$ 
BEGIN
    -- profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'lifecycle_status') THEN
        ALTER TABLE public.profiles ADD COLUMN lifecycle_status TEXT DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'trashed_at') THEN
        ALTER TABLE public.profiles ADD COLUMN trashed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'deleted_at') THEN
        ALTER TABLE public.profiles ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- pharmacies
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pharmacies' AND column_name = 'lifecycle_status') THEN
        ALTER TABLE public.pharmacies ADD COLUMN lifecycle_status TEXT DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pharmacies' AND column_name = 'trashed_at') THEN
        ALTER TABLE public.pharmacies ADD COLUMN trashed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pharmacies' AND column_name = 'deleted_at') THEN
        ALTER TABLE public.pharmacies ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 2. Repair Realtime Publication (Idempotent)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'delete_requests'
    ) THEN
        RAISE NOTICE 'Table delete_requests already in publication';
    ELSE
        -- Ensure table exists first
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'delete_requests') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.delete_requests;
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not modify publication: %', SQLERRM;
END $$;

-- 3. Fix Infinite Recursion in is_super_admin()
-- Checks JWT metadata instead of querying the profiles table.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    COALESCE((auth.jwt() ->> 'email'), '') = 'graywilliamwiltino@gmail.com'
    OR
    COALESCE((auth.jwt() -> 'user_metadata' ->> role), '') = 'super_admin'
    OR
    COALESCE((auth.jwt() -> 'app_metadata' ->> role), '') = 'super_admin'
    OR
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    OR
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Re-apply RLS Policies to use the non-recursive function
-- Pharmacies
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone can read active pharmacies" ON public.pharmacies;
CREATE POLICY "Everyone can read active pharmacies" ON public.pharmacies
FOR SELECT USING (lifecycle_status = 'ACTIVE' OR public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can manage pharmacies" ON public.pharmacies;
CREATE POLICY "Super admins can manage pharmacies" ON public.pharmacies
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins can manage medical profiles" ON public.profiles;
CREATE POLICY "Super admins can manage medical profiles" ON public.profiles
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 5. Helper function for audit logging (Ensuring it exists)
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_event_type TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_user_id UUID DEFAULT auth.uid(),
    p_ip TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, metadata, user_id, ip_address)
    VALUES (p_event_type, p_metadata, p_user_id, p_ip);
EXCEPTION WHEN OTHERS THEN
    -- Fallback if audit_logs table is missing or errors
    RAISE NOTICE 'Audit log failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
