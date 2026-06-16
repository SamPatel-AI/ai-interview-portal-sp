import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the stubs are available when vi.mock factories run.
const { llm, agent } = vi.hoisted(() => {
  const llm = { create: vi.fn(), update: vi.fn(), retrieve: vi.fn(), delete: vi.fn() };
  const agent = { create: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn(), retrieve: vi.fn() };
  return { llm, agent };
});

// Mock the retell config module so retellClient is a controllable stub.
vi.mock('../config/retell', () => ({ retellClient: { llm, agent, voice: { list: vi.fn() }, call: {}, phoneNumber: {} } }));
vi.mock('../config/env', () => ({ env: { RETELL_FROM_NUMBER: '+10000000000', NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:8082' } }));

import { syncAgentToRetell, fetchRetellAgentsForImport, fetchRetellAgentForPull } from './retell.service';

const baseAgent = {
  id: 'a1', name: 'Test', system_prompt: 'PROMPT', builder_config: null,
  retell_agent_id: null, retell_llm_id: null,
  voice_id: 'v1', language: 'en-US', max_call_duration_sec: 1200,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  llm.create.mockResolvedValue({ llm_id: 'llm_new' });
  agent.create.mockResolvedValue({ agent_id: 'agent_new' });
  llm.update.mockResolvedValue({});
  agent.update.mockResolvedValue({});
});

describe('syncAgentToRetell', () => {
  it('creates LLM + agent when neither id exists and returns synced status', async () => {
    const res = await syncAgentToRetell(baseAgent, 'http://hook');
    expect(llm.create).toHaveBeenCalledOnce();
    expect(agent.create).toHaveBeenCalledOnce();
    expect(res.retell_llm_id).toBe('llm_new');
    expect(res.retell_agent_id).toBe('agent_new');
    expect(res.sync_status).toBe('synced');
    expect(res.sync_error).toBeNull();
  });

  it('updates existing LLM + agent when ids exist (no create)', async () => {
    const existing = { ...baseAgent, retell_llm_id: 'llm_x', retell_agent_id: 'agent_x' };
    const res = await syncAgentToRetell(existing, 'http://hook');
    expect(llm.update).toHaveBeenCalledWith('llm_x', expect.objectContaining({ general_prompt: 'PROMPT' }));
    expect(agent.update).toHaveBeenCalledOnce();
    expect(llm.create).not.toHaveBeenCalled();
    expect(res.sync_status).toBe('synced');
  });

  it('relinks an existing agent to a newly-created LLM (legacy agent: has agent id, no llm id)', async () => {
    const legacy = { ...baseAgent, retell_llm_id: null, retell_agent_id: 'agent_x' };
    const res = await syncAgentToRetell(legacy, 'http://hook');
    // No llm id → a fresh LLM is created…
    expect(llm.create).toHaveBeenCalledOnce();
    // …and the existing agent is re-pointed at it via response_engine.
    expect(agent.update).toHaveBeenCalledWith('agent_x', expect.objectContaining({
      response_engine: { type: 'retell-llm', llm_id: 'llm_new' },
    }));
    expect(res.retell_llm_id).toBe('llm_new');
    expect(res.sync_status).toBe('synced');
  });

  it('compiles the prompt from builder_config when present', async () => {
    const guided = {
      ...baseAgent,
      builder_config: {
        interviewer_persona: 'friendly recruiter', company_blurb: '', tone: 'conversational',
        phases: { rapport: { enabled: true, guidance: '' }, screening: { enabled: true, guidance: '' }, deep_dive: { enabled: true, guidance: '' }, candidate_qa: { enabled: true, guidance: '' }, closing: { enabled: true, guidance: '' } },
        dos: [], donts: [], greeting: '', closing: '',
      },
    };
    await syncAgentToRetell(guided, 'http://hook');
    const passedPrompt = llm.create.mock.calls[0][0].general_prompt as string;
    expect(passedPrompt).toContain('friendly recruiter');
    expect(passedPrompt).toContain('{{candidate_name}}');
  });

  it('returns error status with message when Retell throws', async () => {
    llm.create.mockRejectedValueOnce(new Error('boom'));
    const res = await syncAgentToRetell(baseAgent, 'http://hook');
    expect(res.sync_status).toBe('error');
    expect(res.sync_error).toContain('boom');
  });

  it('preserves a newly-created llm_id in error result when agent.create fails', async () => {
    agent.create.mockRejectedValueOnce(new Error('agent-boom'));
    const res = await syncAgentToRetell(baseAgent, 'http://hook');
    expect(res.retell_llm_id).toBe('llm_new');
    expect(res.retell_agent_id).toBeNull();
    expect(res.sync_status).toBe('error');
  });

  it('does not throw when builder_config is malformed — returns error status', async () => {
    const bad = { ...baseAgent, builder_config: { tone: 'conversational' } as any }; // missing phases
    const res = await syncAgentToRetell(bad, 'http://hook');
    expect(res.sync_status).toBe('error');
    expect(res.sync_error).toBeTruthy();
  });
});

describe('fetchRetellAgentForPull', () => {
  it('retrieves one agent and resolves its llm general_prompt', async () => {
    agent.retrieve.mockResolvedValue({ agent_id: 'ag9', agent_name: 'Pulled', voice_id: 'v2', language: 'en-GB', max_call_duration_ms: 900000, response_engine: { type: 'retell-llm', llm_id: 'l9' } });
    llm.retrieve.mockResolvedValue({ llm_id: 'l9', general_prompt: 'EDITED IN RETELL' });

    const res = await fetchRetellAgentForPull('ag9');
    expect(res).toMatchObject({
      retell_agent_id: 'ag9', retell_llm_id: 'l9', name: 'Pulled',
      voice_id: 'v2', language: 'en-GB', max_call_duration_sec: 900, system_prompt: 'EDITED IN RETELL',
    });
  });

  it('fetchRetellAgentForPull throws for a non-retell-llm agent (no silent blank)', async () => {
    agent.retrieve.mockResolvedValue({ agent_id: 'ag1', agent_name: 'X', response_engine: { type: 'conversation-flow', conversation_flow_id: 'cf1' } });
    await expect(fetchRetellAgentForPull('ag1')).rejects.toThrow(/retell-llm/);
  });

  it('fetchRetellAgentForPull propagates an LLM-fetch failure instead of blanking the prompt', async () => {
    agent.retrieve.mockResolvedValue({ agent_id: 'ag2', agent_name: 'Y', voice_id: 'v', language: 'en-US', max_call_duration_ms: 600000, response_engine: { type: 'retell-llm', llm_id: 'l2' } });
    llm.retrieve.mockRejectedValueOnce(new Error('llm-down'));
    await expect(fetchRetellAgentForPull('ag2')).rejects.toThrow('llm-down');
  });
});

describe('fetchRetellAgentsForImport', () => {
  it('returns agents with their llm general_prompt resolved', async () => {
    agent.list.mockResolvedValue([
      { agent_id: 'ag1', agent_name: 'One', voice_id: 'v1', language: 'en-US', max_call_duration_ms: 600000, response_engine: { type: 'retell-llm', llm_id: 'l1' } },
    ]);
    llm.retrieve.mockResolvedValue({ llm_id: 'l1', general_prompt: 'HELLO PROMPT' });

    const result = await fetchRetellAgentsForImport();
    expect(result[0]).toMatchObject({
      retell_agent_id: 'ag1', retell_llm_id: 'l1', name: 'One',
      voice_id: 'v1', language: 'en-US', max_call_duration_sec: 600, system_prompt: 'HELLO PROMPT',
    });
  });
});
