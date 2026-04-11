-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS deposits (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  workspace_id uuid,
  type text DEFAULT 'deposit',
  customer text,
  phone text,
  email text,
  service text,
  total numeric DEFAULT 0,
  deposit_amt numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  due_date text,
  start_date text,
  end_date text,
  notes text,
  vehicle text,
  rego text,
  pickup text,
  pickup_time text,
  dropoff text,
  destination text,
  security numeric DEFAULT 0,
  signed boolean DEFAULT false,
  signed_date text,
  signed_name text,
  signature_data text,
  agreement_id text,
  agreement_data jsonb,
  signing_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_deposits" ON deposits FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS udharos (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  customer text,
  phone text,
  item text,
  amount numeric DEFAULT 0,
  paid numeric DEFAULT 0,
  date text,
  due_date text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE udharos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_udharos" ON udharos FOR ALL USING (auth.uid() = user_id);
