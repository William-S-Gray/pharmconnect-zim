-- 1. Ensure whatsapp_number column exists in pharmacies
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pharmacies' AND column_name = 'whatsapp_number') THEN
        ALTER TABLE pharmacies ADD COLUMN whatsapp_number TEXT;
    END IF;
END $$;

-- 2. Allow PUBLIC (anon) access to view pharmacies
-- Drop existing public read policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Public pharmacies are viewable by everyone" ON pharmacies;
CREATE POLICY "Public pharmacies are viewable by everyone" 
ON pharmacies FOR SELECT 
USING (true);

-- 3. Allow PUBLIC (anon) access to view pharmacy_stock
DROP POLICY IF EXISTS "Public pharmacy stock is viewable by everyone" ON pharmacy_stock;
CREATE POLICY "Public pharmacy stock is viewable by everyone" 
ON pharmacy_stock FOR SELECT 
USING (true);

-- 4. Ensure anon role has SELECT permissions
GRANT SELECT ON pharmacies TO anon;
GRANT SELECT ON pharmacy_stock TO anon;
GRANT SELECT ON drugs TO anon;

-- 5. Enable RLS (just in case it's off but restricted)
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;
