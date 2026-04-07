-- Function to securely delete a user from auth.users (requires Super Admin)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verify caller is super admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Requires super_admin privileges to purge auth.users';
  END IF;

  -- Delete from auth.users
  -- If you have ON DELETE CASCADE set up for profiles, it will auto-delete the profile.
  -- Even if you don't, manually deleting auth.users is safe and will remove the credential.
  
  -- We also clean up the profile explicitly just in case CASCADE isn't enabled
  DELETE FROM public.memberships WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  
  -- Delete the auth user
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;
