import { describe, it, expect } from 'vitest';
import { agentBodySchema } from './agents.schema';

const phases = {
  rapport: { enabled: true, guidance: '' },
  screening: { enabled: true, guidance: '' },
  deep_dive: { enabled: true, guidance: '' },
  candidate_qa: { enabled: true, guidance: '' },
  closing: { enabled: true, guidance: '' },
};

describe('agentBodySchema', () => {
  it('accepts a guided body with builder_config', () => {
    const r = agentBodySchema.safeParse({
      name: 'Guided', voice_id: 'v1',
      builder_config: { interviewer_persona: 'recruiter', company_blurb: '', tone: 'conversational', phases, dos: [], donts: [], greeting: '', closing: '' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a legacy body with system_prompt and no builder_config', () => {
    const r = agentBodySchema.safeParse({ name: 'Legacy', voice_id: 'v1', system_prompt: 'You are an interviewer.' });
    expect(r.success).toBe(true);
  });

  it('rejects a body with neither builder_config nor system_prompt', () => {
    const r = agentBodySchema.safeParse({ name: 'Empty', voice_id: 'v1' });
    expect(r.success).toBe(false);
  });
});
