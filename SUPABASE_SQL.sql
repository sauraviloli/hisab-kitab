-- ═══════════════════════════════════════════════
-- Run ALL of this in Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- Add new columns to profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS vat_num text DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS biz_addr text DEFAULT '',
  ADD COLUMN IF NOT EXISTS biz_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NPR',
  ADD COLUMN IF NOT EXISTS business_mode text DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS workspace_role text DEFAULT 'owner';

-- Workspaces table (for partner/multi-user accounts)
CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now()
);

-- Workspace members
CREATE TABLE IF NOT EXISTS workspace_members (
  id bigint generated always as identity primary key,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  role text DEFAULT 'partner',
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Workspace invites
CREATE TABLE IF NOT EXISTS workspace_invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id text REFERENCES workspaces(id) ON DELETE CASCADE,
  invite_code text UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_by uuid REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT now() + interval '7 days'
);

-- Invoices table
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

-- Ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id bigint generated always as identity primary key,
  stars integer NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment text DEFAULT '',
  display_name text DEFAULT 'Anonymous',
  created_at timestamp with time zone DEFAULT now()
);

-- Audit log for entries (tracks who changed what)
CREATE TABLE IF NOT EXISTS entry_audit (
  id bigint generated always as identity primary key,
  entry_id text,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  user_email text,
  action text,
  changes jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_audit ENABLE ROW LEVEL SECURITY;

-- Ratings is public (anyone can read, anyone can insert)
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ratings" ON ratings FOR SELECT USING (true);
CREATE POLICY "Anyone can add rating" ON ratings FOR INSERT WITH CHECK (true);

-- Workspace policies
CREATE POLICY "Own workspaces" ON workspaces FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Workspace members" ON workspace_members FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Workspace invites" ON workspace_invites FOR ALL USING (auth.uid() = created_by OR true);
CREATE POLICY "Own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own audit" ON entry_audit FOR ALL USING (auth.uid() = user_id);

-- Update entries table to support workspace
ALTER TABLE entries ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edited_by text DEFAULT NULL;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS workspace_id text DEFAULT NULL;

-- Update entries policy to also allow workspace members
DROP POLICY IF EXISTS "Own entries" ON entries;
CREATE POLICY "Own or workspace entries" ON entries FOR ALL USING (
  auth.uid() = user_id OR 
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Own stock" ON stock_items;
CREATE POLICY "Own or workspace stock" ON stock_items FOR ALL USING (
  auth.uid() = user_id OR
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Own customers" ON customers;
CREATE POLICY "Own or workspace customers" ON customers FOR ALL USING (
  auth.uid() = user_id OR
  workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);
