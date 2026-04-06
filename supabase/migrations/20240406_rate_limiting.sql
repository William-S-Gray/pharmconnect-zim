-- Migration: Rate Limiting for Login attempts
-- Description: Tracks failed login attempts and enforces a limit of 5 attempts per 15 minutes.

-- Create a table to track login attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    ip_address TEXT,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    success BOOLEAN DEFAULT false
);

-- Index for faster lookups on recent attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempted_at DESC);

-- Enable RLS but restrict access (only service role or matching email if authenticated, though login is usually anon)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow the authenticated user to see their own attempt history (optional, for security audit pages)
CREATE POLICY "Users can view their own login attempts" 
ON public.login_attempts 
FOR SELECT 
USING (auth.jwt() ->> 'email' = email);

-- Function to check if a user is rate limited
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_email TEXT, p_ip TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    attempt_count INTEGER;
    max_attempts CONSTANT INTEGER := 5;
    interval_minutes CONSTANT INTERVAL := '15 minutes';
BEGIN
    -- Count failed attempts in the last 15 minutes
    SELECT count(*)
    INTO attempt_count
    FROM public.login_attempts
    WHERE (email = p_email OR (p_ip IS NOT NULL AND ip_address = p_ip))
      AND success = false
      AND attempted_at > now() - interval_minutes;

    IF attempt_count >= max_attempts THEN
        RETURN false; -- Rate limited
    END IF;

    RETURN true; -- Not rate limited
END;
$$;

-- Function to log a login attempt
CREATE OR REPLACE FUNCTION public.log_login_attempt(p_email TEXT, p_success BOOLEAN, p_ip TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.login_attempts (email, success, ip_address)
    VALUES (p_email, p_success, p_ip);
END;
$$;
