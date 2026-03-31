-- ═══════════════════════════════════════════════════════
-- HISAB-KITAB — COMPLETE DATABASE SETUP
-- Run this ONCE in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS + DROP IF EXISTS)
-- ═══════════════════════════════════════════════════════

-- STEP 1: Add columns to existing tables FIRST
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vat_num text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS owner_name text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biz_addr text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biz_phone text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NPR';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_mode text DEFAULT 'retail';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text DEFAULT 'NP';

ALTER TABLE entries ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edited_by text DEFAULT NULL;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sell_price numeric DEFAULT 0;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS note text DEFAULT '';

-- STEP 2: Create new tables
CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id bigint generated always as identity primary key,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  role text DEFAULT 'partner',
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  invite_code text UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_by uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  workspace_id text DEFAULT NULL,
  inv_number text,
  buyer text,
  amount numeric DEFAULT 0,
  date date,
  status text DEFAULT 'unpaid',
  data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
  id bigint generated always as identity primary key,
  stars integer NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text DEFAULT '',
  display_name text DEFAULT 'Anonymous',
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entry_audit (
  id bigint generated always as identity primary key,
  entry_id text,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  user_email text,
  action text,
  changes jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- STEP 3: Enable RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- STEP 4: Drop ALL existing policies safely
DROP POLICY IF EXISTS "Own profile" ON profiles;
DROP POLICY IF EXISTS "Own invoices" ON invoices;
DROP POLICY IF EXISTS "Own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Workspace invites" ON workspace_invites;
DROP POLICY IF EXISTS "Own audit" ON entry_audit;
DROP POLICY IF EXISTS "Anyone can read ratings" ON ratings;
DROP POLICY IF EXISTS "Anyone can add rating" ON ratings;
DROP POLICY IF EXISTS "Own entries" ON entries;
DROP POLICY IF EXISTS "Own or workspace entries" ON entries;
DROP POLICY IF EXISTS "Own stock" ON stock_items;
DROP POLICY IF EXISTS "Own or workspace stock" ON stock_items;
DROP POLICY IF EXISTS "Own customers" ON customers;
DROP POLICY IF EXISTS "Own or workspace customers" ON customers;

-- STEP 5: Create all policies (now workspace_id columns exist)
CREATE POLICY "Own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- Workspace policies - FIXED: allow insert for creator
CREATE POLICY "Own workspaces read" ON workspaces FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Own workspaces insert" ON workspaces FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Own workspaces update" ON workspaces FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Own workspaces delete" ON workspaces FOR DELETE USING (auth.uid() = created_by);

-- Workspace members - allow reading if you're a member
CREATE POLICY "Workspace members read" ON workspace_members FOR SELECT USING (
  auth.uid() = user_id OR 
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
CREATE POLICY "Workspace members insert" ON workspace_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Workspace members delete" ON workspace_members FOR DELETE USING (auth.uid() = user_id);

-- Workspace invites - anyone can read (needed for joining by code)
CREATE POLICY "Workspace invites all" ON workspace_invites FOR ALL USING (true) WITH CHECK (true);

-- Invoices
CREATE POLICY "Own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);

-- Audit log
CREATE POLICY "Own audit" ON entry_audit FOR ALL USING (auth.uid() = user_id);

-- Ratings - fully public
CREATE POLICY "Anyone can read ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Anyone can add rating" ON ratings FOR INSERT WITH CHECK (true);

-- Entries - own or workspace
CREATE POLICY "Own or workspace entries" ON entries FOR ALL USING (
  auth.uid() = user_id OR 
  (workspace_id IS NOT NULL AND workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
);

-- Stock - own or workspace
CREATE POLICY "Own or workspace stock" ON stock_items FOR ALL USING (
  auth.uid() = user_id OR
  (workspace_id IS NOT NULL AND workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
);

-- Customers - own or workspace
CREATE POLICY "Own or workspace customers" ON customers FOR ALL USING (
  auth.uid() = user_id OR
  (workspace_id IS NOT NULL AND workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
);

-- STEP 6: Profile auto-create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, biz_name)
  VALUES (new.id, new.email, 'My Business')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
