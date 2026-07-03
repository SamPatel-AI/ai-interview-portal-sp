import { describe, it, expect } from 'vitest';
import { compileSystemPrompt, compileBeginMessage, buildSampleVariables, buildDynamicVariables, buildInboundContext, buildInboundBeginMessage } from './retellPromptBuilder';
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
    expect(prompt).not.toContain('Mandatory Screening');
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

describe('compileSystemPrompt — empty guidelines', () => {
  it('does NOT emit a # Guidelines header when dos and donts are both empty', () => {
    const noGuidelinesConfig: BuilderConfig = {
      ...fullConfig,
      dos: [],
      donts: [],
    };
    const prompt = compileSystemPrompt(noGuidelinesConfig);
    expect(prompt).not.toContain('# Guidelines');
  });
});

describe('buildDynamicVariables', () => {
  it('always returns the 5 required keys as strings even with minimal ctx', () => {
    const minimalCtx = {
      candidate: { first_name: 'Jo', last_name: 'Doe', email: 'jo@x.com' } as any,
      application: {} as any,
      job: { title: 'Dev' } as any,
      agent: { interview_style: 'formal' } as any,
    };
    const vars = buildDynamicVariables(minimalCtx);
    for (const k of [
      'candidate_background_summary',
      'candidate_talking_points',
      'mandate_questions',
      'interview_questions',
      'call_context',
    ]) {
      expect(k in vars).toBe(true);
      expect(typeof vars[k]).toBe('string');
    }
  });
});

describe('buildSampleVariables', () => {
  it('provides every key the compiled prompt references', () => {
    const vars = buildSampleVariables({ jobTitle: 'Senior Developer', companyName: 'Acme Co' });
    for (const k of ['candidate_name', 'candidate_first_name', 'candidate_email', 'candidate_background_summary', 'candidate_talking_points', 'job_title', 'company_name', 'mandate_questions', 'interview_questions', 'call_context']) {
      expect(vars[k]).toBeDefined();
      expect(vars[k].length).toBeGreaterThan(0);
    }
  });

  it('falls back to a realistic noun-phrase title/company when none given', () => {
    const vars = buildSampleVariables({});
    // Templates say "the {{job_title}} position" — the fallback must be a bare
    // noun phrase ("Software Engineer"), not one that doubles the article/noun
    // ("the the position position").
    expect(vars.job_title).toBe('Software Engineer');
    expect(vars.job_title).not.toMatch(/\bthe\b|\bposition\b/i);
    expect(vars.company_name.length).toBeGreaterThan(0);
  });
});

describe('buildInboundContext company_name', () => {
  it('always includes company_name (empty when absent)', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'A', last_name: 'B', email: 'a@b.com' } } as any);
    expect(vars.company_name).toBe('');
  });
  it('uses the provided company name', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'A', last_name: 'B', email: 'a@b.com' }, job: { title: 'Dev', company_name: 'Acme' } } as any);
    expect(vars.company_name).toBe('Acme');
  });
});

describe('compileSystemPrompt — voice best practices', () => {
  it('includes spoken-conversation style rules and scenario handling', () => {
    const prompt = compileSystemPrompt(fullConfig);
    expect(prompt).toContain('one or two sentences');
    expect(prompt).toContain('ONE question at a time');
    expect(prompt).toContain('could you say that again');
    expect(prompt).toContain('resumed or returned call');
    expect(prompt).toContain('never make or imply hiring decisions');
  });
});

describe('compileBeginMessage', () => {
  it('defaults to an identity-check opener', () => {
    expect(compileBeginMessage(fullConfig)).toBe('Hi, am I speaking with {{candidate_first_name}}?');
  });
  it('uses a configured greeting verbatim', () => {
    const cfg = { ...fullConfig, greeting: '  Hi, this is Grace from Saanvi — is this {{candidate_first_name}}?  ' };
    expect(compileBeginMessage(cfg)).toBe('Hi, this is Grace from Saanvi — is this {{candidate_first_name}}?');
  });
});

describe('buildInboundBeginMessage', () => {
  it('asks who is calling when the caller is unknown', () => {
    const msg = buildInboundBeginMessage({});
    expect(msg).toContain('May I ask who');
  });
  it('acknowledges a missed-call callback as a scheduled interview', () => {
    const msg = buildInboundBeginMessage({ candidateFirstName: 'Sam', jobTitle: 'Full Stack Developer', missedCall: true });
    expect(msg).toContain('Sam');
    expect(msg).toContain('tried to reach you');
    expect(msg).toContain('scheduled Full Stack Developer interview');
  });
  it('prefers the interrupted-call opener over missed-call', () => {
    const msg = buildInboundBeginMessage({ candidateFirstName: 'Sam', missedCall: true, interruptedCall: true });
    expect(msg).toContain('pick up right where we left off');
  });
  it('receives a fresh inbound call without sounding outbound', () => {
    const msg = buildInboundBeginMessage({ candidateFirstName: 'Sam', jobTitle: 'Full Stack Developer' });
    expect(msg).toContain("you've reached");
    expect(msg).toContain('your Full Stack Developer interview');
  });
  it('avoids "the your interview interview" when job title is missing', () => {
    const msg = buildInboundBeginMessage({ candidateFirstName: 'Sam' });
    expect(msg).toContain('your interview');
    expect(msg).not.toContain('the your');
  });
});

describe('buildInboundContext — general inbound', () => {
  it('tells the agent the candidate called us when there is no missed/interrupted call', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'Sam', last_name: 'Patel', email: 's@p.com' }, job: { title: 'Dev' } } as any);
    expect(vars.call_context).toContain('The candidate called us');
    expect(vars.call_context).toContain('Do not speak as if you placed this call');
  });
  it('keeps the missed-call context when a missed call exists', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'Sam', last_name: 'Patel', email: 's@p.com' }, missedCall: { transcript: '' } } as any);
    expect(vars.call_context).toContain('calling back');
    expect(vars.call_context).not.toContain('The candidate called us');
  });
  it('missed-call context offers a now-or-reschedule choice and forbids jumping in', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'Sam', last_name: 'Patel', email: 's@p.com' }, job: { title: 'Dev' }, missedCall: { transcript: '' } } as any);
    expect(vars.call_context).toContain('SCHEDULED interview');
    expect(vars.call_context).toContain('Do NOT jump into interview questions');
    expect(vars.call_context).toContain('right now');
    expect(vars.call_context).toContain('RESCHEDULE');
  });
  it('interrupted resume wins over missed-call context', () => {
    const vars = buildInboundContext({ candidate: { first_name: 'Sam', last_name: 'Patel', email: 's@p.com' }, missedCall: { transcript: '' }, interruptedCall: { transcript: 'earlier convo' } } as any);
    expect(vars.call_context).toContain('interrupted');
    expect(vars.call_context).not.toContain('SCHEDULED interview');
  });
});
