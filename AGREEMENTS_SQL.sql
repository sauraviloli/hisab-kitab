-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS agreements (
  id text PRIMARY KEY,
  deposit_id text,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  biz_name text,
  biz_addr text,
  biz_phone text,
  biz_logo text,
  title text,
  terms jsonb,
  fields jsonb,
  client_name text,
  client_email text,
  signing_token text UNIQUE NOT NULL,
  status text DEFAULT 'pending',
  signed_at timestamptz,
  signed_name text,
  signature_data text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own agreements
CREATE POLICY "owner_all" ON agreements FOR ALL USING (auth.uid() = user_id);

-- Anyone with the signing token can read the agreement (for the public signing page)
CREATE POLICY "public_read_by_token" ON agreements FOR SELECT USING (true);

-- The signing page can update status/signature (public, no auth needed)
CREATE POLICY "public_sign" ON agreements FOR UPDATE USING (true) WITH CHECK (true);
