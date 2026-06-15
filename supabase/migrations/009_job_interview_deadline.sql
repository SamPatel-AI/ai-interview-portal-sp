-- ============================================================================
-- Migration 009: Interview deadline on the JOB (not per application)
--
-- The interview/booking deadline is a property of the job role: set once (on
-- the first invite for that job), reused for all its candidates, and shown on
-- the job everywhere. The Cal.com booking window is capped to this date.
-- (applications.interview_deadline from 005 stays as a per-application record.)
-- ============================================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS interview_deadline TIMESTAMPTZ;
