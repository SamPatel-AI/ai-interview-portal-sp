# Lovable Prompt — Guided AI Agent Builder Wizard

Paste the prompt below into Lovable. It rebuilds the agent creation/edit experience as a guided, non-technical wizard backed by the new backend (already deployed). Recruiters never write a prompt or see `{{variables}}` — they fill structured fields and the backend compiles the prompt.

---

## Context for the prompt author (not part of the Lovable prompt)

**Backend API (already live):**
- `GET /api/agents` — list (each row includes `sync_status`, `builder_config`, `system_prompt`, `retell_agent_id`).
- `GET /api/agents/:id` — detail (includes `builder_config`, `system_prompt`, `sync_status`, `sync_error`, `client_companies`).
- `POST /api/agents` — create. Send EITHER `builder_config` (guided) OR `system_prompt` (legacy), plus base fields.
- `PATCH /api/agents/:id` — update. **Send the FULL agent definition** (the backend recompiles + re-syncs and writes `builder_config` wholesale; a partial body would wipe it).
- `POST /api/agents/:id/sync` — manual retry; returns 502 if Retell sync still fails.
- `POST /api/agents/:id/test-call` — body `{ phone_number }`. 409 if the agent isn't synced yet.
- `POST /api/agents/import` — admin only; returns `{ imported, skipped }`.
- `GET /api/agents/voices`, `GET /api/companies` — existing.

**`builder_config` shape the API expects:**
```json
{
  "interviewer_persona": "string",
  "company_blurb": "string",
  "tone": "formal | conversational | technical",
  "phases": {
    "rapport":      { "enabled": true, "guidance": "string" },
    "screening":    { "enabled": true, "guidance": "string" },
    "deep_dive":    { "enabled": true, "guidance": "string" },
    "candidate_qa": { "enabled": true, "guidance": "string" },
    "closing":      { "enabled": true, "guidance": "string" }
  },
  "dos": ["string"],
  "donts": ["string"],
  "greeting": "string",
  "closing": "string"
}
```
Base fields alongside it: `name`, `voice_id`, `language`, `interview_style` (mirror `tone`), `max_call_duration_sec`, `client_company_id` (optional), `is_active`.

---

## ===== PROMPT TO PASTE INTO LOVABLE =====

Rebuild the AI Agent creation/edit experience as a **guided multi-step wizard** for non-technical recruiters. Today there's a single form with a raw "system prompt" textarea and `{{variable}}` chips — remove that entirely from the guided path. Recruiters should never see or write a prompt or template variables. Instead they fill plain-language fields, and our backend compiles the prompt.

### Wizard structure (5 steps, with a progress indicator and Back/Next)

**Step 1 — Basics**
- Agent name (text, required)
- Client company (dropdown from `GET /api/companies`, optional)
- Voice (keep the existing voice picker from `GET /api/agents/voices`)
- Language (dropdown: English US/UK/IN, Hindi, Spanish, French, German)
- Max call duration (slider, 5–60 min)

**Step 2 — Personality & tone**
- Interviewer persona (short text, e.g. "warm, professional recruiter") → maps to `interviewer_persona`
- Tone (3 selectable cards, human-described, not jargon) → maps to BOTH `tone` and `interview_style`:
  - "Conversational" — warm and friendly, uses the candidate's name
  - "Formal" — professional and structured
  - "Technical" — deep, probing follow-ups
- Company blurb (optional multiline; helper text: "Leave blank to use the company name automatically") → `company_blurb`

**Step 3 — Interview flow**
- Five phase toggles (default all ON), each with an optional "Anything specific for this part?" textarea (→ that phase's `guidance`):
  - Rapport (warm-up & intros)
  - Screening (mandatory questions)
  - Deep-dive (role-specific topics)
  - Candidate Q&A
  - Closing
- Optional "Custom greeting" and "Custom closing" textareas → `greeting` / `closing`

**Step 4 — Guardrails**
- "Do's" — add/remove chip list, seeded with: "Ask follow-ups when answers are vague", "Use the candidate's first name naturally" → `dos`
- "Don'ts" — add/remove chip list, seeded with: "Don't give away answer hints", "Don't argue with the candidate" → `donts`

**Step 5 — Review & test**
- A **read-only** collapsed preview of the generated prompt. After the agent is saved, this is the `system_prompt` field returned by `GET /api/agents/:id`. (Before first save, you may show "Save to generate preview.") Render it monospace, clearly labeled "Generated prompt (read-only)".
- A **sync status badge**: map `sync_status` → `synced` (green "Live on Retell"), `pending` (gray "Syncing…"), `error` (red "Sync failed"), `imported` (blue "Imported").
- If `sync_status === 'error'`: show the `sync_error` text and a **"Retry sync"** button that POSTs `/api/agents/:id/sync` and refreshes.
- **"Send me a test call"**: a phone-number input + button that POSTs `/api/agents/:id/test-call` with `{ phone_number }`. On 409, show "Save the agent first, then test." On success, toast "Calling <number> now — pick up to hear your agent."
- Save button.

### Save behavior
- On Save for a **guided** agent, POST (create) or PATCH (edit) `/api/agents[/:id]` with `builder_config` (the full object above) plus the base fields (`name`, `voice_id`, `language`, `interview_style`, `max_call_duration_sec`, `client_company_id`, `is_active`). Do NOT send `system_prompt`.
- PATCH must send the **complete** definition (full `builder_config` + base fields), never a partial patch.
- After save, refetch the agent so the preview + sync badge reflect the server result.

### Legacy / imported agents
- When `GET /api/agents/:id` returns `builder_config === null` (imported from Retell or legacy), do NOT open the wizard. Open a simple editor with: a raw `system_prompt` textarea, the basic fields (name, voice, language, duration, company, active), the sync badge + Retry-sync, and the test-call control. Add a note: "Imported from Retell — editing the raw prompt." On save, PATCH with `system_prompt` (not `builder_config`).

### Agents list page
- Show each agent's sync-status badge (same mapping as above).
- Add an admin-only **"Import from Retell"** button that POSTs `/api/agents/import`, then toasts the result (`Imported {imported}, skipped {skipped}`) and refreshes the list.

### Constraints
- No `{{variable}}` chips or raw-prompt editing anywhere in the guided wizard path.
- Keep the existing evaluation-criteria editor available (e.g., an "Advanced" section), unchanged.
- Match the app's existing shadcn/Tailwind styling and the current dialog/sheet patterns.

## ===== END PROMPT =====
