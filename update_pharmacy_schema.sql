-- 1. Make pharmacies.email nullable
ALTER TABLE public.pharmacies ALTER COLUMN email DROP NOT NULL;

-- 2. Ensure unique constraint is still there (if needed) but allows multiple NULLs
-- (Standard Postgres UNIQUE allows multiple NULLs)
ALTER TABLE public.pharmacies DROP CONSTRAINT IF EXISTS pharmacies_email_key;
ALTER TABLE public.pharmacies ADD CONSTRAINT pharmacies_email_key UNIQUE (email);
