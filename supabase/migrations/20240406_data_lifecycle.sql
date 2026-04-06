-- 1. Audit Logging Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    event_type TEXT NOT NULL, -- 'user_created', 'pharmacy_trashed', etc.
    user_id UUID REFERENCES auth.users(id),
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Delete Requests Table (for User -> Admin workflow)
CREATE TABLE IF NOT EXISTS public.delete_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    requester_id UUID REFERENCES auth.users(id),
    pharmacy_id UUID REFERENCES public.pharmacies(id),
    target_table TEXT NOT NULL, -- 'profiles', 'pharmacies'
    target_id UUID NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DENIED'
    reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_id UUID REFERENCES auth.users(id)
);

-- 3. Add Lifecycle Columns to Main Tables
-- Adding to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Adding to pharmacies
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 4. Enable Realtime for Delete Requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.delete_requests;

-- 5. Helper Function: Log Audit Event
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_event_type TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_user_id UUID DEFAULT auth.uid(),
    p_ip TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (event_type, metadata, user_id, ip_address)
    VALUES (p_event_type, p_metadata, p_user_id, p_ip);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function: Request Deletion (Normal User)
CREATE OR REPLACE FUNCTION public.request_deletion(
    p_table TEXT,
    p_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_pharmacy_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_request_id UUID;
BEGIN
    INSERT INTO public.delete_requests (requester_id, target_table, target_id, reason, pharmacy_id)
    VALUES (auth.uid(), p_table, p_id, p_reason, p_pharmacy_id)
    RETURNING id INTO v_request_id;

    -- Update target record status to PENDING_DELETE
    EXECUTE format('UPDATE public.%I SET lifecycle_status = %L WHERE id = %L', p_table, 'PENDING_DELETE', p_id);

    -- Log Event
    PERFORM public.log_audit_event('delete_requested', jsonb_build_object('table', p_table, 'id', p_id, 'request_id', v_request_id));

    RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function: Approve Deletion (Move to Trash)
CREATE OR REPLACE FUNCTION public.approve_deletion(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_table TEXT;
    v_id UUID;
BEGIN
    SELECT target_table, target_id INTO v_table, v_id FROM public.delete_requests WHERE id = p_request_id;

    UPDATE public.delete_requests 
    SET status = 'APPROVED', reviewed_at = now(), reviewer_id = auth.uid() 
    WHERE id = p_request_id;

    EXECUTE format('UPDATE public.%I SET lifecycle_status = %L, trashed_at = now() WHERE id = %L', v_table, 'TRASHED', v_id);

    -- Log Event
    PERFORM public.log_audit_event('delete_approved', jsonb_build_object('table', v_table, 'id', v_id, 'request_id', p_request_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function: Restore from Trash (with dependency checks)
CREATE OR REPLACE FUNCTION public.restore_from_trash(p_table TEXT, p_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_pharmacy_id UUID;
    v_pharm_status TEXT;
BEGIN
    -- Special Check: If restoring a profile/membership, ensure their pharmacy is active
    IF p_table = 'profiles' OR p_table = 'memberships' THEN
        -- Attempt to find pharmacy_id associated with this user
        SELECT pharmacy_id INTO v_pharmacy_id FROM public.memberships WHERE user_id = p_id LIMIT 1;
        
        IF v_pharmacy_id IS NOT NULL THEN
            SELECT lifecycle_status INTO v_pharm_status FROM public.pharmacies WHERE id = v_pharmacy_id;
            
            IF v_pharm_status = 'TRASHED' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Parent Pharmacy is in Trash. Restore the Pharmacy first.', 'parent', 'Pharmacy');
            ELSIF v_pharm_status IS NULL THEN -- Already purged
                RETURN jsonb_build_object('success', false, 'error', 'Parent Pharmacy was permanently deleted from the system.', 'parent', 'Pharmacy');
            END IF;
        END IF;
    END IF;

    EXECUTE format('UPDATE public.%I SET lifecycle_status = %L, trashed_at = NULL WHERE id = %L', p_table, 'ACTIVE', p_id);

    PERFORM public.log_audit_event('record_restored', jsonb_build_object('table', p_table, 'id', p_id));
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function: Purge Expired Trash (Auto-delete after 48 hours)
CREATE OR REPLACE FUNCTION public.purge_expired_trash()
RETURNS VOID AS $$
BEGIN
    -- Purge Pharmacies (and cascade would ideally handle dependents if configured, or we do it manually)
    DELETE FROM public.pharmacies WHERE lifecycle_status = 'TRASHED' AND trashed_at < now() - interval '48 hours';
    
    -- Purge Profiles
    DELETE FROM public.profiles WHERE lifecycle_status = 'TRASHED' AND trashed_at < now() - interval '48 hours';

    -- Note: Real Hard deletion of auth.users from within SQL is limited. 
    -- Usually managed via an Edge Function calling Admin API or a trigger that hits an external endpoint.
    -- For now, we clear the public-facing data.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
