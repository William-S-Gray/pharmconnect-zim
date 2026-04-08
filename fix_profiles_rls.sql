-- In case it was an RLS 401/403 pretending to be 401, or you are testing as a Pharmacy Admin:
CREATE POLICY "Pharmacy admins can manage their own pharmacy profiles" ON public.profiles
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
        AND m.role = 'pharmacy_admin'
    )
);
