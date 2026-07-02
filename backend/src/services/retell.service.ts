import { retellClient } from '../config/retell';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AIAgent, SyncStatus } from '../types';
import { compileSystemPrompt, compileBeginMessage } from '../utils/retellPromptBuilder';

// ─── Shared Constants ──────────────────────────────────────

export const POST_CALL_ANALYSIS_DATA = [
  { name: 'call_summary', type: 'string' as any, description: 'A detailed summary of the interview call including key points discussed.' },
  { name: 'call_successful', type: 'boolean' as any, description: 'Whether the interview was completed successfully (candidate answered questions).' },
  { name: 'candidate_sentiment', type: 'enum' as any, description: 'Overall sentiment of the candidate during the call.', choices: ['Positive', 'Neutral', 'Negative'] },
  { name: 'callback_requested', type: 'boolean' as any, description: 'Whether the candidate asked to be called back later.' },
  { name: 'callback_time_minutes', type: 'number' as any, description: 'If callback was requested, how many minutes later the candidate wants to be called. 0 if not requested.' },
];

// ─── Agent Management ──────────────────────────────────────

export async function deleteRetellAgent(agentId: string, llmId?: string | null): Promise<void> {
  try {
    await retellClient.agent.delete(agentId);
    if (llmId) {
      try { await retellClient.llm.delete(llmId); } catch { /* best-effort */ }
    }
    logger.info(`Deleted Retell agent: ${agentId}`);
  } catch (err) {
    logger.error(`Failed to delete Retell agent ${agentId}:`, err);
    throw err;
  }
}

// ─── Voice Listing ─────────────────────────────────────────

export async function listVoices() {
  try {
    const voices = await retellClient.voice.list();
    return voices;
  } catch (err) {
    logger.error('Failed to list Retell voices:', err);
    throw err;
  }
}

// ─── Call Management ───────────────────────────────────────

interface CreateCallParams {
  agentId: string;
  toNumber: string;
  fromNumber?: string;
  dynamicVariables: Record<string, string>;
  metadata?: Record<string, string>;
}

export async function createOutboundCall(params: CreateCallParams): Promise<{
  callId: string;
  status: string;
}> {
  try {
    const call = await retellClient.call.createPhoneCall({
      from_number: params.fromNumber || env.RETELL_FROM_NUMBER,
      to_number: params.toNumber,
      override_agent_id: params.agentId,
      retell_llm_dynamic_variables: params.dynamicVariables,
      metadata: params.metadata,
    });

    logger.info(`Created outbound call: ${call.call_id} to ${params.toNumber}`);
    return {
      callId: call.call_id,
      status: call.call_status,
    };
  } catch (err) {
    logger.error('Failed to create outbound call:', err);
    throw err;
  }
}

// ─── Retell Sync ────────────────────────────────────────────

export interface SyncResult {
  retell_llm_id: string | null;
  retell_agent_id: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  last_synced_at: string | null;
}

type SyncableAgent = Pick<AIAgent,
  'name' | 'system_prompt' | 'builder_config' | 'retell_agent_id' | 'retell_llm_id' |
  'voice_id' | 'language' | 'max_call_duration_sec'>;

/**
 * Push an agent's prompt + config to Retell. Manages BOTH Retell objects:
 * the LLM (holds general_prompt) and the agent (voice/language/duration).
 * Returns the ids + sync status to persist. Never throws — failures are
 * captured in sync_status='error' so the row still saves and can be retried.
 */
export async function syncAgentToRetell(agent: SyncableAgent, webhookUrl: string): Promise<SyncResult> {
  let llmId = agent.retell_llm_id;
  let agentId = agent.retell_agent_id;

  try {
    const generalPrompt = agent.builder_config
      ? compileSystemPrompt(agent.builder_config)
      : agent.system_prompt;
    // A fixed first utterance — deterministic greetings, no improvised
    // "[Your Name]" openers. Only guided agents get one; raw-prompt agents
    // keep Retell's default (model-generated) opener.
    const llmPayload: Record<string, unknown> = { general_prompt: generalPrompt };
    if (agent.builder_config) {
      llmPayload.begin_message = compileBeginMessage(agent.builder_config);
    }

    if (!llmId) {
      const created = await retellClient.llm.create(llmPayload as any);
      llmId = created.llm_id;
    } else {
      await retellClient.llm.update(llmId, llmPayload as any);
    }

    // Conversation-naturalness settings (same for create and update):
    // backchannels ("mm-hm", "right") while the candidate speaks, and a gentle
    // nudge after 10s of silence instead of dead air. Everything else stays at
    // Retell defaults, which are already tuned for live conversation.
    const naturalness = {
      enable_backchannel: true,
      backchannel_frequency: 0.7,
      backchannel_words: ['mm-hm', 'uh-huh', 'I see', 'right', 'got it'],
      reminder_trigger_ms: 10000,
      reminder_max_count: 2,
    };

    if (!agentId) {
      const created = await retellClient.agent.create({
        agent_name: agent.name,
        response_engine: { type: 'retell-llm', llm_id: llmId },
        voice_id: agent.voice_id,
        language: (agent.language || 'en-US') as any,
        max_call_duration_ms: (agent.max_call_duration_sec || 1200) * 1000,
        post_call_analysis_data: POST_CALL_ANALYSIS_DATA as any,
        webhook_url: webhookUrl,
        voicemail_option: { action: { type: 'hangup' } } as any,
        ...naturalness,
      } as any);
      agentId = created.agent_id;
    } else {
      await retellClient.agent.update(agentId, {
        agent_name: agent.name,
        // Re-point the agent at the LLM we just created/updated. Critical for agents
        // created before this feature (had a retell_agent_id but no retell_llm_id):
        // without this they'd stay linked to their original empty LLM and the prompt
        // would never take effect. For normal re-syncs llm_id is unchanged (no-op).
        response_engine: { type: 'retell-llm', llm_id: llmId },
        voice_id: agent.voice_id,
        language: (agent.language || 'en-US') as any,
        max_call_duration_ms: (agent.max_call_duration_sec || 1200) * 1000,
        webhook_url: webhookUrl,
        post_call_analysis_data: POST_CALL_ANALYSIS_DATA as any,
        voicemail_option: { action: { type: 'hangup' } } as any,
        ...naturalness,
      } as any);
    }

    logger.info(`Synced agent to Retell (llm=${llmId}, agent=${agentId})`);
    return {
      retell_llm_id: llmId,
      retell_agent_id: agentId,
      sync_status: 'synced',
      sync_error: null,
      last_synced_at: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to sync agent to Retell:', err);
    return {
      retell_llm_id: llmId,
      retell_agent_id: agentId,
      sync_status: 'error',
      sync_error: message,
      last_synced_at: null,
    };
  }
}

// ─── Import from Retell ─────────────────────────────────────

export interface ImportedAgent {
  retell_agent_id: string;
  retell_llm_id: string | null;
  name: string;
  voice_id: string;
  language: string;
  max_call_duration_sec: number;
  system_prompt: string;
}

/** Map a raw Retell agent object (and resolve its LLM prompt) to an ImportedAgent. */
async function mapRetellAgentToImported(a: any, throwOnLlmError = false): Promise<ImportedAgent> {
  const llmId = a.response_engine?.type === 'retell-llm' ? a.response_engine.llm_id ?? null : null;
  let prompt = '';
  if (llmId) {
    if (throwOnLlmError) {
      const llmObj = await retellClient.llm.retrieve(llmId);
      prompt = (llmObj as any).general_prompt ?? '';
    } else {
      try {
        const llmObj = await retellClient.llm.retrieve(llmId);
        prompt = (llmObj as any).general_prompt ?? '';
      } catch { /* import is lenient: leave prompt empty if the LLM can't be fetched */ }
    }
  }
  return {
    retell_agent_id: a.agent_id,
    retell_llm_id: llmId,
    name: a.agent_name ?? 'Imported agent',
    voice_id: a.voice_id ?? '',
    language: a.language ?? 'en-US',
    max_call_duration_sec: a.max_call_duration_ms ? Math.round(a.max_call_duration_ms / 1000) : 1200,
    system_prompt: prompt,
  };
}

/** List all Retell agents and resolve each one's LLM general_prompt. */
export async function fetchRetellAgentsForImport(): Promise<ImportedAgent[]> {
  const agents = await retellClient.agent.list();
  const out: ImportedAgent[] = [];
  for (const a of agents as any[]) {
    out.push(await mapRetellAgentToImported(a));
  }
  return out;
}

/** Retrieve a single Retell agent (and its LLM prompt) for a Retell→portal pull. */
export async function fetchRetellAgentForPull(retellAgentId: string): Promise<ImportedAgent> {
  const a = await retellClient.agent.retrieve(retellAgentId);
  if (a.response_engine?.type !== 'retell-llm') {
    throw new Error(`Cannot pull: Retell agent ${retellAgentId} does not use a retell-llm response engine.`);
  }
  return mapRetellAgentToImported(a, true); // pull is strict — surface LLM-fetch failures, never silently blank the prompt
}
