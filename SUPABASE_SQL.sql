-- Run this in Supabase SQL Editor

-- Add new columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS vat_num text DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS biz_addr text DEFAULT '',
  ADD COLUMN IF NOT EXISTS biz_phone text DEFAULT '';

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  inv_number text,
  buyer text,
  amount numeric DEFAULT 0,
  date date,
  status text DEFAULT 'unpaid',
  data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Own invoices" ON invoices FOR ALL USING (auth.uid() = user_id);
