-- RPC to fetch complete user auth context in one round-trip
CREATE OR REPLACE FUNCTION get_user_auth_data(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile JSONB;
  v_membership JSONB;
BEGIN
  -- 1. Fetch Profile
  SELECT jsonb_build_object(
    'id', id,
    'email', email,
    'full_name', full_name,
    'global_role', global_role
  ) INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- 2. Fetch Membership and Pharmacy Details
  SELECT jsonb_build_object(
    'role', m.role,
    'pharmacy_id', m.pharmacy_id,
    'pharmacy', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'email', p.email,
      'phone', p.phone,
      'city', p.city,
      'suburb', p.suburb,
      'status', p.status,
      'plan_tier', p.plan_tier,
      'lat', p.lat,
      'lng', p.lng
    )
  ) INTO v_membership
  FROM public.memberships m
  JOIN public.pharmacies p ON m.pharmacy_id = p.id
  WHERE m.user_id = p_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'membership', v_membership
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
