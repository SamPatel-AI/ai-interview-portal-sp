# Retell Two-Way Sync + Guided Agent Builder — Design

**Date:** 2026-06-16
**Roadmap item:** #6 (AI Agent ↔ Retell sync + guided form builder for non-technical recruiters)
**Status:** Approved design, pending implementation plan

## Problem

Two gaps, bundled into one roadmap item:

1. **The system prompt never reaches Retell.** In `retell.service.ts`, `createRetellAgent` creates the agent with `response_engine: { type:'retell-llm', llm_id:'' }` — an auto-created *empty* LLM — and `updateRetellAgent` only pushes name/voice/language/duration. The prompt in Retell lives on the **LLM object** (`general_prompt`), not the agent, so the carefully-built `system_prompt` in our DB is never applied. `buildSystemPrompt()` exists but is never called. Every call currently runs on a blank Retell prompt with only dynamic variables injected (into nothing). **Even one-way prompt sync is broken.**

2. **No guided builder for non-technical users.** `AgentBuilder.tsx` exposes a raw `system_prompt` textarea with `{{variable}}` chips — prompt engineering a recruiter shouldn't have to do.

## Scope & decisions

- **Build sync engine first, then the guided builder** (the builder is pointless until its output reaches Retell).
- **Portal is the source of truth.** Recruiters edit only in the portal; we reliably push to Retell. A one-time **import** pulls in agents that already exist in Retell. No ongoing Retell→portal reconciliation, no conflict resolution.
- **Guided builder = structured fields + read-only compiled-prompt preview.** Recruiters never hand-edit the prompt; the backend compiles it. Legacy/imported agents fall back to a raw-prompt editor.
- **Test call included** — recruiters can send a live Retell test call to their own number before using an agent on real candidates.
- **Sync executes synchronously on save** (Approach A) — agent edits are rare, so synchronous gives immediate confirmation and pairs with the test-call flow. A `sync_status` column makes failures visible and retryable. No BullMQ job, no scheduled reconcile.

## Retell object model (the thing that drives the design)

A Retell **agent** references a response engine `{ type:'retell-llm', llm_id }`. The **prompt lives on the LLM object** (`general_prompt`), not the agent. So each of our agents maps to **two** Retell objects:

- a **Retell LLM** (`llm.create/update`) — holds `general_prompt` (our compiled prompt)
- a **Retell agent** (`agent.create/update`) — holds `voice_id`, `language`, `max_call_duration_ms`, `post_call_analysis_data`, `webhook_url`, and points at the LLM via `llm_id`

We must store both Retell IDs. The missing `retell_llm_id` is the root cause of the broken prompt sync.

## Section 1 — Data model (migration 012)

Add to `ai_agents`:

| Column | Type | Purpose |
|---|---|---|
| `retell_llm_id` | TEXT | Retell LLM object ID (holds the prompt). Currently missing. |
| `builder_config` | JSONB | Source of truth for guided-builder agents. NULL for legacy/imported agents. |
| `sync_status` | TEXT NOT NULL DEFAULT `'pending'` | `synced` / `pending` / `error` / `imported`. |
| `last_synced_at` | TIMESTAMPTZ | Last successful push to Retell. |
| `sync_error` | TEXT | Last Retell error message, for the "Retry sync" UI. |

`system_prompt` stays, with a dual role:
- **Guided agents** (`builder_config IS NOT NULL`): `system_prompt` is the **compiled output** — used for the read-only preview and pushed to Retell as `general_prompt`. Recompiled on every save.
- **Legacy/imported agents** (`builder_config IS NULL`): `system_prompt` is the editable raw prompt.

`prompt_mode` is implied by `builder_config IS NULL`, so no extra column.

Migration uses `ADD COLUMN IF NOT EXISTS` and is additive/backward-compatible. Existing agents become `sync_status='pending'`; their first save (or a manual sync) fixes their broken prompt sync.

## Section 2 — Structured config schema + prompt compiler

`builder_config` (JSONB) — all plain-language; no `{{vars}}` ever shown to the user:

```jsonc
{
  "interviewer_persona": "warm, professional recruiter",  // short free text
  "company_blurb": "",          // optional; auto-filled from client_company if blank
  "tone": "conversational",     // aligns with interview_style: formal|conversational|technical
  "phases": {                    // toggles + optional per-phase guidance
    "rapport":      { "enabled": true, "guidance": "" },
    "screening":    { "enabled": true, "guidance": "" },
    "deep_dive":    { "enabled": true, "guidance": "" },
    "candidate_qa": { "enabled": true, "guidance": "" },
    "closing":      { "enabled": true, "guidance": "" }
  },
  "dos":   ["Ask follow-ups when answers are vague"],
  "donts": ["Don't give away answer hints"],
  "greeting": "",                // optional override
  "closing":  ""                 // optional override
}
```

New **`compileSystemPrompt(builderConfig, agent)`** in `retellPromptBuilder.ts`:
- Assembles the full templated prompt from the structure proven in today's `getDefaultSystemPrompt()`, but driven by the toggles/fields.
- **Owns inserting the dynamic placeholders** — `{{candidate_name}}`, `{{candidate_email}}`, `{{candidate_background_summary}}`, `{{candidate_talking_points}}`, `{{mandate_questions}}`, `{{interview_questions}}`, `{{call_context}}`, `{{company_name}}`, `{{job_title}}` — into the right phases. The user never types these.
- Disabled phases are omitted entirely; per-phase `guidance` is appended to that phase's instructions.
- Empty/minimal config still compiles to a sane default (parity with current default prompt).

Per-application dynamic variables continue to flow exactly as today via `buildDynamicVariables()` / `buildInboundContext()` — **no change to `call.service.ts`** for that path. The only behavioral change is that Retell now actually holds the prompt those variables substitute into.

## Section 3 — Sync engine (`retell.service.ts` + `agents.routes.ts`)

**`syncAgentToRetell(agent)`** — new core function:
1. Determine `general_prompt`: compiled from `builder_config` for guided agents, or the raw `system_prompt` for legacy.
2. LLM object: if no `retell_llm_id` → `llm.create({ general_prompt, ... })` and store the new id; else `llm.update(retell_llm_id, { general_prompt })`.
3. Agent object: if no `retell_agent_id` → `agent.create({ response_engine:{ type:'retell-llm', llm_id }, voice_id, language, max_call_duration_ms, post_call_analysis_data, webhook_url, voicemail_option })` and store the id; else `agent.update(retell_agent_id, { voice_id, language, max_call_duration_ms, ... })`.
4. On success → `sync_status='synced'`, `last_synced_at=now()`, `sync_error=null`. On failure → `sync_status='error'`, `sync_error=<message>`. The DB row is always persisted; only the Retell push is conditional.

`post_call_analysis_data` (call_summary, call_successful, candidate_sentiment, callback_requested, callback_time_minutes) moves to a shared constant reused by create + import.

Route wiring:
- **POST /api/agents** — validate (guided body: `builder_config`; legacy body: `system_prompt`), compile if guided, insert row, then `syncAgentToRetell`. Return the row incl. `sync_status`/`sync_error`.
- **PATCH /api/agents/:id** — same: recompile if guided, update row, then `syncAgentToRetell`.
- **POST /api/agents/:id/sync** — manual "Retry sync" for `error` agents.
- **DELETE /api/agents/:id** — soft-delete (`is_active=false`) + best-effort `agent.delete` **and** `llm.delete`.

This fixes the broken prompt sync for **all** agents, not just new guided ones.

## Section 4 — Test call

**POST /api/agents/:id/test-call** `{ phone_number }` (admin/recruiter):
- Guard: agent must have `retell_agent_id` (synced); else `409 "Sync the agent first."`
- `buildSampleVariables(agent)` helper produces realistic sample dynamic variables (e.g. candidate "Alex Sample", a sample job title from the agent's linked company/job or a generic fallback, 2–3 sample interview/mandate questions) so the agent has context to run a believable call.
- Calls existing `createOutboundCall` with the recruiter's number and `metadata:{ test:'true' }`.
- `webhooks.routes.ts` post-call handler gets one guard: when `metadata.test === 'true'`, skip DB writes / evaluations.
- Rate-limited via the existing limiter to prevent abuse.

## Section 5 — One-time import

**POST /api/agents/import** (admin):
- `agent.list()` from Retell. For each agent whose `agent_id` is not already linked in `ai_agents`:
  - `llm.retrieve(llm_id)` for `general_prompt`.
  - Insert `ai_agents` row: `builder_config=null` (legacy/raw), `system_prompt=general_prompt`, `retell_agent_id` + `retell_llm_id` set, `voice_id`/`language`/`max_call_duration_sec` from the Retell agent, `sync_status='imported'`, `org_id`/`created_by` from the calling admin.
- Returns `{ imported, skipped }`. Idempotent — re-running skips already-linked agents.

## Section 6 — Frontend guided builder (Lovable prompt)

Delivered as a Lovable prompt (frontend is Lovable-built; backend is hand-edited). `AgentBuilder.tsx` becomes a guided, multi-step wizard:

- **Step 1 · Basics** — name, client company, voice picker (keep existing), language, max duration.
- **Step 2 · Personality & tone** — interviewer persona (plain text), tone selector (3 styles, human-described), company blurb (optional, auto-filled from linked company).
- **Step 3 · Interview flow** — toggle the 5 phases on/off, each with an optional "anything specific for this part?" box; greeting/closing overrides.
- **Step 4 · Guardrails** — do's / don'ts as add/remove chip lists, seeded with sensible defaults.
- **Step 5 · Review & test** — read-only compiled-prompt preview (collapsed by default), sync-status badge, "Send me a test call" phone field (`POST /test-call`), and Save.
- **Legacy/imported agents** (`builder_config === null`) open a simple raw-prompt editor with a note "Imported from Retell — editing raw prompt."
- A **"Retry sync"** action shows whenever `sync_status === 'error'`.
- No `{{variable}}` chips anywhere in the guided path — the compiler owns placeholders.

The eval-criteria editor (already present) stays as-is, available in an advanced/optional area.

## Section 7 — Testing

**Backend unit (Vitest):**
- `compileSystemPrompt` — phase toggles include/exclude correct blocks; all referenced dynamic placeholders present in output; persona/tone/guardrails render; empty config → sane default.
- `buildSampleVariables` — produces every key the compiled prompt references.
- Sync engine (mock `retellClient`) — create-vs-update branching on presence of `retell_llm_id` / `retell_agent_id`; `sync_status`/`sync_error` set correctly on success and failure.
- Routes — Zod validation (guided vs legacy bodies); test-call returns 409 when unsynced; import idempotency.

**Manual prod verification:**
1. Build an agent via the wizard → confirm it appears in the Retell dashboard **with `general_prompt` populated** (the core fix).
2. Fire a test call to a real number; confirm the agent runs the compiled prompt and the test call is excluded from DB/evaluations.
3. Run import against the existing Retell account; confirm existing agents are pulled in once and re-runs skip them.

## Out of scope (deferred)

- Ongoing Retell→portal reconciliation / drift detection.
- Bidirectional conflict resolution and prompt versioning.
- Agent prompt A/B testing or analytics.
- Multi-language prompt compilation beyond passing `language` to Retell.
