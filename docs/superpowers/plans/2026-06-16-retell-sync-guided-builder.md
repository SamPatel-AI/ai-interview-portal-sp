# Retell Two-Way Sync + Guided Agent Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent's system prompt actually reach Retell (currently broken), and let non-technical recruiters build agents via structured fields that compile into the prompt, with a one-time import and a test-call feature.

**Architecture:** Portal is source of truth. Each `ai_agents` row maps to two Retell objects — an LLM (holds `general_prompt`) and an agent (holds voice/language/duration). A new `syncAgentToRetell` pushes synchronously on save and records `sync_status`. Guided agents store structured `builder_config` (JSONB) that `compileSystemPrompt` turns into the prompt; legacy/imported agents keep a raw editable prompt.

**Tech Stack:** Express + TypeScript, `retell-sdk@^4`, Supabase (`supabaseAdmin`), Zod, Vitest (new to backend), BullMQ (unused here — sync is synchronous). Frontend is Lovable (delivered as a prompt doc).

**Spec:** `docs/superpowers/specs/2026-06-16-retell-sync-guided-builder-design.md`

---

## File Structure

- `backend/vitest.config.ts` — **create** — Vitest config for backend unit tests.
- `backend/package.json` — **modify** — add `vitest` devDep + `test` scripts.
- `supabase/migrations/012_agent_retell_sync.sql` — **create** — new `ai_agents` columns.
- `backend/src/types/index.ts` — **modify** — extend `AIAgent`, add `BuilderConfig`/`SyncStatus`.
- `backend/src/utils/retellPromptBuilder.ts` — **modify** — add `compileSystemPrompt` + `buildSampleVariables`.
- `backend/src/utils/retellPromptBuilder.test.ts` — **create** — unit tests for the two new pure functions.
- `backend/src/services/retell.service.ts` — **modify** — LLM object handling, `syncAgentToRetell`, shared post-call constant, delete LLM.
- `backend/src/services/retell.service.test.ts` — **create** — sync engine tests with mocked `retellClient`.
- `backend/src/routes/agents.routes.ts` — **modify** — guided/legacy Zod schemas, POST/PATCH wired to sync, `/:id/sync`, `/:id/test-call`, `/import`.
- `backend/src/routes/agents.schema.test.ts` — **create** — Zod schema unit tests (guided vs legacy bodies).
- `backend/src/routes/webhooks.routes.ts` — **modify** — skip DB writes when `metadata.test === 'true'`.
- `docs/lovable-prompts/2026-06-16-guided-agent-builder.md` — **create** — Lovable prompt for the wizard UI.

---

## Task 1: Backend Vitest harness

**Files:**
- Create: `backend/vitest.config.ts`
- Modify: `backend/package.json`
- Create: `backend/src/utils/__smoke__.test.ts` (temporary smoke test, deleted in Step 5)

- [ ] **Step 1: Add Vitest config**

Create `backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 2: Add scripts + dev dependency**

In `backend/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Then install:

Run: `cd backend && npm install -D vitest@^2`
Expected: `vitest` appears in `devDependencies`, install succeeds.

- [ ] **Step 3: Write a smoke test**

Create `backend/src/utils/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `cd backend && npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 5: Delete smoke test + commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
rm backend/src/utils/__smoke__.test.ts
git add backend/vitest.config.ts backend/package.json backend/package-lock.json
git commit -m "chore: add Vitest harness to backend"
```

---

## Task 2: Migration 012 + type updates

**Files:**
- Create: `supabase/migrations/012_agent_retell_sync.sql`
- Modify: `backend/src/types/index.ts:67-86`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/012_agent_retell_sync.sql`:

```sql
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
```

- [ ] **Step 2: Update the AIAgent type + add config types**

In `backend/src/types/index.ts`, replace the `AIAgent` interface (lines 67-86) and add new types directly above it:

```ts
export type SyncStatus = 'pending' | 'synced' | 'error' | 'imported';

export interface PhaseConfig {
  enabled: boolean;
  guidance: string;
}

export interface BuilderConfig {
  interviewer_persona: string;
  company_blurb: string;
  tone: InterviewStyle;
  phases: {
    rapport: PhaseConfig;
    screening: PhaseConfig;
    deep_dive: PhaseConfig;
    candidate_qa: PhaseConfig;
    closing: PhaseConfig;
  };
  dos: string[];
  donts: string[];
  greeting: string;
  closing: string;
}

export interface AIAgent {
  id: string;
  org_id: string;
  client_company_id: string | null;
  name: string;
  retell_agent_id: string | null;
  retell_llm_id: string | null;
  system_prompt: string;
  builder_config: BuilderConfig | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  sync_error: string | null;
  voice_id: string;
  language: string;
  interview_style: InterviewStyle;
  max_call_duration_sec: number;
  evaluation_criteria: Record<string, unknown>;
  greeting_template: string | null;
  closing_template: string | null;
  fallback_behavior: Record<string, unknown>;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS (no errors). If `InterviewStyle` is not already imported/defined in this file, confirm it exists — it is referenced by the existing `AIAgent.interview_style`, so it is already in scope.

- [ ] **Step 4: Apply migration to local/linked DB**

Run: `supabase db push --linked` (per `docs` / memory `reference-supabase-migrations` — CLI `--linked` works).
Expected: Migration 012 applies; `\d ai_agents` shows the 5 new columns.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add supabase/migrations/012_agent_retell_sync.sql backend/src/types/index.ts
git commit -m "feat: migration 012 + types for Retell sync + builder_config"
```

---

## Task 3: `compileSystemPrompt`

**Files:**
- Modify: `backend/src/utils/retellPromptBuilder.ts`
- Create: `backend/src/utils/retellPromptBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/utils/retellPromptBuilder.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/utils/retellPromptBuilder.test.ts`
Expected: FAIL — `compileSystemPrompt is not a function` / not exported.

- [ ] **Step 3: Implement `compileSystemPrompt`**

Append to `backend/src/utils/retellPromptBuilder.ts` (keep existing exports). Add the import of `BuilderConfig` to the top import line `import { AIAgent, Application, Candidate, Job, BuilderConfig } from '../types';`:

```ts
/**
 * Compile a guided-builder config into a full system-prompt template.
 * This OWNS inserting the {{dynamic_variables}} that the call layer fills
 * per application — recruiters never type them. Disabled phases are omitted.
 */
export function compileSystemPrompt(config: BuilderConfig): string {
  const toneLine: Record<string, string> = {
    conversational: 'Keep a warm, conversational tone. Use the candidate\'s first name naturally.',
    technical: 'Take a technical deep-dive tone. Probe for depth and push past surface answers.',
    formal: 'Keep a professional, structured tone with clear transitions between topics.',
  };

  const parts: string[] = [];

  parts.push(
    `# Role`,
    `You are ${config.interviewer_persona || 'a professional AI screening interviewer'} working on behalf of {{company_name}}.`,
    `You are conducting a first-round screening interview for the {{job_title}} position.`,
    '',
    toneLine[config.tone] ?? toneLine.formal,
    '',
    config.company_blurb ? `About the company: ${config.company_blurb}` : `About the company: {{company_name}}.`,
    '',
    `# Candidate Info`,
    `- Name: {{candidate_name}}`,
    `- Email: {{candidate_email}}`,
    `- Background: {{candidate_background_summary}}`,
    '',
    `IMPORTANT: Do NOT read questions from a list. Weave interview topics into natural conversation. If a topic is already answered, do not re-ask it. When an answer is vague, ask a follow-up before moving on.`,
    '---',
  );

  if (config.phases.rapport.enabled) {
    parts.push(
      `## Phase — Rapport`,
      config.greeting ? config.greeting : `Greet the candidate by first name, introduce yourself and the purpose of the call.`,
      `Use these talking points to build rapport: {{candidate_talking_points}}`,
      config.phases.rapport.guidance,
      '',
    );
  }
  if (config.phases.screening.enabled) {
    parts.push(
      `## Phase — Mandatory Screening`,
      `Transition naturally, then confirm: {{mandate_questions}}`,
      `Keep these brief and conversational — not a checklist.`,
      config.phases.screening.guidance,
      '',
    );
  }
  if (config.phases.deep_dive.enabled) {
    parts.push(
      `## Phase — Deep-dive`,
      `Explore 5-7 of these topics based on the conversation flow: {{interview_questions}}`,
      `Ask follow-ups when answers are vague. Skip topics already covered.`,
      config.phases.deep_dive.guidance,
      '',
    );
  }
  if (config.phases.candidate_qa.enabled) {
    parts.push(
      `## Phase — Candidate Questions`,
      `Ask: "Before we wrap up, do you have any questions about the role or {{company_name}}?" Answer what you can; defer specifics to the recruiter.`,
      config.phases.candidate_qa.guidance,
      '',
    );
  }
  if (config.phases.closing.enabled) {
    parts.push(
      `## Phase — Closing`,
      config.closing ? config.closing : `Thank the candidate and let them know the recruitment team will follow up within 2-3 business days.`,
      config.phases.closing.guidance,
      '',
    );
  }

  parts.push('---', '{{call_context}}', '');

  parts.push(`# Guidelines`);
  for (const d of config.dos) parts.push(`- ${d}`);
  for (const d of config.donts) parts.push(`- ${d}`);

  // Drop empty lines produced by blank guidance fields, but keep intentional spacing.
  return parts.filter((p, i) => !(p === '' && parts[i - 1] === '')).join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/utils/retellPromptBuilder.test.ts`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/utils/retellPromptBuilder.ts backend/src/utils/retellPromptBuilder.test.ts
git commit -m "feat: compileSystemPrompt — builder_config to prompt template"
```

---

## Task 4: `buildSampleVariables` (for test calls)

**Files:**
- Modify: `backend/src/utils/retellPromptBuilder.ts`
- Modify: `backend/src/utils/retellPromptBuilder.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `backend/src/utils/retellPromptBuilder.test.ts`:

```ts
import { buildSampleVariables } from './retellPromptBuilder';

describe('buildSampleVariables', () => {
  it('provides every key the compiled prompt references', () => {
    const vars = buildSampleVariables({ jobTitle: 'Senior Developer', companyName: 'Acme Co' });
    for (const k of ['candidate_name', 'candidate_first_name', 'candidate_email', 'candidate_background_summary', 'candidate_talking_points', 'job_title', 'company_name', 'mandate_questions', 'interview_questions', 'call_context']) {
      expect(vars[k]).toBeDefined();
      expect(vars[k].length).toBeGreaterThan(0);
    }
  });

  it('falls back to generic title/company when none given', () => {
    const vars = buildSampleVariables({});
    expect(vars.job_title).toBe('the position');
    expect(vars.company_name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/utils/retellPromptBuilder.test.ts`
Expected: FAIL — `buildSampleVariables is not a function`.

- [ ] **Step 3: Implement `buildSampleVariables`**

Append to `backend/src/utils/retellPromptBuilder.ts`:

```ts
interface SampleContext {
  jobTitle?: string;
  companyName?: string;
}

/**
 * Build realistic sample dynamic variables for a TEST call, so a recruiter
 * can hear the agent before using it on real candidates. Covers every key
 * compileSystemPrompt / the default prompt reference.
 */
export function buildSampleVariables(ctx: SampleContext): Record<string, string> {
  return {
    candidate_name: 'Alex Sample',
    candidate_first_name: 'Alex',
    candidate_email: 'alex.sample@example.com',
    candidate_background_summary: 'Five years of relevant experience with strong communication skills.',
    candidate_talking_points: 'Recently led a cross-functional project. Background in the target industry.',
    job_title: ctx.jobTitle || 'the position',
    company_name: ctx.companyName || 'our company',
    job_location: 'Remote',
    interview_style_instructions: 'Style: Warm and conversational.',
    mandate_questions: '1. Are you authorized to work in the country?\n2. What are your salary expectations?',
    interview_questions: 'Topic: Recent project experience — Explore through natural conversation\nTopic: Problem-solving approach — Explore through natural conversation',
    call_context: 'This is a TEST call to preview the agent. Treat the caller as a sample candidate.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/utils/retellPromptBuilder.test.ts`
Expected: PASS — all tests (Task 3 + Task 4) pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/utils/retellPromptBuilder.ts backend/src/utils/retellPromptBuilder.test.ts
git commit -m "feat: buildSampleVariables for agent test calls"
```

---

## Task 5: Sync engine in `retell.service.ts`

**Files:**
- Modify: `backend/src/services/retell.service.ts`
- Create: `backend/src/services/retell.service.test.ts`

- [ ] **Step 1: Write the failing test (mock retellClient)**

Create `backend/src/services/retell.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the retell config module so retellClient is a controllable stub.
const llm = { create: vi.fn(), update: vi.fn(), retrieve: vi.fn(), delete: vi.fn() };
const agent = { create: vi.fn(), update: vi.fn(), delete: vi.fn(), list: vi.fn() };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/retell.service.test.ts`
Expected: FAIL — `syncAgentToRetell is not exported`.

- [ ] **Step 3: Implement the sync engine**

In `backend/src/services/retell.service.ts`:

(a) Add imports at top:

```ts
import { AIAgent, SyncStatus } from '../types';
import { compileSystemPrompt } from '../utils/retellPromptBuilder';
```

(b) Extract the shared post-call analysis config as a module constant (replace the inline array in `createRetellAgent`):

```ts
export const POST_CALL_ANALYSIS_DATA = [
  { name: 'call_summary', type: 'string' as any, description: 'A detailed summary of the interview call including key points discussed.' },
  { name: 'call_successful', type: 'boolean' as any, description: 'Whether the interview was completed successfully (candidate answered questions).' },
  { name: 'candidate_sentiment', type: 'enum' as any, description: 'Overall sentiment of the candidate during the call.', choices: ['Positive', 'Neutral', 'Negative'] },
  { name: 'callback_requested', type: 'boolean' as any, description: 'Whether the candidate asked to be called back later.' },
  { name: 'callback_time_minutes', type: 'number' as any, description: 'If callback was requested, how many minutes later the candidate wants to be called. 0 if not requested.' },
];
```

(c) Add the sync function:

```ts
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
    // 1. LLM object holds the prompt.
    if (!llmId) {
      const created = await retellClient.llm.create({ general_prompt: generalPrompt } as any);
      llmId = created.llm_id;
    } else {
      await retellClient.llm.update(llmId, { general_prompt: generalPrompt } as any);
    }

    // 2. Agent object holds voice/language/duration and points at the LLM.
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
```

(d) Update `deleteRetellAgent` to also delete the LLM. Change its signature and body:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/retell.service.test.ts`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Typecheck + commit**

Run: `cd backend && npm run typecheck`
Expected: PASS.

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/services/retell.service.ts backend/src/services/retell.service.test.ts
git commit -m "feat: syncAgentToRetell — push prompt to Retell LLM + agent"
```

---

## Task 6: Wire routes (POST/PATCH/sync) + Zod schemas

**Files:**
- Modify: `backend/src/routes/agents.routes.ts`
- Create: `backend/src/routes/agents.schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `backend/src/routes/agents.schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routes/agents.schema.test.ts`
Expected: FAIL — cannot find module `./agents.schema`.

- [ ] **Step 3: Create the schema module**

Create `backend/src/routes/agents.schema.ts`:

```ts
import { z } from 'zod';

const phaseSchema = z.object({ enabled: z.boolean(), guidance: z.string().default('') });

export const builderConfigSchema = z.object({
  interviewer_persona: z.string().default(''),
  company_blurb: z.string().default(''),
  tone: z.enum(['formal', 'conversational', 'technical']).default('conversational'),
  phases: z.object({
    rapport: phaseSchema,
    screening: phaseSchema,
    deep_dive: phaseSchema,
    candidate_qa: phaseSchema,
    closing: phaseSchema,
  }),
  dos: z.array(z.string()).default([]),
  donts: z.array(z.string()).default([]),
  greeting: z.string().default(''),
  closing: z.string().default(''),
});

export const agentBodySchema = z.object({
  name: z.string().min(1),
  client_company_id: z.string().uuid().optional(),
  voice_id: z.string().min(1),
  language: z.string().default('en-US'),
  interview_style: z.enum(['formal', 'conversational', 'technical']).default('conversational'),
  max_call_duration_sec: z.number().int().min(60).max(3600).default(1200),
  evaluation_criteria: z.record(z.unknown()).optional(),
  greeting_template: z.string().optional(),
  closing_template: z.string().optional(),
  is_active: z.boolean().optional(),
  // Guided agents send builder_config; legacy/imported send system_prompt.
  builder_config: builderConfigSchema.optional(),
  system_prompt: z.string().min(10).optional(),
}).refine(
  (b) => !!b.builder_config || (!!b.system_prompt && b.system_prompt.length >= 10),
  { message: 'Provide either builder_config (guided) or system_prompt (legacy).' },
);

export const updateAgentBodySchema = agentBodySchema; // same shape; PATCH replaces config wholesale
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routes/agents.schema.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Rewire POST and PATCH in `agents.routes.ts`**

Replace the existing `createAgentSchema`/`updateAgentSchema` definitions (lines ~21-35) and the POST (`router.post('/', ...)`) and PATCH (`router.patch('/:id', ...)`) handlers. Update imports to pull from the new schema + sync engine:

```ts
import { syncAgentToRetell, deleteRetellAgent, listVoices } from '../services/retell.service';
import { compileSystemPrompt } from '../utils/retellPromptBuilder';
import { agentBodySchema, updateAgentBodySchema } from './agents.schema';
```

Helper to compute the webhook URL (reuse existing inline logic; define once near top of file):

```ts
function postCallWebhookUrl(): string {
  return env.NODE_ENV === 'production'
    ? `${env.FRONTEND_URL.replace('://app.', '://api.')}/api/webhooks/retell/post-call`
    : `${env.FRONTEND_URL}/api/webhooks/retell/post-call`;
}
```

POST handler:

```ts
router.post('/', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const body = agentBodySchema.parse(req.body);
    const system_prompt = body.builder_config ? compileSystemPrompt(body.builder_config) : body.system_prompt!;

    // Insert row first (so it persists even if Retell push fails).
    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .insert({
        name: body.name,
        client_company_id: body.client_company_id ?? null,
        voice_id: body.voice_id,
        language: body.language,
        interview_style: body.interview_style,
        max_call_duration_sec: body.max_call_duration_sec,
        evaluation_criteria: body.evaluation_criteria ?? {},
        greeting_template: body.greeting_template ?? null,
        closing_template: body.closing_template ?? null,
        builder_config: body.builder_config ?? null,
        system_prompt,
        is_active: body.is_active ?? true,
        org_id: req.user!.org_id,
        created_by: req.user!.id,
        sync_status: 'pending',
      })
      .select()
      .single();
    if (error || !row) throw new AppError(500, 'Failed to save agent');

    // Push to Retell, then persist the resulting ids/status.
    const sync = await syncAgentToRetell(row, postCallWebhookUrl());
    const { data: synced } = await supabaseAdmin
      .from('ai_agents')
      .update({
        retell_llm_id: sync.retell_llm_id,
        retell_agent_id: sync.retell_agent_id,
        sync_status: sync.sync_status,
        sync_error: sync.sync_error,
        last_synced_at: sync.last_synced_at,
      })
      .eq('id', row.id)
      .select()
      .single();

    await supabaseAdmin.from('activity_log').insert({
      org_id: req.user!.org_id, user_id: req.user!.id,
      entity_type: 'ai_agent', entity_id: row.id, action: 'created',
      details: { name: body.name, sync_status: sync.sync_status },
    });

    res.status(201).json({ success: true, data: synced ?? row });
  } catch (err) { next(err); }
});
```

PATCH handler:

```ts
router.patch('/:id', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const body = updateAgentBodySchema.parse(req.body);
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();
    if (fetchErr || !existing) throw new AppError(404, 'Agent not found');

    const system_prompt = body.builder_config ? compileSystemPrompt(body.builder_config) : body.system_prompt!;

    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .update({
        name: body.name,
        client_company_id: body.client_company_id ?? null,
        voice_id: body.voice_id,
        language: body.language,
        interview_style: body.interview_style,
        max_call_duration_sec: body.max_call_duration_sec,
        evaluation_criteria: body.evaluation_criteria ?? existing.evaluation_criteria,
        greeting_template: body.greeting_template ?? null,
        closing_template: body.closing_template ?? null,
        builder_config: body.builder_config ?? null,
        system_prompt,
        is_active: body.is_active ?? existing.is_active,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error || !row) throw new AppError(500, 'Failed to update agent');

    const sync = await syncAgentToRetell(row, postCallWebhookUrl());
    const { data: synced } = await supabaseAdmin
      .from('ai_agents')
      .update({
        retell_llm_id: sync.retell_llm_id,
        retell_agent_id: sync.retell_agent_id,
        sync_status: sync.sync_status,
        sync_error: sync.sync_error,
        last_synced_at: sync.last_synced_at,
      })
      .eq('id', row.id)
      .select()
      .single();

    res.json({ success: true, data: synced ?? row });
  } catch (err) { next(err); }
});
```

- [ ] **Step 6: Add the manual re-sync route**

Add after PATCH, before DELETE:

```ts
router.post('/:id/sync', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();
    if (error || !row) throw new AppError(404, 'Agent not found');

    const sync = await syncAgentToRetell(row, postCallWebhookUrl());
    const { data: synced } = await supabaseAdmin
      .from('ai_agents')
      .update({
        retell_llm_id: sync.retell_llm_id,
        retell_agent_id: sync.retell_agent_id,
        sync_status: sync.sync_status,
        sync_error: sync.sync_error,
        last_synced_at: sync.last_synced_at,
      })
      .eq('id', row.id)
      .select()
      .single();

    if (sync.sync_status === 'error') throw new AppError(502, `Retell sync failed: ${sync.sync_error}`);
    res.json({ success: true, data: synced });
  } catch (err) { next(err); }
});
```

- [ ] **Step 7: Update DELETE to pass the llm id**

In the DELETE handler, change the select to include `retell_llm_id` and the delete call:

```ts
      .select('retell_agent_id, retell_llm_id')
```
```ts
        await deleteRetellAgent(existing.retell_agent_id, existing.retell_llm_id);
```

- [ ] **Step 8: Typecheck + run all backend tests**

Run: `cd backend && npm run typecheck && npm test`
Expected: PASS — typecheck clean, all test files green.

- [ ] **Step 9: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/routes/agents.routes.ts backend/src/routes/agents.schema.ts backend/src/routes/agents.schema.test.ts
git commit -m "feat: wire agent POST/PATCH/sync to Retell sync engine + guided schema"
```

---

## Task 7: Test-call endpoint + webhook guard

**Files:**
- Modify: `backend/src/routes/agents.routes.ts`
- Modify: `backend/src/routes/webhooks.routes.ts:336-342`

- [ ] **Step 1: Add the test-call route**

In `agents.routes.ts`, add import of `createOutboundCall` and `buildSampleVariables`:

```ts
import { createOutboundCall } from '../services/retell.service';
import { buildSampleVariables } from '../utils/retellPromptBuilder';
```

Add route (after `/:id/sync`):

```ts
const testCallSchema = z.object({ phone_number: z.string().min(8).max(20) });

router.post('/:id/test-call', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const { phone_number } = testCallSchema.parse(req.body);
    const { data: row, error } = await supabaseAdmin
      .from('ai_agents')
      .select('retell_agent_id, name, client_companies(name)')
      .eq('id', req.params.id)
      .eq('org_id', req.user!.org_id)
      .single();
    if (error || !row) throw new AppError(404, 'Agent not found');
    if (!row.retell_agent_id) throw new AppError(409, 'Sync the agent first before testing.');

    const companyName = (row as any).client_companies?.name as string | undefined;
    const vars = buildSampleVariables({ companyName });

    const call = await createOutboundCall({
      agentId: row.retell_agent_id,
      toNumber: phone_number,
      dynamicVariables: vars,
      metadata: { test: 'true' },
    });

    res.json({ success: true, data: { call_id: call.callId, status: call.status } });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Add the webhook guard**

In `backend/src/routes/webhooks.routes.ts`, immediately after `const { event, call } = body;` (line ~337), add:

```ts
    // Test calls (from the agent builder) carry metadata.test and must not
    // create call records or evaluations.
    if (call?.metadata?.test === 'true') {
      logger.info(`Skipping DB write for test call ${call?.call_id}`);
      res.json({ received: true, test: true });
      return;
    }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional, requires RETELL_API_KEY + real number)**

Run the backend (`make be-dev`), then:
`curl -X POST localhost:3001/api/agents/<id>/test-call -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"phone_number":"+1..."}'`
Expected: `409` if agent unsynced; otherwise a real call to your phone and `{success:true,...}`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/routes/agents.routes.ts backend/src/routes/webhooks.routes.ts
git commit -m "feat: agent test-call endpoint + skip DB writes for test calls"
```

---

## Task 8: One-time import endpoint

**Files:**
- Modify: `backend/src/services/retell.service.ts`
- Modify: `backend/src/routes/agents.routes.ts`
- Modify: `backend/src/services/retell.service.test.ts`

- [ ] **Step 1: Add failing test for the import helper**

Append to `backend/src/services/retell.service.test.ts`:

```ts
import { fetchRetellAgentsForImport } from './retell.service';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/retell.service.test.ts`
Expected: FAIL — `fetchRetellAgentsForImport is not exported`.

- [ ] **Step 3: Implement the import helper**

Append to `backend/src/services/retell.service.ts`:

```ts
export interface ImportedAgent {
  retell_agent_id: string;
  retell_llm_id: string | null;
  name: string;
  voice_id: string;
  language: string;
  max_call_duration_sec: number;
  system_prompt: string;
}

/** List all Retell agents and resolve each one's LLM general_prompt. */
export async function fetchRetellAgentsForImport(): Promise<ImportedAgent[]> {
  const agents = await retellClient.agent.list();
  const out: ImportedAgent[] = [];
  for (const a of agents as any[]) {
    const llmId = a.response_engine?.llm_id ?? null;
    let prompt = '';
    if (llmId) {
      try {
        const llmObj = await retellClient.llm.retrieve(llmId);
        prompt = (llmObj as any).general_prompt ?? '';
      } catch { /* leave prompt empty if the LLM cannot be fetched */ }
    }
    out.push({
      retell_agent_id: a.agent_id,
      retell_llm_id: llmId,
      name: a.agent_name ?? 'Imported agent',
      voice_id: a.voice_id ?? '',
      language: a.language ?? 'en-US',
      max_call_duration_sec: a.max_call_duration_ms ? Math.round(a.max_call_duration_ms / 1000) : 1200,
      system_prompt: prompt,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/retell.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the import route**

In `agents.routes.ts`, add import: `import { fetchRetellAgentsForImport } from '../services/retell.service';` and the route (admin only):

```ts
router.post('/import', requireRole('admin'), async (req, res, next) => {
  try {
    const remote = await fetchRetellAgentsForImport();

    // Skip agents already linked in this org.
    const { data: existingRows } = await supabaseAdmin
      .from('ai_agents')
      .select('retell_agent_id')
      .eq('org_id', req.user!.org_id)
      .not('retell_agent_id', 'is', null);
    const linked = new Set((existingRows ?? []).map((r: any) => r.retell_agent_id));

    let imported = 0;
    let skipped = 0;
    for (const a of remote) {
      if (linked.has(a.retell_agent_id)) { skipped++; continue; }
      const { error } = await supabaseAdmin.from('ai_agents').insert({
        org_id: req.user!.org_id,
        created_by: req.user!.id,
        name: a.name,
        retell_agent_id: a.retell_agent_id,
        retell_llm_id: a.retell_llm_id,
        system_prompt: a.system_prompt,
        builder_config: null,
        voice_id: a.voice_id,
        language: a.language,
        max_call_duration_sec: a.max_call_duration_sec,
        interview_style: 'conversational',
        is_active: true,
        sync_status: 'imported',
        last_synced_at: new Date().toISOString(),
      });
      if (error) { skipped++; continue; }
      imported++;
    }

    res.json({ success: true, data: { imported, skipped } });
  } catch (err) { next(err); }
});
```

- [ ] **Step 6: Typecheck + full test run**

Run: `cd backend && npm run typecheck && npm test`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add backend/src/services/retell.service.ts backend/src/services/retell.service.test.ts backend/src/routes/agents.routes.ts
git commit -m "feat: one-time import of existing Retell agents"
```

---

## Task 9: Lovable prompt for the guided builder UI

**Files:**
- Create: `docs/lovable-prompts/2026-06-16-guided-agent-builder.md`

- [ ] **Step 1: Write the Lovable prompt doc**

Create `docs/lovable-prompts/2026-06-16-guided-agent-builder.md` with the full prompt to hand to Lovable. It must specify:

- Replace `AgentBuilder.tsx` with a **multi-step wizard** (Steps 1-5 below). Keep the existing voice picker and eval-criteria editor.
- **Step 1 · Basics:** name, client company (dropdown from `/api/companies`), voice picker (existing `/api/agents/voices`), language, max duration slider.
- **Step 2 · Personality & tone:** `interviewer_persona` (text), `tone` selector (formal/conversational/technical, human-described), `company_blurb` (optional, placeholder notes auto-fill from company).
- **Step 3 · Interview flow:** 5 phase toggles (`rapport`, `screening`, `deep_dive`, `candidate_qa`, `closing`), each with an optional "anything specific for this part?" textarea; `greeting`/`closing` override fields.
- **Step 4 · Guardrails:** `dos` / `donts` as add/remove chip lists, seeded with defaults ("Ask follow-ups when answers are vague" / "Don't give away answer hints").
- **Step 5 · Review & test:** read-only compiled-prompt preview (the API returns `system_prompt`; show collapsed), a `sync_status` badge (synced/pending/error/imported), a **"Send me a test call"** phone input that POSTs to `/api/agents/:id/test-call`, and Save.
- On Save, POST/PATCH `/api/agents` with `builder_config` (NOT `system_prompt`) for guided agents. The body shape matches `builderConfigSchema` (persona, company_blurb, tone, phases{enabled,guidance}, dos, donts, greeting, closing) plus name/voice_id/language/interview_style/max_call_duration_sec/client_company_id.
- **Legacy/imported agents** (`builder_config === null` in the GET response): open a simple raw `system_prompt` textarea editor instead of the wizard, with a note "Imported from Retell — editing raw prompt", and POST/PATCH with `system_prompt`.
- Show a **"Retry sync"** button (POSTs `/api/agents/:id/sync`) whenever `sync_status === 'error'`, displaying `sync_error`.
- No `{{variable}}` chips anywhere in the guided path.
- Add an admin-only **"Import from Retell"** button on the Agents page that POSTs `/api/agents/import` and toasts `{imported, skipped}`.

- [ ] **Step 2: Commit**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git add docs/lovable-prompts/2026-06-16-guided-agent-builder.md
git commit -m "docs: Lovable prompt for guided agent builder wizard"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full backend gate**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 2: Manual prod-parity verification (after deploy)**

1. Create an agent via the wizard → open the Retell dashboard and confirm the LLM's `general_prompt` is populated (the core fix).
2. POST `/api/agents/:id/test-call` to a real number → confirm the call runs the compiled prompt and **no** call record/evaluation is created.
3. POST `/api/agents/import` → confirm existing Retell agents are pulled in once; re-run → confirm `skipped` increments, `imported` is 0.
4. Edit an imported (legacy) agent's raw prompt → save → confirm `sync_status='synced'` and Retell LLM updated.

- [ ] **Step 3: Open the PR**

```bash
cd "/Users/sahilmedtrics/Side Project/Interview Portal"
git push -u origin feat/retell-sync-guided-builder
gh pr create --title "Retell two-way sync + guided agent builder (#6)" --body "Implements roadmap #6 per docs/superpowers/specs/2026-06-16-retell-sync-guided-builder-design.md. Fixes the bug where system_prompt never reached Retell; adds guided builder_config compilation, synchronous sync with status, one-time import, and test calls."
```

Note: pushing requires the `SamPatel-AI` gh account active (+ `workflow` scope is not needed here — no `.github` files change). User merges the PR; Railway auto-deploys `main`. Migration 012 must be applied to prod **before** the deploy serves traffic.

---

## Self-Review Notes

- **Spec coverage:** §1 data model → Task 2; §2 compiler/config → Tasks 3 + schema in 6; §3 sync engine → Tasks 5 + 6; §4 test call → Task 7; §5 import → Task 8; §6 frontend → Task 9; §7 testing → Tasks 3-8 (unit) + Task 10 (manual). All covered.
- **Type consistency:** `syncAgentToRetell(agent, webhookUrl)`, `SyncResult`, `buildSampleVariables(ctx)`, `compileSystemPrompt(config)`, `fetchRetellAgentsForImport()`, `agentBodySchema`/`builderConfigSchema` names match across tasks.
- **No placeholders:** every code step shows real code; commands have expected output.
