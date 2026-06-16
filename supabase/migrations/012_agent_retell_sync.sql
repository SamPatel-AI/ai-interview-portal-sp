-- Migration 012: Retell sync + guided builder support for ai_agents
-- retell_llm_id: the Retell LLM object that holds general_prompt (root cause
--   of broken prompt sync — agents previously had only retell_agent_id).
-- builder_config: source of truth for guided-builder agents; NULL = legacy/raw.

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS retell_llm_id   TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS builder_config  JSONB;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS sync_status     TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS last_synced_at  TIMESTAMPTZ;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS sync_error      TEXT;

-- Constrain sync_status to known values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_agents_sync_status_check'
  ) THEN
    ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_sync_status_check
      CHECK (sync_status IN ('pending', 'synced', 'error', 'imported'));
  END IF;
END $$;
