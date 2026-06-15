-- Migration 005: Interview Deadline
-- Recruiters can set a deadline by which candidates must book their call

ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_deadline TIMESTAMPTZ;
