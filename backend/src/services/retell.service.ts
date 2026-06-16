import { retellClient } from '../config/retell';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AIAgent, SyncStatus } from '../types';
import { compileSystemPrompt } from '../utils/retellPromptBuilder';

// ─── Shared Constants ──────────────────────────────────────

export const POST_CALL_ANALYSIS_DATA = [
  { name: 'call_summary', type: 'string' as any, description: 'A detailed summary of the interview call including key points discussed.' },
  { name: 'call_successful', type: 'boolean' as any, description: 'Whether the interview was completed successfully (candidate answered questions).' },
  { name: 'candidate_sentiment', type: 'enum' as any, description: 'Overall sentiment of the candidate during the call.', choices: ['Positive', 'Neutral', 'Negative'] },
  { name: 'callback_requested', type: 'boolean' as any, description: 'Whether the candidate asked to be called back later.' },
  { name: 'callback_time_minutes', type: 'number' as any, description: 'If callback was requested, how many minutes later the candidate wants to be called. 0 if not requested.' },
];

// ─── Agent Management ──────────────────────────────────────

interface CreateAgentParams {
  name: string;
  systemPrompt: string;
  voiceId: string;
  language?: string;
  maxCallDurationSec?: number;
  interviewStyle?: string;
  greetingTemplate?: string;
  webhookUrl: string;
}

export async function createRetellAgent(params: CreateAgentParams): Promise<string> {
  try {
    const agent = await retellClient.agent.create({
      agent_name: params.name,
      response_engine: {
        type: 'retell-llm',
        llm_id: '', // Will be auto-created
      },
      voice_id: params.voiceId,
      language: (params.language || 'en-US') as any,
      max_call_duration_ms: (params.maxCallDurationSec || 1200) * 1000,
      post_call_analysis_data: POST_CALL_ANALYSIS_DATA as any,
      webhook_url: params.webhookUrl,
      voicemail_option: 'machine_detection_with_beep' as any,
    });

    logger.info(`Created Retell agent: ${agent.agent_id}`);
    return agent.agent_id;
  } catch (err) {
    logger.error('Failed to create Retell agent:', err);
    throw err;
  }
}

export async function updateRetellAgent(agentId: string, params: Partial<CreateAgentParams>): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {};

    if (params.name) updateData.agent_name = params.name;
    if (params.voiceId) updateData.voice_id = params.voiceId;
    if (params.language) updateData.language = params.language;
    if (params.maxCallDurationSec) updateData.max_call_duration_ms = params.maxCallDurationSec * 1000;

    await retellClient.agent.update(agentId, updateData as any);
    logger.info(`Updated Retell agent: ${agentId}`);
  } catch (err) {
    logger.error(`Failed to update Retell agent ${agentId}:`, err);
    throw err;
  }
}

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

// ─── Phone Number Management ───────────────────────────────

interface RegisterPhoneParams {
  areaCode?: number;
  inboundAgentId?: string;
  inboundWebhookUrl?: string;
}

export async function registerPhoneNumber(params: RegisterPhoneParams) {
  try {
    const phone = await retellClient.phoneNumber.create({
      area_code: params.areaCode || 240,
      inbound_agent_id: params.inboundAgentId,
    });

    logger.info(`Registered phone number: ${phone.phone_number}`);
    return phone;
  } catch (err) {
    logger.error('Failed to register phone number:', err);
    throw err;
  }
}

export async function listPhoneNumbers() {
  try {
    return await retellClient.phoneNumber.list();
  } catch (err) {
    logger.error('Failed to list phone numbers:', err);
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
  const generalPrompt = agent.builder_config
    ? compileSystemPrompt(agent.builder_config)
    : agent.system_prompt;

  let llmId = agent.retell_llm_id;
  let agentId = agent.retell_agent_id;

  try {
    if (!llmId) {
      const created = await retellClient.llm.create({ general_prompt: generalPrompt } as any);
      llmId = created.llm_id;
    } else {
      await retellClient.llm.update(llmId, { general_prompt: generalPrompt } as any);
    }

    if (!agentId) {
      const created = await retellClient.agent.create({
        agent_name: agent.name,
        response_engine: { type: 'retell-llm', llm_id: llmId },
        voice_id: agent.voice_id,
        language: (agent.language || 'en-US') as any,
        max_call_duration_ms: (agent.max_call_duration_sec || 1200) * 1000,
        post_call_analysis_data: POST_CALL_ANALYSIS_DATA as any,
        webhook_url: webhookUrl,
        voicemail_option: 'machine_detection_with_beep' as any,
      } as any);
      agentId = created.agent_id;
    } else {
      await retellClient.agent.update(agentId, {
        agent_name: agent.name,
        voice_id: agent.voice_id,
        language: (agent.language || 'en-US') as any,
        max_call_duration_ms: (agent.max_call_duration_sec || 1200) * 1000,
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
