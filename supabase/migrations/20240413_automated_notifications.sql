-- 1. Function to notify Super Admins on new pharmacy registration
CREATE OR REPLACE FUNCTION public.notify_on_new_pharmacy()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (title, message, type, user_id)
    SELECT 
        'New Pharmacy Registered',
        'Pharmacy "' || NEW.name || '" has registered and is awaiting verification.',
        'REQUEST',
        p.id
    FROM public.profiles p
    WHERE p.global_role = 'super_admin';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger for Pharmacy Registration
DROP TRIGGER IF EXISTS tr_new_pharmacy_signup ON public.pharmacies;
CREATE TRIGGER tr_new_pharmacy_signup
    AFTER INSERT ON public.pharmacies
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_new_pharmacy();

-- 3. Function to notify Pharmacy Admins on new staff membership
CREATE OR REPLACE FUNCTION public.notify_on_new_staff()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if it's a staff member being added (not the admin themselves initial membership)
    IF NEW.role = 'pharmacy_staff' THEN
        INSERT INTO public.notifications (title, message, type, pharmacy_id)
        VALUES (
            'New Staff Member Joined',
            'A new staff member has been added to your pharmacy team.',
            'INFO',
            NEW.pharmacy_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger for Staff Membership
DROP TRIGGER IF EXISTS tr_new_staff_member ON public.memberships;
CREATE TRIGGER tr_new_staff_member
    AFTER INSERT ON public.memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_new_staff();

-- 5. Enable Realtime for Notifications Table (if not already)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
