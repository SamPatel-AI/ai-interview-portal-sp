import { describe, it, expect } from 'vitest';
import { compileSystemPrompt } from './retellPromptBuilder';
import type { BuilderConfig } from '../types';

const fullConfig: BuilderConfig = {
  interviewer_persona: 'warm, professional recruiter',
  company_blurb: '',
  tone: 'conversational',
  phases: {
    rapport: { enabled: true, guidance: '' },
    screening: { enabled: true, guidance: 'Confirm work authorization.' },
    deep_dive: { enabled: true, guidance: '' },
    candidate_qa: { enabled: true, guidance: '' },
    closing: { enabled: true, guidance: '' },
  },
  dos: ['Ask follow-ups when answers are vague'],
  donts: ["Don't give away answer hints"],
  greeting: '',
  closing: '',
};

describe('compileSystemPrompt', () => {
  it('includes the interviewer persona and tone', () => {
    const prompt = compileSystemPrompt(fullConfig);
    expect(prompt).toContain('warm, professional recruiter');
  });

  it('always inserts dynamic placeholders the call layer fills', () => {
    const prompt = compileSystemPrompt(fullConfig);
    for (const v of ['{{candidate_name}}', '{{job_title}}', '{{company_name}}', '{{interview_questions}}', '{{mandate_questions}}', '{{call_context}}']) {
      expect(prompt).toContain(v);
    }
  });

  it('omits a phase block when that phase is disabled', () => {
    const noScreening: BuilderConfig = {
      ...fullConfig,
      phases: { ...fullConfig.phases, screening: { enabled: false, guidance: '' } },
    };
    const prompt = compileSystemPrompt(noScreening);
    expect(prompt).not.toContain('{{mandate_questions}}');
  });

  it('renders per-phase guidance text', () => {
    const prompt = compileSystemPrompt(fullConfig);
    expect(prompt).toContain('Confirm work authorization.');
  });

  it('renders dos and donts', () => {
    const prompt = compileSystemPrompt(fullConfig);
    expect(prompt).toContain('Ask follow-ups when answers are vague');
    expect(prompt).toContain("Don't give away answer hints");
  });
});
