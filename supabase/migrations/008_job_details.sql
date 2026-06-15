-- ============================================================================
-- Migration 008: Richer job details from CEIPAL
--
-- Adds columns the CEIPAL sync now captures so job detail pages can show
-- salary and so jobs can be linked to clients by CEIPAL company id.
-- ============================================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pay_rate TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ceipal_company_id TEXT;

-- For mapping CEIPAL companies -> client_companies (used by client linking).
ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS ceipal_company_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_ceipal_company ON jobs(ceipal_company_id);
CREATE INDEX IF NOT EXISTS idx_client_companies_ceipal ON client_companies(ceipal_company_id);
