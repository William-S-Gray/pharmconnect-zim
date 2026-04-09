-- Recreate the Super Admin User
DO $$
DECLARE
  new_admin_id uuid := gen_random_uuid();
  admin_email text := 'graywilliamwiltino@gmail.com';
BEGIN
  -- 1. Insert into auth.users
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, 
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) VALUES (
    new_admin_id, '00000000-0000-0000-0000-000000000000', admin_email,
    crypt('SuperAdmin123!', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"name": "Super Admin"}',
    'authenticated', 'authenticated', now(), now()
  );

  -- 2. Insert into public.profiles to guarantee no zombie cleanups delete this again
  INSERT INTO public.profiles (
    id, email, full_name, global_role, lifecycle_status
  ) VALUES (
    new_admin_id, admin_email, 'Super Admin', 'super_admin', 'ACTIVE'
  )
  ON CONFLICT (id) DO UPDATE 
  SET global_role = 'super_admin', lifecycle_status = 'ACTIVE';

END $$;
