-- This script cleans up any "zombie" authentication records.
-- It will delete any user in 'auth.users' that does NOT have a corresponding row in 'public.profiles'.
-- Since you deleted the profile before the RPC was added, this will wipe their stuck auth record.

DELETE FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles
  WHERE public.profiles.id = auth.users.id
);
