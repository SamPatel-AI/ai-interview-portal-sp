-- ============================================================================
-- Migration 006: Security & integrity hardening
--
-- Fixes found in the June 2026 audit:
--   1. Re-engagement RLS policies compared auth.uid() (a user id) against
--      org_id (an org id) — a comparison that NEVER matches, so the policies
--      denied all access. Replaced with public.get_user_org_id().
--   2. candidate_portal_tokens and client_users used `USING (true)`, giving
--      zero tenant isolation at the DB layer. Now scoped through their parent
--      rows (candidates / client_companies) to the caller's org.
--   3. Foreign keys to users / ai_agents had no ON DELETE behaviour, so a user
--      or agent with history could never be deleted. Switched to SET NULL so
--      history is preserved when the referenced row is removed.
--   4. Added missing indexes on frequently-joined / filtered columns.
--
-- NOT changed (and why): calls.retell_call_id and ai_agents.retell_agent_id
-- remain nullable. Call rows are inserted before the Retell call is placed
-- (call.service.ts sets retell_call_id later via UPDATE), so a NOT NULL
-- constraint would break call creation.
-- ============================================================================

-- ─── 1. Re-engagement RLS (CRITICAL correctness fix) ───────────────────────

DROP POLICY IF EXISTS reengagement_campaigns_org ON reengagement_campaigns;
CREATE POLICY reengagement_campaigns_org ON reengagement_campaigns
    FOR ALL USING (org_id = public.get_user_org_id());

DROP POLICY IF EXISTS reengagement_cands_org ON reengagement_candidates;
CREATE POLICY reengagement_cands_org ON reengagement_candidates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM reengagement_campaigns rc
            WHERE rc.id = reengagement_candidates.campaign_id
              AND rc.org_id = public.get_user_org_id()
        )
    );

-- ─── 2. Tenant-scope the Phase 2 tables that used USING (true) ─────────────

-- Candidate portal tokens: scope to the caller's org via the parent candidate.
-- (Public, token-based candidate access continues to use the service role,
--  which bypasses RLS — this policy governs authenticated org-user access.)
DROP POLICY IF EXISTS portal_tokens_select ON candidate_portal_tokens;
CREATE POLICY portal_tokens_select ON candidate_portal_tokens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM candidates c
            WHERE c.id = candidate_portal_tokens.candidate_id
              AND c.org_id = public.get_user_org_id()
        )
    );

DROP POLICY IF EXISTS portal_tokens_insert ON candidate_portal_tokens;
CREATE POLICY portal_tokens_insert ON candidate_portal_tokens
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM candidates c
            WHERE c.id = candidate_portal_tokens.candidate_id
              AND c.org_id = public.get_user_org_id()
        )
    );

-- Client users: scope to the caller's org via the parent client_company.
DROP POLICY IF EXISTS client_users_select ON client_users;
CREATE POLICY client_users_select ON client_users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM client_companies cc
            WHERE cc.id = client_users.client_company_id
              AND cc.org_id = public.get_user_org_id()
        )
    );

DROP POLICY IF EXISTS client_users_insert ON client_users;
CREATE POLICY client_users_insert ON client_users
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM client_companies cc
            WHERE cc.id = client_users.client_company_id
              AND cc.org_id = public.get_user_org_id()
        )
    );

DROP POLICY IF EXISTS client_users_update ON client_users;
CREATE POLICY client_users_update ON client_users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM client_companies cc
            WHERE cc.id = client_users.client_company_id
              AND cc.org_id = public.get_user_org_id()
        )
    );

-- ─── 3. Foreign-key ON DELETE behaviour (preserve history) ─────────────────

-- ai_agents.created_by → users(id): keep the agent if its creator is deleted.
ALTER TABLE ai_agents ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_created_by_fkey;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- calls.ai_agent_id → ai_agents(id): keep the call record if its agent is deleted.
ALTER TABLE calls ALTER COLUMN ai_agent_id DROP NOT NULL;
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_ai_agent_id_fkey;
ALTER TABLE calls ADD CONSTRAINT calls_ai_agent_id_fkey
    FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id) ON DELETE SET NULL;

-- call_evaluations.evaluated_by → users(id): keep the evaluation if the evaluator is deleted.
ALTER TABLE call_evaluations ALTER COLUMN evaluated_by DROP NOT NULL;
ALTER TABLE call_evaluations DROP CONSTRAINT IF EXISTS call_evaluations_evaluated_by_fkey;
ALTER TABLE call_evaluations ADD CONSTRAINT call_evaluations_evaluated_by_fkey
    FOREIGN KEY (evaluated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ─── 4. Missing indexes on hot join / filter columns ───────────────────────

CREATE INDEX IF NOT EXISTS idx_call_evaluations_call         ON call_evaluations(call_id);
CREATE INDEX IF NOT EXISTS idx_call_evaluations_application  ON call_evaluations(application_id);
CREATE INDEX IF NOT EXISTS idx_call_evaluations_evaluated_by ON call_evaluations(evaluated_by);
CREATE INDEX IF NOT EXISTS idx_reengagement_cands_candidate  ON reengagement_candidates(candidate_id);
