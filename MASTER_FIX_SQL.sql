-- ============================================================
-- MASTER FIX SQL — Run this in Supabase SQL Editor
-- This adds all missing columns and creates missing tables
-- ============================================================

-- 1. Fix profiles table — add all missing columns
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS biz_addr text DEFAULT '',
  ADD COLUMN IF NOT EXISTS biz_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vat_num text DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'NP',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NPR',
  ADD COLUMN IF NOT EXISTS business_mode text DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS logo_data text;

-- 2. Fix entries table — add missing columns
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS is_deposit boolean DEFAULT false;

-- 3. Fix stock_items table — add missing columns  
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS sell_price numeric DEFAULT 0;

-- 4. Fix customers table — add missing columns
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS workspace_id uuid,
  ADD COLUMN IF NOT EXISTS email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS note text DEFAULT '';

-- 5. Create invoices table if missing
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  inv_number text,
  buyer text,
  amount numeric DEFAULT 0,
  date text,
  status text DEFAULT 'unpaid',
  data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_invoices" ON invoices;
CREATE POLICY "own_invoices" ON invoices FOR ALL USING (auth.uid() = user_id);

-- 6. Create deposits table if missing
CREATE TABLE IF NOT EXISTS deposits (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  type text DEFAULT 'deposit',
  customer text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  service text DEFAULT '',
  total numeric DEFAULT 0,
  deposit_amt numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  due_date text DEFAULT '',
  start_date text DEFAULT '',
  end_date text DEFAULT '',
  notes text DEFAULT '',
  vehicle text DEFAULT '',
  rego text DEFAULT '',
  pickup text DEFAULT '',
  pickup_time text DEFAULT '',
  dropoff text DEFAULT '',
  destination text DEFAULT '',
  security numeric DEFAULT 0,
  signed boolean DEFAULT false,
  signed_date text DEFAULT '',
  signed_name text DEFAULT '',
  signature_data text DEFAULT '',
  agreement_id text,
  signing_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_deposits" ON deposits;
CREATE POLICY "own_deposits" ON deposits FOR ALL USING (auth.uid() = user_id);

-- 7. Create udharos table if missing
CREATE TABLE IF NOT EXISTS udharos (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  customer text DEFAULT '',
  phone text DEFAULT '',
  item text DEFAULT '',
  amount numeric DEFAULT 0,
  paid numeric DEFAULT 0,
  date text DEFAULT '',
  due_date text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE udharos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_udharos" ON udharos;
CREATE POLICY "own_udharos" ON udharos FOR ALL USING (auth.uid() = user_id);

-- 8. Create agreements table if missing
CREATE TABLE IF NOT EXISTS agreements (
  id text PRIMARY KEY,
  deposit_id text,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  biz_name text DEFAULT '',
  biz_addr text DEFAULT '',
  biz_phone text DEFAULT '',
  biz_logo text,
  title text DEFAULT 'Service Agreement',
  terms jsonb DEFAULT '[]',
  fields jsonb DEFAULT '{}',
  client_name text DEFAULT '',
  client_email text DEFAULT '',
  signing_token text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  signed_at timestamptz,
  signed_name text DEFAULT '',
  signature_data text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_all" ON agreements;
DROP POLICY IF EXISTS "public_read_by_token" ON agreements;
DROP POLICY IF EXISTS "public_sign" ON agreements;
CREATE POLICY "owner_all" ON agreements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "public_read_by_token" ON agreements FOR SELECT USING (true);
CREATE POLICY "public_sign" ON agreements FOR UPDATE USING (true) WITH CHECK (true);

-- 9. Workspace tables already exist — skipped
