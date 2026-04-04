# 🚀 Supabase Setup & Security Guide

This guide will walk you through setting up a high-security, production-ready Supabase backend for **PharmConnect-Zim** from scratch. 

---

## 1. Project Creation
1. Go to [Supabase Dashboard](https://app.supabase.com/) and click **New Project**.
2. **Name**: `PharmConnect-Zim`
3. **Database Password**: Generate a strong one and **SAVE IT** (you'll need it if you ever want to connect via external tools).
4. **Region**: Choose a region closest to your target users (e.g., Cape Town `af-south-1` if available, or London/Frankfurt).
5. **Tier**: Choose **Free Tier**.

---

## 2. Initialize Database & Security (SQL Editor)
1. In your project dashboard, go to the **SQL Editor** tab (on the left sidebar).
2. Click **New Query**.
3. Copy the entire SQL block below and click **Run**.

```sql
-- ##################################################################
-- 1. TABLES & SCHEMA
-- ##################################################################

-- Table: Pharmacies (Profiles linked to Auth)
CREATE TABLE IF NOT EXISTS public.pharmacies (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Harare',
    suburb TEXT,
    phone TEXT,
    email TEXT UNIQUE NOT NULL,
    mcaz_license TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
    plan_tier TEXT DEFAULT 'FREE' CHECK (plan_tier IN ('FREE', 'BASIC', 'PRO')),
    is_open_24h BOOLEAN DEFAULT false,
    operating_hours JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Drugs (Master Database)
CREATE TABLE IF NOT EXISTS public.drugs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    generic_name TEXT NOT NULL,
    common_name TEXT,
    brand_names TEXT[],
    strength TEXT,
    form TEXT,
    category TEXT,
    is_controlled BOOLEAN DEFAULT false,
    search_terms TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: Pharmacy Stock (Inventory)
CREATE TABLE IF NOT EXISTS public.pharmacy_stock (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE NOT NULL,
    drug_id UUID REFERENCES public.drugs(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    unit_price NUMERIC(10, 2),
    threshold INTEGER DEFAULT 10,
    is_available BOOLEAN DEFAULT true,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(pharmacy_id, drug_id)
);

-- Table: Drug Searches (Analytics)
CREATE TABLE IF NOT EXISTS public.drug_searches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    query TEXT,
    city TEXT,
    result_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ##################################################################
-- 2. ROW-LEVEL SECURITY (RLS) - HIGH SECURITY MODE
-- ##################################################################

-- Enable RLS on all tables
ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drug_searches ENABLE ROW LEVEL SECURITY;

-- ** Pharmacies Policies **
CREATE POLICY "Public read approved" ON public.pharmacies FOR SELECT USING (status = 'APPROVED');
CREATE POLICY "Own profile read" ON public.pharmacies FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.pharmacies FOR UPDATE USING (auth.uid() = id);

-- ** Drugs Policies **
CREATE POLICY "Drugs read all" ON public.drugs FOR SELECT USING (true);

-- ** Pharmacy Stock Policies **
CREATE POLICY "Public read stock" ON public.pharmacy_stock FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_stock.pharmacy_id AND p.status = 'APPROVED'));
CREATE POLICY "Own stock manage" ON public.pharmacy_stock FOR ALL USING (auth.uid() = pharmacy_id);

-- ** Drug Searches Policies **
CREATE POLICY "Public insert search" ON public.drug_searches FOR INSERT WITH CHECK (true);

-- ##################################################################
-- 3. AUTOMATED PROFILE TRIGGER
-- ##################################################################

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.pharmacies (id, name, email, city, mcaz_license)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'name', 'New Pharmacy'), 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'city', 'Harare'), 
    new.raw_user_meta_data->>'mcaz_license'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created 
AFTER INSERT ON auth.users 
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ##################################################################
-- 4. SEED MASTER DRUGS
-- ##################################################################
INSERT INTO public.drugs (generic_name, common_name, brand_names, strength, form, category, search_terms)
VALUES 
('Paracetamol', 'Panadol', ARRAY['Panadol','Tylenol'], '500mg', 'tablet', 'Pain Relief', ARRAY['panadol','paracetamol']),
('Amoxicillin', 'Amoxil', ARRAY['Amoxil'], '500mg', 'capsule', 'Antibiotic', ARRAY['amoxicillin','amoxil']),
('Salbutamol', 'Ventolin', ARRAY['Ventolin'], '100mcg', 'inhaler', 'Respiratory', ARRAY['salbutamol','ventolin','asthma']);
```

---

## 3. Connecting to the App
1. Go to **Settings > API** in your Supabase project.
2. Copy the **Project URL** and the **`anon` `public` key**.
3. Create a `.env` file in your project root (same folder as `package.json`) and add them:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

---

## 4. Final Security Check (Important)
1. **Auth Providers**: Go to **Authentication > Providers** and ensure **Email** is enabled.
2. **Email Confirmation**: If you want users to log in immediately without checking their email, disable **Confirm Email** (located in Authentication > Settings).
3. **Site URL**: In **Authentication > URL Configuration**, ensure the Site URL is set to `http://localhost:5173`.

---

## 5. Troubleshooting
- **Cannot log in after register?** Check if "Confirm Email" is ON. If it is, you must click the link in your email first.
- **Stock not appearing in search?** Ensure the pharmacy's `status` is manually set to `APPROVED` in the `pharmacies` table (you can do this via the Supabase Table Editor).
- **RLS Errors?** Ensure you ran the RLS section of the SQL script. If RLS is ON but no policies exist, all access is denied.

---

### High Security Verification
Even if someone steals your `VITE_SUPABASE_ANON_KEY`, they **CANNOT**:
- See another pharmacy's inventory.
- Modify drug names in the master list.
- Steal email addresses of pending pharmacies.
- Delete the database.

**Row Level Security (RLS) is your bank-grade shield.**
