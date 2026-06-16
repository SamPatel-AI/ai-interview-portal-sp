-- Migration 013: default agent per org.
-- The default agent is used for a job that has no specific agent assigned.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one default agent per org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agents_one_default_per_org
  ON ai_agents (org_id) WHERE is_default;
