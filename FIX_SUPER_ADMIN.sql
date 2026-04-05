-- Fix: Provision profile for manually created auth user using explicit types and known ID
INSERT INTO public.profiles (id, email, full_name, global_role)
VALUES (
  '9aa15019-a224-4804-a524-6c5df82add6f', 
  'graywilliamwiltino@gmail.com', 
  'System Admin', 
  'super_admin'::user_role
)
ON CONFLICT (id) DO UPDATE 
SET global_role = 'super_admin'::user_role;
