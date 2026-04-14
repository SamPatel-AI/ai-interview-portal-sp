-- ============================================================
-- Interview Portal - Initial Database Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'recruiter', 'viewer');
CREATE TYPE job_status AS ENUM ('open', 'closed', 'on_hold', 'filled');
CREATE TYPE employment_type AS ENUM ('full_time', 'contract', 'c2c', 'w2');
CREATE TYPE application_status AS ENUM ('new', 'screening', 'interviewed', 'shortlisted', 'rejected', 'hired');
CREATE TYPE call_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE call_status AS ENUM ('scheduled', 'in_progress', 'completed', 'no_answer', 'voicemail', 'failed', 'interrupted');
CREATE TYPE interview_style AS ENUM ('formal', 'conversational', 'technical');
CREATE TYPE evaluation_decision AS ENUM ('advance', 'reject', 'callback', 'hold');
CREATE TYPE phone_number_type AS ENUM ('inbound', 'outbound', 'both');
CREATE TYPE email_type AS ENUM ('invitation', 'follow_up', 'rejection', 'custom');
CREATE TYPE email_status AS ENUM ('sent', 'failed', 'bounced');

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    logo_url    TEXT,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. USERS (Recruiters)
-- ============================================================

CREATE TABLE users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'recruiter',
    avatar_url  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- 3. CLIENT COMPANIES
-- ============================================================

CREATE TABLE client_companies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    logo_url    TEXT,
    description TEXT,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_org ON client_companies(org_id);

-- ============================================================
-- 4. AI AGENTS
-- ============================================================

CREATE TABLE ai_agents (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_company_id       UUID REFERENCES client_companies(id) ON DELETE SET NULL,
    name                    TEXT NOT NULL,
    retell_agent_id         TEXT,
    system_prompt           TEXT NOT NULL DEFAULT '',
    voice_id                TEXT NOT NULL,
    language                TEXT NOT NULL DEFAULT 'en-US',
    interview_style         interview_style NOT NULL DEFAULT 'conversational',
    max_call_duration_sec   INTEGER NOT NULL DEFAULT 1200,
    evaluation_criteria     JSONB NOT NULL DEFAULT '{}',
    greeting_template       TEXT,
    closing_template        TEXT,
    fallback_behavior       JSONB NOT NULL DEFAULT '{}',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_org ON ai_agents(org_id);
CREATE INDEX idx_agents_company ON ai_agents(client_company_id);

-- ============================================================
-- 5. JOBS
-- ============================================================

CREATE TABLE jobs (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_company_id       UUID REFERENCES client_companies(id) ON DELETE SET NULL,
    ceipal_job_id           TEXT,
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL DEFAULT '',
    skills                  TEXT[] NOT NULL DEFAULT '{}',
    location                TEXT,
    state                   TEXT,
    country                 TEXT,
    tax_terms               TEXT,
    employment_type         employment_type NOT NULL DEFAULT 'full_time',
    status                  job_status NOT NULL DEFAULT 'open',
    ai_agent_id             UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    assigned_recruiter_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    synced_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_org ON jobs(org_id);
CREATE INDEX idx_jobs_company ON jobs(client_company_id);
CREATE INDEX idx_jobs_ceipal ON jobs(ceipal_job_id);
CREATE INDEX idx_jobs_status ON jobs(org_id, status);

-- ============================================================
-- 6. CANDIDATES
-- ============================================================

CREATE TABLE candidates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT,
    location            TEXT,
    work_authorization  TEXT,
    resume_url          TEXT,
    resume_text         TEXT,
    source              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (org_id, email)
);

CREATE INDEX idx_candidates_org ON candidates(org_id);
CREATE INDEX idx_candidates_email ON candidates(org_id, email);
CREATE INDEX idx_candidates_phone ON candidates(phone);

-- ============================================================
-- 7. APPLICATIONS
-- ============================================================

CREATE TABLE applications (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    candidate_id            UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id                  UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status                  application_status NOT NULL DEFAULT 'new',
    ai_screening_score      INTEGER CHECK (ai_screening_score >= 0 AND ai_screening_score <= 10),
    ai_screening_result     JSONB,
    mandate_questions       TEXT[],
    interview_questions     TEXT[],
    recruiter_notes         TEXT,
    assigned_recruiter_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (candidate_id, job_id)
);

CREATE INDEX idx_applications_org ON applications(org_id);
CREATE INDEX idx_applications_candidate ON applications(candidate_id);
CREATE INDEX idx_applications_job ON applications(job_id);
CREATE INDEX idx_applications_status ON applications(org_id, status);
CREATE INDEX idx_applications_recruiter ON applications(assigned_recruiter_id);

-- ============================================================
-- 8. CALLS
-- ============================================================

CREATE TABLE calls (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id          UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    candidate_id            UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    ai_agent_id             UUID NOT NULL REFERENCES ai_agents(id),
    retell_call_id          TEXT,
    direction               call_direction NOT NULL DEFAULT 'outbound',
    status                  call_status NOT NULL DEFAULT 'scheduled',
    from_number             TEXT,
    to_number               TEXT,
    started_at              TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,
    duration_seconds        INTEGER,
    transcript              TEXT,
    transcript_object       JSONB,
    recording_url           TEXT,
    disconnection_reason    TEXT,
    call_analysis           JSONB,
    call_cost               JSONB,
    is_resumption           BOOLEAN NOT NULL DEFAULT FALSE,
    parent_call_id          UUID REFERENCES calls(id) ON DELETE SET NULL,
    context_passed          JSONB,
    scheduled_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calls_org ON calls(org_id);
CREATE INDEX idx_calls_application ON calls(application_id);
CREATE INDEX idx_calls_candidate ON calls(candidate_id);
CREATE INDEX idx_calls_retell ON calls(retell_call_id);
CREATE INDEX idx_calls_status ON calls(org_id, status);
CREATE INDEX idx_calls_scheduled ON calls(status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_calls_parent ON calls(parent_call_id);

-- ============================================================
-- 9. CALL EVALUATIONS
-- ============================================================

CREATE TABLE call_evaluations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id         UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    evaluated_by    UUID NOT NULL REFERENCES users(id),
    decision        evaluation_decision NOT NULL,
    rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluations_call ON call_evaluations(call_id);
CREATE INDEX idx_evaluations_application ON call_evaluations(application_id);

-- ============================================================
-- 10. PHONE NUMBERS
-- ============================================================

CREATE TABLE phone_numbers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    number              TEXT NOT NULL,
    retell_phone_id     TEXT NOT NULL,
    type                phone_number_type NOT NULL DEFAULT 'both',
    assigned_agent_id   UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phones_org ON phone_numbers(org_id);

-- ============================================================
-- 11. EMAIL LOGS
-- ============================================================

CREATE TABLE email_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    type            email_type NOT NULL,
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    status          email_status NOT NULL DEFAULT 'sent',
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emails_candidate ON email_logs(candidate_id);
CREATE INDEX idx_emails_application ON email_logs(application_id);

-- ============================================================
-- 12. ACTIVITY LOG
-- ============================================================

CREATE TABLE activity_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    action      TEXT NOT NULL,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_org ON activity_log(org_id);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(org_id, created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_candidates_updated
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_applications_updated
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agents_updated
    BEFORE UPDATE ON ai_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper: get the current user's org_id
-- NOTE: Uses public schema (not auth) because Supabase blocks auth schema writes
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
    SELECT org_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations: users can only see their own org
CREATE POLICY org_select ON organizations
    FOR SELECT USING (id = public.get_user_org_id());

-- Users: can see users in same org
CREATE POLICY users_select ON users
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY users_update ON users
    FOR UPDATE USING (id = auth.uid() OR
        (org_id = public.get_user_org_id() AND
         EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')));

-- Client Companies: org-scoped
CREATE POLICY companies_select ON client_companies
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY companies_insert ON client_companies
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY companies_update ON client_companies
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- AI Agents: org-scoped
CREATE POLICY agents_select ON ai_agents
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY agents_insert ON ai_agents
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY agents_update ON ai_agents
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- Jobs: org-scoped
CREATE POLICY jobs_select ON jobs
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY jobs_insert ON jobs
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY jobs_update ON jobs
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- Candidates: org-scoped
CREATE POLICY candidates_select ON candidates
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY candidates_insert ON candidates
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY candidates_update ON candidates
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- Applications: org-scoped
CREATE POLICY applications_select ON applications
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY applications_insert ON applications
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY applications_update ON applications
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- Calls: org-scoped
CREATE POLICY calls_select ON calls
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY calls_insert ON calls
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY calls_update ON calls
    FOR UPDATE USING (org_id = public.get_user_org_id());

-- Call Evaluations: via join to calls
CREATE POLICY evaluations_select ON call_evaluations
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM calls WHERE calls.id = call_evaluations.call_id AND calls.org_id = public.get_user_org_id())
    );

CREATE POLICY evaluations_insert ON call_evaluations
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM calls WHERE calls.id = call_evaluations.call_id AND calls.org_id = public.get_user_org_id())
    );

-- Phone Numbers: org-scoped
CREATE POLICY phones_select ON phone_numbers
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY phones_insert ON phone_numbers
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- Email Logs: via join to candidates
CREATE POLICY emails_select ON email_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM candidates WHERE candidates.id = email_logs.candidate_id AND candidates.org_id = public.get_user_org_id())
    );

CREATE POLICY emails_insert ON email_logs
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM candidates WHERE candidates.id = email_logs.candidate_id AND candidates.org_id = public.get_user_org_id())
    );

-- Activity Log: org-scoped
CREATE POLICY activity_select ON activity_log
    FOR SELECT USING (org_id = public.get_user_org_id());

CREATE POLICY activity_insert ON activity_log
    FOR INSERT WITH CHECK (org_id = public.get_user_org_id());

-- ============================================================
-- STORAGE BUCKET FOR RESUMES
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY resume_upload ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'resumes' AND
        auth.role() = 'authenticated'
    );

CREATE POLICY resume_read ON storage.objects
    FOR SELECT USING (
        bucket_id = 'resumes' AND
        auth.role() = 'authenticated'
    );
