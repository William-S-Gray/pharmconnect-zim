-- 1. Enable RLS on Drugs
ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies
DROP POLICY IF EXISTS "Super admins can manage drugs" ON public.drugs;
DROP POLICY IF EXISTS "Everyone can read drugs" ON public.drugs;
DROP POLICY IF EXISTS "Allow super admins to manage drugs" ON public.drugs;

-- 3. Create new policies
CREATE POLICY "Super admins can manage drugs" ON public.drugs
FOR ALL USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Everyone can read drugs" ON public.drugs
FOR SELECT USING (true);

-- 4. Fix profile relationship (Allow PostgREST to join profiles and memberships)
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_user_id_fkey;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. Add lifecycle_status to profiles if missing (Safeguard)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 6. Super Admin Policies for Pharmacies and Profiles
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admins can manage pharmacies" ON public.pharmacies;
CREATE POLICY "Super admins can manage pharmacies" ON public.pharmacies
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can manage medical profiles" ON public.profiles;
CREATE POLICY "Super admins can manage medical profiles" ON public.profiles
FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can delete profiles" ON public.profiles;
CREATE POLICY "Super admins can delete profiles" ON public.profiles
FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can delete pharmacies" ON public.pharmacies;
CREATE POLICY "Super admins can delete pharmacies" ON public.pharmacies
FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS "Everyone can read active pharmacies" ON public.pharmacies;
CREATE POLICY "Everyone can read active pharmacies" ON public.pharmacies
FOR SELECT USING (lifecycle_status = 'ACTIVE' OR public.is_super_admin());
