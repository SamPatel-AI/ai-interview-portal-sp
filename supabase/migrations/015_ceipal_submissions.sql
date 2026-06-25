-- Migration 015: CEIPAL submissions ingestion ledger + job opaque-id bridge.
--
-- Candidate intake now pulls applications directly from the CEIPAL API
-- (getSubmissionsList) on a schedule, instead of scraping CEIPAL notification
-- emails through n8n. This table is the idempotency ledger + audit trail: each
-- CEIPAL submission is processed exactly once (UNIQUE on ceipal_submission_id)
-- and ends in a definite, visible state (received/processed/unmatched/
-- needs_resume/failed) — nothing is silently lost.

CREATE TABLE IF NOT EXISTS ceipal_submissions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ceipal_submission_id  TEXT NOT NULL,
    ceipal_applicant_id   TEXT,
    job_code              TEXT,
    candidate_id          UUID REFERENCES candidates(id) ON DELETE SET NULL,
    application_id        UUID REFERENCES applications(id) ON DELETE SET NULL,
    status                TEXT NOT NULL DEFAULT 'received',
    error                 TEXT,
    raw                   JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at          TIMESTAMPTZ,

    UNIQUE (ceipal_submission_id)
);

CREATE INDEX IF NOT EXISTS idx_ceipal_submissions_status ON ceipal_submissions(org_id, status);

-- Server-only table (written via the service-role client, which bypasses RLS).
-- Enable RLS with no policies so anon/authenticated have no access.
ALTER TABLE ceipal_submissions ENABLE ROW LEVEL SECURITY;

-- Bridge: store CEIPAL's opaque job-posting id so a submission's opaque `job_id`
-- maps directly to our job row. (jobs.ceipal_job_id holds the "JPC - <n>" code,
-- which submissions do NOT carry — they reference the opaque posting id.)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ceipal_job_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_ceipal_uuid ON jobs(org_id, ceipal_job_uuid);
