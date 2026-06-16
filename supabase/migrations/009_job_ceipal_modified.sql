-- Migration 009: store CEIPAL's last-modified date per job so the portal can
-- filter "recently active" jobs at query time (30/60/90-day window toggle)
-- instead of baking the window in at sync time.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ceipal_modified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jobs_ceipal_modified
  ON jobs (org_id, status, ceipal_modified_at);
