-- Migration: Create jf_signatures table with RLS policies
-- Created: 2026-03-09

-- 1. Create the jf_signatures table
CREATE TABLE IF NOT EXISTS public.jf_signatures (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  text         NOT NULL,
  level          smallint     NOT NULL,
  approver_email text,
  approver_name  text,
  comment        text,
  signature_url  text         NOT NULL,
  created_at     timestamptz  DEFAULT now()
);

-- 2. Index on submission_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_jf_signatures_submission_id
  ON public.jf_signatures (submission_id);

-- 3. Enable Row Level Security
ALTER TABLE public.jf_signatures ENABLE ROW LEVEL SECURITY;

-- 4. Policy: allow SELECT for anon and authenticated
CREATE POLICY "allow_select_all"
  ON public.jf_signatures
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 5. Policy: allow INSERT for anon and authenticated
CREATE POLICY "allow_insert_all"
  ON public.jf_signatures
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 6. Policy: allow UPDATE for anon and authenticated
CREATE POLICY "allow_update_all"
  ON public.jf_signatures
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
