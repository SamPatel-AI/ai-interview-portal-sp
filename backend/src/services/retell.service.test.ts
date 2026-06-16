import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the stubs are available when vi.mock factories run.
const { llm, agent } = vi.hoisted(() => {
  const llm = { create: vi.fn(), update: vi.fn(), retrieve: vi.fn(), delete: vi.fn() };
  const agent = { create: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn() };
  return { llm, agent };
});

// Mock the retell config module so retellClient is a controllable stub.
vi.mock('../config/retell', () => ({ retellClient: { llm, agent, voice: { list: vi.fn() }, call: {}, phoneNumber: {} } }));
vi.mock('../config/env', () => ({ env: { RETELL_FROM_NUMBER: '+10000000000', NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:8082' } }));

import { syncAgentToRetell } from './retell.service';

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
  });

  it('returns error status with message when Retell throws', async () => {
    llm.create.mockRejectedValueOnce(new Error('boom'));
    const res = await syncAgentToRetell(baseAgent, 'http://hook');
    expect(res.sync_status).toBe('error');
    expect(res.sync_error).toContain('boom');
  });
});
