-- Migration 009: Add category and new lead fields
-- Run in Supabase SQL Editor (two separate executions — see note below)

-- STEP A: Add new columns (run first)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'site_web'
  CHECK (category IN ('site_web', 'automation_ai'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry TEXT;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry_tier TEXT
  CHECK (industry_tier IS NULL OR industry_tier IN ('tier_1', 'tier_2'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS employee_count TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_range TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_title TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_linkedin TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pain_points JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_estimate TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);

-- STEP B: Extend lead_status ENUM (run separately — cannot run inside a transaction)
-- Execute this statement alone in the SQL Editor:
-- ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'proposal_sent';
