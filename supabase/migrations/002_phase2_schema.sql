-- ============================================================
-- Interview Portal - Phase 2 Schema Changes
-- ============================================================

-- ─── Scheduling Restrictions ───────────────────────────────

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS scheduling_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduling_config JSONB NOT NULL DEFAULT '{}';

-- ─── Job Priority ──────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('urgent', 'high', 'normal', 'low'));

-- ─── Recruiter Capacity ────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS max_capacity INTEGER NOT NULL DEFAULT 50;

-- ─── Multi-Stage Interviews ────────────────────────────────

CREATE TABLE IF NOT EXISTS interview_stages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stage_number        INTEGER NOT NULL,
    name                TEXT NOT NULL,
    ai_agent_id         UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    evaluation_criteria JSONB NOT NULL DEFAULT '{}',
    is_eliminatory      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (job_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_stages_job ON interview_stages(job_id);
CREATE INDEX IF NOT EXISTS idx_stages_org ON interview_stages(org_id);

ALTER TABLE calls ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES interview_stages(id) ON DELETE SET NULL;

-- ─── Candidate Portal Tokens ───────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_portal_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_candidate ON candidate_portal_tokens(candidate_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON candidate_portal_tokens(token);

-- ─── Client Users ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_company_id   UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    name                TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (client_company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_client_users_company ON client_users(client_company_id);

-- ─── Duplicate & Fraud Detection ───────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS flags JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_candidates_name_trgm ON candidates USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_candidates_email_trgm ON candidates USING gin (email gin_trgm_ops);

-- ─── RLS for New Tables ────────────────────────────────────

ALTER TABLE interview_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

-- Interview Stages: org-scoped
CREATE POLICY stages_select ON interview_stages
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY stages_insert ON interview_stages
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY stages_update ON interview_stages
    FOR UPDATE USING (org_id = public.get_user_org_id());

CREATE POLICY stages_delete ON interview_stages
    FOR DELETE USING (org_id = public.get_user_org_id());

-- Candidate Portal Tokens: candidates can read their own tokens
CREATE POLICY portal_tokens_select ON candidate_portal_tokens
    FOR SELECT USING (true); -- Validated at application layer via token

CREATE POLICY portal_tokens_insert ON candidate_portal_tokens
    FOR INSERT WITH CHECK (true); -- Created by system

-- Client Users: company-scoped via application layer
CREATE POLICY client_users_select ON client_users
    FOR SELECT USING (true);

CREATE POLICY client_users_insert ON client_users
    FOR INSERT WITH CHECK (true);

CREATE POLICY client_users_update ON client_users
    FOR UPDATE USING (true);
