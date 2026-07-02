-- Migration 016: store CEIPAL's assigned-recruiter list on jobs.
--
-- The Graph mail intake (ceipalMailPoll) gates each incoming job-board
-- application on whether the job is assigned to our recruiter account
-- (AISaanviHR / CEIPAL_RECRUITER_ID). CEIPAL's getJobPostingsList already
-- returns `assigned_recruiter` as a comma-separated list of encoded user ids,
-- so the regular job sync stores it here at no extra API cost.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ceipal_assigned_recruiters TEXT;
