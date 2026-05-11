-- Migration 004: Re-engagement Pipeline
-- Full-text search on candidate resumes (free pre-filtering, no API calls)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', COALESCE(resume_text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_candidates_resume_fts ON candidates USING gin(resume_tsv);

-- Candidate opt-out for re-engagement emails
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS reengagement_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

-- Campaign tracking
CREATE TABLE IF NOT EXISTS reengagement_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matching', 'emailing', 'completed', 'failed')),
    candidates_matched  INTEGER NOT NULL DEFAULT 0,
    candidates_emailed  INTEGER NOT NULL DEFAULT 0,
    candidates_responded INTEGER NOT NULL DEFAULT 0,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reengagement_org ON reengagement_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_reengagement_job ON reengagement_campaigns(job_id);

-- Per-candidate campaign results
CREATE TABLE IF NOT EXISTS reengagement_candidates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES reengagement_campaigns(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    fit_score       INTEGER NOT NULL,
    fit_justification TEXT,
    email_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    responded       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_reengagement_cands_campaign ON reengagement_candidates(campaign_id);

-- RLS
ALTER TABLE reengagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reengagement_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY reengagement_campaigns_org ON reengagement_campaigns
    FOR ALL USING (org_id = auth.uid()::text::uuid);

CREATE POLICY reengagement_cands_org ON reengagement_candidates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM reengagement_campaigns rc
                WHERE rc.id = reengagement_candidates.campaign_id
                AND rc.org_id = auth.uid()::text::uuid)
    );
