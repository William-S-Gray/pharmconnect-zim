-- ##################################################################
-- SMART SEARCH SYSTEM MIGRATION & RLS FIX (PharmConnect Phase 3)
-- PLEASE RUN THIS SCRIPT IN SUPABASE SQL EDITOR
-- ##################################################################

-- 1. Fix the 500 Internal Server error (syntax error in is_super_admin)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    COALESCE((auth.jwt() ->> 'email'), '') = 'graywilliamwiltino@gmail.com'
    OR
    COALESCE((auth.jwt() -> 'user_metadata' ->> 'role'), '') = 'super_admin'
    OR
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2. Create smart search logs table
CREATE TABLE IF NOT EXISTS public.smart_search_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  query TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  city TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.smart_search_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read the logs
CREATE POLICY "Super admins can read search logs" ON public.smart_search_logs
FOR SELECT USING (public.is_super_admin());

-- The logging RPC operates as security definer to bypass RLS for inserting
CREATE OR REPLACE FUNCTION public.log_smart_search(
  p_query TEXT,
  p_intent TEXT,
  p_city TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.smart_search_logs (query, detected_intent, city, user_id)
  VALUES (p_query, p_intent, p_city, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Create Intent Detection RPC
-- This uses local keyword mapping, making it entirely free and instant
CREATE OR REPLACE FUNCTION public.detect_search_intent(p_query TEXT)
RETURNS jsonb AS $$
DECLARE
  q TEXT := lower(trim(p_query));
  word_count INT := array_length(regexp_split_to_array(q, '\s+'), 1);
  v_intent TEXT := 'UNKNOWN';
  drug_match BOOLEAN;
BEGIN
  -- 1. Check if complex phrase
  IF word_count > 3 OR q ILIKE '%pain%' OR q ILIKE '%hurting%' OR q ILIKE '%hurt%' OR q ILIKE '%leaking%' OR q ILIKE '%cramp%' OR q ILIKE '%ache%' THEN
    v_intent := 'SYMPTOM_COMPLEX';
    RETURN json_build_object('intent', v_intent);
  END IF;

  -- 2. Check if clear symptom
  IF q IN ('headache', 'fever', 'malaria', 'cold', 'flu', 'cough', 'diarrhea', 'diarrhoea', 'running stomach') THEN
    v_intent := 'SYMPTOM_CLEAR';
    RETURN json_build_object('intent', v_intent);
  END IF;

  -- 3. Check if drug match exactly
  SELECT EXISTS(SELECT 1 FROM public.drugs WHERE lower(name) = q OR lower(generic_name) = q) INTO drug_match;
  IF drug_match THEN
    v_intent := 'DRUG';
    RETURN json_build_object('intent', v_intent);
  END IF;

  -- 4. Check fuzzy drug match
  SELECT EXISTS(SELECT 1 FROM public.drugs WHERE lower(name) ILIKE '%' || q || '%' OR lower(generic_name) ILIKE '%' || q || '%') INTO drug_match;
  IF drug_match THEN
    v_intent := 'DRUG';
    RETURN json_build_object('intent', v_intent);
  END IF;

  -- Return UNKNOWN
  RETURN json_build_object('intent', v_intent);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
