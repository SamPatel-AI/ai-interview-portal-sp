-- ============================================================================
-- Migration 010: shortlisted_at timestamp on applications
--
-- Lets the Pipeline board auto-archive shortlisted cards exactly 7 days after
-- they were shortlisted (instead of guessing from updated_at).
-- ============================================================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS shortlisted_at TIMESTAMPTZ;
