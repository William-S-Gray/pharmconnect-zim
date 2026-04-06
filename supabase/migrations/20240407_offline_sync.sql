-- Migration: Offline Sync & Conflicts Support
-- Created at: 2026-04-06

-- 1. Create Sync Conflicts table
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    pharmacy_id UUID REFERENCES pharmacies(id),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    local_data JSONB NOT NULL,
    server_data JSONB NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'DISCARDED')),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add last_synced_at to profiles and pharmacies for better tracking if needed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- 3. Ensure updated_at exists and has a trigger for conflict detection
-- Assuming inventory and pharmacies tables already have it, but let's be safe.

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to pharmacies
DO $$ BEGIN
    ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_pharmacies_modtime ON pharmacies;
CREATE TRIGGER update_pharmacies_modtime BEFORE UPDATE ON pharmacies FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Apply to inventory (if exists)
DO $$ BEGIN
    ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_inventory_modtime ON inventory;
CREATE TRIGGER update_inventory_modtime BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- 4. Enable RLS
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;

-- 5. Policies
CREATE POLICY "Users can see conflicts for their pharmacy" ON sync_conflicts
    FOR SELECT USING (
        pharmacy_id IN (
            SELECT pharmacy_id FROM memberships WHERE user_id = auth.uid()
        ) OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Admins can resolve conflicts" ON sync_conflicts
    FOR UPDATE USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );
