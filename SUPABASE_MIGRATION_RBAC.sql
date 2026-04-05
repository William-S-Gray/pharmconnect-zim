-- ##################################################################
-- SUPABASE MIGRATION: Multi-Tenant RBAC & Real-time Discovery
-- ##################################################################

-- 1. EXTENSIONS & TYPES
-- ##################################################################
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Roles
-- Type: user_role (super_admin, pharmacy_admin, pharmacy_staff)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'pharmacy_admin', 'pharmacy_staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. CORE TABLES (MODIFIED & NEW)
-- ##################################################################

-- Table: Profiles (linked to Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    global_role user_role DEFAULT 'pharmacy_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Pharmacies (Decoupled from Auth)
CREATE TABLE IF NOT EXISTS public.pharmacies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Harare',
    suburb TEXT,
    phone TEXT,
    email TEXT UNIQUE NOT NULL,
    mcaz_license TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
    plan_tier TEXT DEFAULT 'FREE' CHECK (plan_tier IN ('FREE', 'BASIC', 'PRO')),
    is_open_24h BOOLEAN DEFAULT false,
    operating_hours JSONB,
    lat FLOAT8,
    lng FLOAT8,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Memberships (Users -> Pharmacies)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
    role user_role NOT NULL DEFAULT 'pharmacy_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, pharmacy_id)
);

-- Table: Drug Requests (Patient -> Pharmacy)
CREATE TABLE IF NOT EXISTS public.drug_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
    drug_id UUID REFERENCES public.drugs(id) ON DELETE CASCADE NOT NULL,
    sender_name TEXT NOT NULL,
    sender_contact TEXT NOT NULL,
    status TEXT DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'COMPLETED')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Pending Approvals (Staff CRUD)
CREATE TABLE IF NOT EXISTS public.pending_approvals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
    requester_id UUID REFERENCES auth.users(id) NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE')),
    table_name TEXT NOT NULL,
    target_id UUID, -- ID of the record being edited/deleted
    payload JSONB NOT NULL, -- New data to be applied
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Notifications (Persistent Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INFO', 'WARNING', 'REQUEST', 'APPROVAL')),
    is_read BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. REALTIME CONFIGURATION
-- ##################################################################
-- Enable Realtime for notifications and drug_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_approvals;

-- 4. ROW-LEVEL SECURITY (RLS)
-- ##################################################################
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ** Admin Check Function (Prevents Recursion) **
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

-- ** Profiles Policies **
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Super Admins can read all profiles" ON public.profiles FOR SELECT USING (public.is_super_admin());

-- ** Memberships Policies **
CREATE POLICY "Users can read own memberships" ON public.memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Super Admins can manage all memberships" ON public.memberships FOR ALL USING (public.is_super_admin());

-- ** Drug Requests Policies **
CREATE POLICY "Pharmacies can read own requests" ON public.drug_requests FOR SELECT USING (EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND pharmacy_id = drug_requests.pharmacy_id));
CREATE POLICY "Public can insert requests" ON public.drug_requests FOR INSERT WITH CHECK (true);

-- ** Pending Approvals Policies **
CREATE POLICY "Pharmacy members can read own pending approvals" ON public.pending_approvals FOR SELECT USING (EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND pharmacy_id = pending_approvals.pharmacy_id));
CREATE POLICY "Staff can insert pending approvals" ON public.pending_approvals FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND pharmacy_id = pending_approvals.pharmacy_id));
CREATE POLICY "Admin can update pending approvals" ON public.pending_approvals FOR UPDATE USING (EXISTS (SELECT 1 FROM public.memberships WHERE user_id = auth.uid() AND pharmacy_id = pending_approvals.pharmacy_id AND role = 'pharmacy_admin'));

-- ** Notifications Policies **
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id OR pharmacy_id IN (SELECT pharmacy_id FROM public.memberships WHERE user_id = auth.uid()));
CREATE POLICY "Users can dismiss own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. AUTOMATED PROFILE TRIGGER
-- ##################################################################
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, global_role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', ''), 'pharmacy_staff');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_v2 ON auth.users;
CREATE TRIGGER on_auth_user_created_v2 AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();

-- 6. SUPER ADMIN PROVISIONING
-- ##################################################################
-- Note: Replace with the actual email provided by user
UPDATE public.profiles SET global_role = 'super_admin' WHERE email = 'graywilliamwiltino@gmail.com';
