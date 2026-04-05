-- ##################################################################
-- FIX: Supabase RLS Infinite Recursion
-- ##################################################################

-- 1. Create a SECURITY DEFINER function to check for Super Admin status
-- This bypasses RLS and prevents infinite recursion.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND global_role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update Profiles Policies
DROP POLICY IF EXISTS "Super Admins can read all profiles" ON public.profiles;
CREATE POLICY "Super Admins can read all profiles" 
ON public.profiles 
FOR SELECT 
USING (public.is_super_admin());

-- 3. Update Memberships Policies
DROP POLICY IF EXISTS "Super Admins can manage all memberships" ON public.memberships;
CREATE POLICY "Super Admins can manage all memberships" 
ON public.memberships 
FOR ALL 
USING (public.is_super_admin());

-- 4. Verify other policies that might trigger recursion indirectly
-- (The following are already safe because they use memberships which depends on profiles, 
-- but now that profiles is safe, everything else is too)
