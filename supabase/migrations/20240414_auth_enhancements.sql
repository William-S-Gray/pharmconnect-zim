-- 1. Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create Invitations Table
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
    role user_role DEFAULT 'pharmacy_staff',
    invited_by UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(email, pharmacy_id)
);

-- 3. Configure RLS for Invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all invitations
CREATE POLICY "Super admins can manage all invitations" ON public.invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND global_role = 'super_admin'
        )
    );

-- Pharmacy admins can manage invitations for their own pharmacy
CREATE POLICY "Pharmacy admins can manage their pharmacy invitations" ON public.invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.memberships
            WHERE user_id = auth.uid() 
            AND pharmacy_id = invitations.pharmacy_id 
            AND role = 'pharmacy_admin'
        )
    );

-- Users can read invitations sent to their email
CREATE POLICY "Users can read own invitations" ON public.invitations
    FOR SELECT USING (
        email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- 4. Grant permissions
GRANT ALL ON public.invitations TO authenticated;
