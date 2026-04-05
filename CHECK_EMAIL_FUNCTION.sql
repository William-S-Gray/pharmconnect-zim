-- ##################################################################
-- SQL FUNCTION: check_email_exists
-- Purpose: Safely check if an email already exists in auth.users
-- Usage: Called from frontend before registration
-- ##################################################################

CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE email = email_to_check);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to authenticated and anonymous users to call this function
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated;
