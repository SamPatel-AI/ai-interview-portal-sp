# Phase 2 — Implementation Plan

## Status Legend
- **DONE** — Already built and working
- **PARTIAL** — Groundwork exists, needs completion
- **TODO** — Not started, needs full implementation

---

## 1. Features From Your Requirements

### 1.1 Interview Scheduling Restrictions — `PARTIAL`

**What exists:** Calls can be scheduled with a `scheduled_at` timestamp. Cal.com handles slot selection externally.

**What's missing:**
- Business hours configuration per org/company (e.g., 9 AM–5 PM EST)
- Blackout date management (holidays, freeze periods)
- Custom date range windows per job
- Timezone-aware scheduling validation
- Candidate-facing availability display

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `scheduling_config` JSONB column to `organizations` and `jobs` tables | `supabase/migrations/002_phase2.sql` |
| 2 | Create scheduling config schema: `{ business_hours: {start, end, timezone, days[]}, blackout_dates: string[], custom_windows: {start, end}[] }` | `backend/src/schemas/scheduling.ts` |
| 3 | Add `GET/PATCH /api/settings/scheduling` endpoints for org-level config | `backend/src/routes/settings.ts` |
| 4 | Add per-job scheduling override in `PATCH /api/jobs/:id` | `backend/src/routes/jobs.ts` |
| 5 | Add validation middleware that checks scheduling constraints before creating/scheduling any call | `backend/src/middleware/schedulingGuard.ts` |
| 6 | Update `POST /calls/schedule` and `POST /calls/batch` to reject calls outside allowed windows | `backend/src/routes/calls.ts` |
| 7 | Update Cal.com webhook to validate booked time against restrictions | `backend/src/routes/webhooks.ts` |
| 8 | Build scheduling settings UI in Settings page → new "Scheduling" tab | `frontend/src/pages/Settings.tsx` |
| 9 | Build per-job scheduling config in job create/edit forms | `frontend/src/components/CreateJobDialog.tsx` |
| 10 | Show available windows when scheduling calls manually | `frontend/src/pages/Calls.tsx` |

---

### 1.2 Call Resumption — Pick Up Where It Left Off — `DONE`

**What exists:**
- `is_resumption` flag and `parent_call_id` FK on calls table
- `resumeInterruptedCall()` service that creates new call with previous context
- Callback scheduling via `scheduleCallback()` in call retry job
- Retell post-call webhook detects interruptions and auto-schedules callback
- Previous transcript passed in dynamic variables for continuity
- Frontend shows parent/child call chains in call detail sheet
- Retry button for failed/interrupted calls

**Status: Fully implemented.** No further work needed.

---

### 1.3 Calendar Self-Booking (Cal.com Integration) — `DONE`

**What exists:**
- `POST /api/webhooks/cal-booking` receives booking events from Cal.com
- Auto-extracts candidate email from attendees, finds matching application
- Validates AI agent is assigned to the job
- Auto-schedules AI call at the booked time
- Updates application status to 'screening'
- Frontend sends invitation emails with Cal.com scheduling link

**Status: Fully implemented.** Works end-to-end with the scheduling restrictions feature above to limit available slots.

---

## 2. Dashboard & Recruiter Portal

### 2.1 Individual Recruiter Logins — `DONE`

**What exists:**
- Supabase Auth with email/password and Google OAuth
- Role-based access: `admin`, `recruiter`, `viewer` (user_role enum)
- `requireRole()` middleware for backend route protection
- `ProtectedRoute` wrapper on frontend
- `AuthContext` with `signIn`, `signUp`, `signInWithGoogle`, `signOut`

**Status: Fully implemented.**

---

### 2.2 Recruiter Workload Management — `PARTIAL`

**What exists:**
- `GET /api/analytics/recruiter/:id` — shows applications handled, calls completed, avg duration, evaluation breakdown
- `assigned_recruiter_id` on both applications and jobs tables
- Analytics page has "Recruiter Performance" tab

**What's missing:**
- Dedicated workload dashboard showing all recruiters side-by-side
- Recruiter capacity settings (max concurrent applications)
- Auto-assignment / load balancing
- Reassignment functionality

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/analytics/recruiters` endpoint — returns all recruiters with their current load (open applications, scheduled calls, pending evaluations) | `backend/src/routes/analytics.ts` |
| 2 | Add `POST /api/applications/:id/assign` endpoint for reassignment | `backend/src/routes/applications.ts` |
| 3 | Add `max_capacity` column to users table | `supabase/migrations/002_phase2.sql` |
| 4 | Build recruiter workload comparison view — bar chart of load per recruiter | `frontend/src/pages/Analytics.tsx` |
| 5 | Add recruiter reassignment dropdown in application detail sheet | `frontend/src/components/ApplicationDetailSheet.tsx` |

---

### 2.3 Candidate Management Dashboard — `DONE`

**What exists:**
- Full candidate list with search and filters
- Add candidate dialog (name, email, phone, source, resume upload)
- Candidate detail sheet: contact info, work authorization, resume preview, applications list, call history, emails
- Bulk resume upload

**Status: Fully implemented.**

---

### 2.4 Job Management Portal — `DONE`

**What exists:**
- Job CRUD with table view
- Filters by status (open, closed, on_hold, filled)
- CEIPAL sync
- Job detail sheet: all fields, assigned recruiter/agent, application pipeline by status
- Create/edit forms with all fields

**Status: Fully implemented.**

---

### 2.5 Company-Wise AI Agents — `DONE`

**What exists:**
- `client_company_id` FK on `ai_agents` table
- Agent builder with: name, company selection, voice, language, interview style, max duration, evaluation criteria, greeting/closing templates, system prompt
- Company detail sheet shows all assigned agents
- Agents filterable by company

**Status: Fully implemented.**

---

### 2.6 Company-Wise Job Portal — `DONE`

**What exists:**
- `client_company_id` FK on `jobs` table
- Company detail sheet shows all jobs (active + inactive)
- Companies page with grid cards showing job count and agent count

**Status: Fully implemented.**

---

### 2.7 Application Pipeline View — `DONE`

**What exists:**
- Kanban view with 6 stages: New → Screening → Interviewed → Shortlisted → Rejected → Hired
- Table view with AI score, status, date
- Pre-interview actions: Send Invite, Reject
- Post-interview actions: Shortlist, Reject
- AI screening trigger
- Application detail sheet with full screening results, call history, transcript, evaluations

**Status: Fully implemented.**

---

### 2.8 Call Management Console — `DONE`

**What exists:**
- Call list with search and status filters
- Schedule call, batch calls, call now, retry
- Call detail sheet: transcript, recording playback (1x/1.5x/2x), AI analysis, sentiment, cost
- Call resumption chain tracking

**Status: Fully implemented.**

---

### 2.9 Call Evaluation & Decision Making — `DONE`

**What exists:**
- `POST /api/calls/:id/evaluate` endpoint
- Star rating (1–5), notes, decision (advance/reject/callback/hold)
- Evaluation auto-updates application status (advance → shortlisted, reject → rejected)
- Evaluation visible in call detail sheet and application detail sheet

**Status: Fully implemented.**

---

### 2.10 Analytics & Reporting — `PARTIAL`

**What exists:**
- Dashboard KPIs: total candidates, open jobs, total calls, calls today, pending reviews
- Application pipeline visualization
- Top jobs by application volume
- Recruiter performance analytics
- Agent performance analytics (call success rate, sentiment, duration)
- Recharts visualizations (line, bar, pie)

**What's missing:**
- PDF/CSV export of any analytics view
- Scheduled report delivery (email)
- Custom date range filtering on analytics

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/reports/export` endpoint with `format=csv|pdf` and `type=pipeline|recruiter|agent|calls` query params | `backend/src/routes/reports.ts` |
| 2 | Install `pdfkit` or `puppeteer` for PDF generation | `backend/package.json` |
| 3 | Build CSV serializer for each report type | `backend/src/services/reportGenerator.ts` |
| 4 | Add date range filter component to Analytics page | `frontend/src/pages/Analytics.tsx` |
| 5 | Add export buttons (CSV, PDF) to each analytics tab | `frontend/src/pages/Analytics.tsx` |
| 6 | Add export button to candidate/job/application list pages | Multiple frontend pages |

---

### 2.11 Activity Audit Log — `PARTIAL`

**What exists:**
- `activity_log` table with org_id, user_id, entity_type, entity_id, action, details, timestamp
- Dashboard shows recent activity widget
- Backend logs actions for major operations

**What's missing:**
- Dedicated activity log page with full filtering (by user, entity type, date range, action)
- Pagination for activity log
- Search within activity log

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/activity` endpoint with filters: `user_id`, `entity_type`, `action`, `from`, `to`, pagination | `backend/src/routes/activity.ts` |
| 2 | Build dedicated Activity Log page with filter bar and paginated table | `frontend/src/pages/ActivityLog.tsx` |
| 3 | Add route to React Router | `frontend/src/App.tsx` |
| 4 | Add sidebar navigation item | `frontend/src/components/DashboardLayout.tsx` |

---

### 2.12 Email History — `PARTIAL`

**What exists:**
- `email_logs` table with application_id, candidate_id, type, subject, body, status, sent_at
- Backend email queue with BullMQ, rate limiting, duplicate prevention
- Email templates (invitation, rejection, follow_up) in code
- Frontend has an Emails page but it's a **placeholder only**

**What's missing:**
- Functional email list view with filters
- Email detail view (subject, body, delivery status)
- Per-candidate and per-application email history in detail sheets
- Actually sending emails (Microsoft Graph API integration is stubbed)

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Activate email sending via Nodemailer SMTP (done in Sprint 3 — section 3.3 step 1) | `backend/src/services/email.service.ts` |
| 2 | Add `GET /api/emails` endpoint with filters: `candidate_id`, `application_id`, `type`, `status`, pagination | `backend/src/routes/emails.ts` |
| 3 | Build functional Emails page — table with candidate, type, subject, status, date | `frontend/src/pages/Emails.tsx` |
| 4 | Add email detail sheet or expandable row showing body and delivery status | `frontend/src/components/EmailDetailSheet.tsx` |
| 5 | Add configurable email templates UI in Settings | `frontend/src/pages/Settings.tsx` |

---

### 2.13 Team Management — `TODO`

**What exists:**
- Settings page has a "Team" tab but it's marked **"coming soon"**
- Backend has user CRUD basics (signup, role assignment)

**What's missing:**
- Invite team member flow
- Role management UI (change user roles)
- Deactivate/reactivate team members
- Team member list with status

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/users` (org-scoped list), `POST /api/users/invite`, `PATCH /api/users/:id/role`, `PATCH /api/users/:id/deactivate` | `backend/src/routes/users.ts` |
| 2 | Add Supabase invite-by-email flow using admin SDK | `backend/src/services/userService.ts` |
| 3 | Build Team tab: member list with role badges, invite button, role dropdown, activate/deactivate toggle | `frontend/src/pages/Settings.tsx` |

---

## 3. Agency Priority Features

### 3.1 Robust Inbound Call Handling — `TODO` ⭐ PRIORITY

**Why:** Candidates who miss the AI's outbound call and call back currently get a broken experience. This loses candidates the agency has already invested in screening.

**Current state (code audit 2026-04-14):**

| What | Status | Location | Detail |
|------|--------|----------|--------|
| `formatPhoneE164()` | ✅ Done | `phone.ts:5-22` | Normalizes US numbers to +1XXXXXXXXXX |
| `isValidE164()` | ✅ Done | `phone.ts:27-29` | Validates E.164 regex |
| `normalizeForLookup()` | ❌ Missing | — | Needed: strip to digits for comparison |
| `phonesMatch()` | ❌ Missing | — | Needed: compare two phone strings reliably |
| Inbound webhook handler | ✅ 80% done | `webhooks.routes.ts:480-622` | Works for happy path, gaps below |
| Phone lookup query | ⚠️ Fragile | `webhooks.routes.ts:502-508` | Uses `.ilike('phone', '%${cleanedPhone}%')` with `.single()` — fails on multiple matches |
| Interrupted call resumption | ✅ Done | `webhooks.routes.ts:552-586` | Checks for `status='interrupted'`, loads transcript, sets `is_resumption` |
| Missed-call-callback detection | ❌ Missing | — | No check for `no_answer`/`voicemail` outbound before treating inbound as callback |
| Post-call status detection | ✅ Done | `webhooks.routes.ts:380-402` | Correctly detects: no_answer, voicemail, completed, failed, interrupted |
| `scheduleCallRetry()` function | ✅ Done | `callRetry.job.ts:50-65` | Exists with `(callId, orgId, delayMs=120000)` signature, adds to BullMQ queue |
| `scheduleCallRetry()` wired up | ❌ NOT wired | `webhooks.routes.ts` | **Function exists but is never imported or called** in post-call webhook |
| `missed_call_detected_at` column | ❌ Missing | — | Not in any migration |
| Migration 003 | ❌ Missing | — | File does not exist |
| `buildInboundContext()` | ❌ Missing | — | Inbound builds vars ad-hoc at `webhooks.routes.ts:563-586` instead of reusing prompt builder |
| `buildDynamicVariables()` | ✅ Done | `retellPromptBuilder.ts:19-63` | Full implementation with resumption context support |

**Execution — continue from existing code:**

| Step | Task | Files |
|------|------|-------|
| 1 | Extend `phone.ts` (line 30+): add `normalizeForLookup(raw: string): string` that strips to digits + takes last 10, and `phonesMatch(a: string, b: string): boolean` that compares `normalizeForLookup()` of both sides. Keep existing `formatPhoneE164()` and `isValidE164()` untouched | `backend/src/utils/phone.ts` |
| 2 | Create migration `003_phase3.sql`: `ALTER TABLE calls ADD COLUMN IF NOT EXISTS missed_call_detected_at TIMESTAMPTZ;` + `CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized ON candidates (regexp_replace(phone, '[^0-9]', '', 'g'));` | `supabase/migrations/003_phase3.sql` (new) |
| 3 | Post-call webhook (after line 419 where call is updated): add block — when `status === 'no_answer' \|\| status === 'voicemail'`, do a second update to set `missed_call_detected_at = new Date().toISOString()` on the call record | `backend/src/routes/webhooks.routes.ts` |
| 4 | Post-call webhook (after line 401 where status is set to `interrupted`): add import `{ scheduleCallRetry } from '../jobs/callRetry.job'` at top of file. After updating call record, add guard: query `calls` table counting ancestors via `parent_call_id` chain — if depth < 2, call `scheduleCallRetry(callRecord.id, callRecord.org_id, 120000)` | `backend/src/routes/webhooks.routes.ts` |
| 5 | Inbound webhook (line 502-508): replace `const cleanedPhone = fromNumber.replace(/\D/g, '').slice(-10)` + `.ilike('phone', ...)` + `.single()` with: import `normalizeForLookup` from phone.ts, query candidates with `.filter('phone', 'not.is', null)` for the org, then filter in JS using `phonesMatch(candidate.phone, fromNumber)`. If multiple matches, pick candidate with most recent application in status `new`/`screening`. If zero matches, fall through to existing unknown-caller handling | `backend/src/routes/webhooks.routes.ts` |
| 6 | Inbound webhook (after line 540 where candidate's application is found): add new query — `SELECT * FROM calls WHERE candidate_id = $candidateId AND direction = 'outbound' AND status IN ('no_answer', 'voicemail') AND created_at > NOW() - INTERVAL '2 hours' ORDER BY created_at DESC LIMIT 1`. If found, this is a callback — load that call's `application_id` → fetch job + agent context from it instead of from generic application lookup | `backend/src/routes/webhooks.routes.ts` |
| 7 | Refactor inbound variable building: extract lines 563-586 into new `buildInboundContext(candidate, application, job, agent, missedCall?, interruptedCall?)` function in `retellPromptBuilder.ts`. Include caller verification: "Just to verify, am I speaking with {{candidate_first_name}}?" If `missedCall` provided: "I believe we tried reaching you earlier for your {{job_title}} interview — shall we continue?" | `backend/src/utils/retellPromptBuilder.ts` |

---

### 3.2 Natural AI Interview Experience — `TODO` ⭐ PRIORITY

**Why:** Every call the system makes should feel like a real human interview, not a robotic AI reading questions from a list. Better interviews → better candidate data → better placements for the agency.

**Current state (code audit 2026-04-14):**

| What | Status | Location | Detail |
|------|--------|----------|--------|
| `ScreeningResult` interface | ✅ Done | `screening.service.ts:14-23` | 8 fields: strengths, weaknesses, risk/reward, rating, justification, mandate_questions, interview_questions |
| `candidate_talking_points` in screening | ❌ Missing | — | Not in interface or LLM prompt |
| Screening LLM prompt | ✅ Done | `screening.service.ts:30-47` | Asks for 8 JSON fields, returns structured result |
| `getDefaultSystemPrompt()` | ✅ Done but flat | `agent.service.ts:7-41` | Single monolithic template, no phases, no style differentiation |
| `interview_style` DB column | ✅ Done | `001_initial_schema.sql` | Enum: `formal \| conversational \| technical`, stored on `ai_agents` |
| `interview_style` used in prompt | ❌ NOT used | `agent.service.ts` | Variable exists in DB but prompt is identical regardless of style |
| `greeting_template` / `closing_template` | ✅ Columns exist | `ai_agents` table | Stored in DB but **never injected into prompt** |
| `evaluation_criteria` JSONB | ✅ Column exists | `ai_agents` table | Has default categories (Technical Fit, etc.) but **not used in prompt** |
| `buildDynamicVariables()` | ✅ Done | `retellPromptBuilder.ts:19-63` | Sets 6 vars: candidate_name, first_name, email, job_title, job_location, company_name |
| `candidate_background_summary` var | ❌ Missing | — | Not set in dynamic variables |
| `candidate_talking_points` var | ❌ Missing | — | Not set in dynamic variables |
| `interview_style_instructions` var | ❌ Missing | — | Not set in dynamic variables |
| Interview questions format | ⚠️ Numbered list | `retellPromptBuilder.ts:37-40` | Format: `"1. Question\n2. Question"` — encourages robotic list-reading |
| `buildSystemPrompt()` | ✅ Done | `retellPromptBuilder.ts:69-77` | Simple `{{var}}` regex substitution, works correctly |

**Current system prompt (verbatim, `agent.service.ts:8-41`):**
```
# Role
You are a professional AI screening interviewer working on behalf of {{company_name}}.
You are conducting a first-round screening interview for the {{job_title}} position.

# Candidate Info
- Name: {{candidate_name}}
- Email: {{candidate_email}}

# Instructions
1. Start by greeting the candidate warmly and confirming their identity
2. Briefly explain this is a screening interview and it will take about 15-20 minutes
3. Ask the mandatory screening questions first
4. Then proceed with the role-specific interview questions
5. Allow the candidate to ask questions at the end
6. Thank them and explain next steps

# Mandatory Questions
{{mandate_questions}}

# Interview Questions
{{interview_questions}}

{{call_context}}

# Guidelines
- Be professional but conversational
- Listen actively and ask follow-up questions when answers are vague
- Do not argue with the candidate or give away answer hints
- If the candidate seems confused, rephrase the question
- Keep track of time - aim to finish within 20 minutes
- If the candidate asks to reschedule or call back later, politely accommodate

# Closing
Thank the candidate for their time and let them know someone from the recruitment team
will follow up within 2-3 business days with next steps.
```

**Execution — continue from existing code:**

| Step | Task | Files |
|------|------|-------|
| 1 | `screening.service.ts`: Add `candidate_talking_points: string[]` to `ScreeningResult` interface (after line 22). Add to LLM prompt (line 38): `"- candidate_talking_points: string[] (2-3 brief observations from resume useful for building rapport, e.g., 'Candidate has 3 years at Ford in embedded systems')"`. No other changes to screening logic | `backend/src/services/screening.service.ts` |
| 2 | `retellPromptBuilder.ts`: In `buildDynamicVariables()` after line 27, add 3 new variables: (a) `candidate_background_summary` — if `ctx.application.ai_screening_result?.candidate_strengths` exists, join into 2-3 sentences; else use `ctx.candidate.resume_text?.substring(0, 500)` (b) `candidate_talking_points` — from `ctx.application.ai_screening_result?.candidate_talking_points`, join with `\n` (c) `interview_style_instructions` — switch on `ctx.agent.interview_style`: conversational → warmth/bridging text, technical → probing depth text, formal → structured pacing text | `backend/src/utils/retellPromptBuilder.ts` |
| 3 | `retellPromptBuilder.ts`: Change interview questions format at lines 37-40 from `"${i + 1}. ${q}"` to `"Topic: ${q} — Explore this through natural conversation"` | `backend/src/utils/retellPromptBuilder.ts` |
| 4 | `agent.service.ts`: Replace the entire return string in `getDefaultSystemPrompt()` (lines 8-41) with 5-phase prompt: **Phase 1 — Rapport** (2-3 min): greet by first name, reference `{{candidate_talking_points}}`, establish warmth. **Phase 2 — Mandatory Screening**: natural segue ("Before we dive in, I just need to confirm a couple of things...") into `{{mandate_questions}}`. **Phase 3 — Technical Deep-dive**: "Select 5-7 of the topics below based on conversation. Ask follow-ups on vague answers. Skip topics already covered." Uses `{{interview_questions}}`. **Phase 4 — Candidate Questions**: "Do you have any questions about the role or the company?" **Phase 5 — Closing**: use `{{closing_template}}` if set, else default next-steps language | `backend/src/services/agent.service.ts` |
| 5 | `agent.service.ts`: Add `{{interview_style_instructions}}` variable in the new prompt, positioned after the Role section. This gets populated by `buildDynamicVariables()` with style-specific text: conversational = "Use first name 2-3 times, bridging phrases, warm encouraging tone"; technical = "Probe depth, ask 'walk me through how...', push beyond surface"; formal = "Structured pace, clear transitions, professional tone" | `backend/src/services/agent.service.ts` |
| 6 | `agent.service.ts`: Add to prompt: "IMPORTANT: Do NOT read questions from a list. You have interview topics to explore — weave them into natural conversation. If the candidate has already answered a topic, do NOT ask it again. When an answer is vague, ask a follow-up. Your goal is a real conversation, not an interrogation." | `backend/src/services/agent.service.ts` |

---

### 3.3 Smart Candidate Re-engagement — `TODO` ⭐ PRIORITY

**Why:** The agency has 3,000-4,000+ past candidates in CEIPAL. When a new position opens and gets no applications, the system should automatically find and email matching past candidates who weren't hired. This is the #1 value-add for a staffing agency.

**Current state (code audit 2026-04-14):**

| What | Status | Location | Detail |
|------|--------|----------|--------|
| `sendEmail()` function | ⚠️ Stubbed | `email.service.ts:86-106` | Only logs + inserts into `email_logs` with status `'sent'`. **No actual delivery** |
| `invitationTemplate()` | ✅ Done | `email.service.ts:7-38` | Full HTML template with Cal.com link |
| `rejectionTemplate()` | ✅ Done | `email.service.ts:40-58` | Full HTML template |
| `followUpTemplate()` | ✅ Done | `email.service.ts:60-78` | Done but **never called in worker** |
| `reEngagementTemplate()` | ❌ Missing | — | Needs to be created |
| Email sender worker switch | ⚠️ Partial | `emailSender.job.ts:38-47` | Only handles `invitation` and `rejection`. No `re_engagement`, no `follow_up` |
| `queueEmail()` | ✅ Done | `emailSender.job.ts:68-81` | Type: `'invitation' \| 'rejection' \| 'follow_up'` — missing `re_engagement` |
| `nodemailer` dependency | ❌ Missing | `package.json` | Not installed |
| SMTP env vars | ❌ Missing | `env.ts` | Zero SMTP config, no `EMAIL_TRANSPORT` flag |
| MS Graph env vars | ✅ Exist | `env.ts:28-31` | Optional, but MS Graph sending **not implemented** |
| `EmailType` | ⚠️ Incomplete | `types/index.ts:22` | `'invitation' \| 'follow_up' \| 'rejection' \| 'custom'` — no `'re_engagement'` |
| `Candidate` interface | ✅ Done | `types/index.ts:108-122` | No `resume_tsv`, no `reengagement_opted_out` (DB columns don't exist yet) |
| `reengagement.service.ts` | ❌ Missing | — | File does not exist |
| `screening-lite.service.ts` | ❌ Missing | — | File does not exist |
| `reengagement.job.ts` | ❌ Missing | — | File does not exist |
| `reengagement.routes.ts` | ❌ Missing | — | File does not exist |
| Migration 004 | ❌ Missing | — | File does not exist |
| `reengagement_campaigns` table | ❌ Missing | — | Not in any migration |
| `reengagement_candidates` table | ❌ Missing | — | Not in any migration |
| `resume_tsv` tsvector column | ❌ Missing | — | Not on candidates table |
| `reengagement_opted_out` column | ❌ Missing | — | Not on candidates table |
| CEIPAL sync | ✅ Done | `ceipal.service.ts` + `ceipalSync.job.ts` | Syncs jobs every 30 min, fully functional |
| `screenResume()` | ✅ Done | `screening.service.ts:29` | Full screening via OpenRouter, 0-10 score |
| Email BullMQ queue | ✅ Done | `emailSender.job.ts:9-17` | Rate limited 20/min, 3 retries, exponential backoff |

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Activate email sending: add `nodemailer` dependency. In `email.service.ts`, create SMTP transporter using `nodemailer.createTransport()`. Feature flag: read `EMAIL_TRANSPORT` env var — if `smtp`, use transporter; if `log` (default), keep current behavior (log only). In `env.ts` (line 6 Zod schema), add optional: `EMAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | `backend/src/services/email.service.ts`, `backend/src/config/env.ts`, `backend/package.json` |
| 2 | Create migration `004_reengagement.sql` with exact SQL from Section 4 below: `resume_tsv` generated tsvector column + GIN index on candidates, `reengagement_opted_out` boolean on candidates, `reengagement_campaigns` table, `reengagement_candidates` table, RLS policies | `supabase/migrations/004_reengagement.sql` (new) |
| 3 | Build `findStaleJobs(orgId, staleDays=3)`: `SELECT j.* FROM jobs j LEFT JOIN applications a ON j.id = a.job_id AND a.created_at > NOW() - INTERVAL '$staleDays days' WHERE j.org_id = $orgId AND j.status = 'open' AND a.id IS NULL` — returns open jobs with zero applications in last N days | `backend/src/services/reengagement.service.ts` (new) |
| 4 | Build `preFilterCandidates(orgId, job)`: query candidates where `resume_tsv @@ plainto_tsquery('english', job.title || ' ' || job.skills.join(' '))`, AND `NOT EXISTS (SELECT 1 FROM applications WHERE candidate_id = c.id AND job_id = job.id)`, AND `reengagement_opted_out = false`, ORDER BY `ts_rank(resume_tsv, query) DESC`, LIMIT 100. **Cost: $0** (pure PostgreSQL) | `backend/src/services/reengagement.service.ts` |
| 5 | Build `screenResumeLite(resumeText, job)`: uses OpenRouter with shorter prompt — "Rate this candidate's fit for the role on a scale of 0-10. Return JSON: {fit_score: number, justification: string}". Input: resume text + job title + skills. ~500 tokens per call vs ~2000 for full `screenResume()`. Process in batches of 10 with 2s delay between batches. **Cost: ~$0.01 per stale job (100 candidates)** | `backend/src/services/screening-lite.service.ts` (new) |
| 6 | Build `launchCampaign(orgId, jobId, config?)`: orchestrator function — (1) create campaign record with status `matching`, (2) call `preFilterCandidates()`, update `candidates_matched`, (3) call `screenResumeLite()` for each in batches, insert into `reengagement_candidates` with scores, (4) update status to `emailing`, (5) for candidates with `fit_score >= 6`, call `queueEmail()` from `emailSender.job.ts` with type `re_engagement`, (6) update `candidates_emailed` count, set status `completed` | `backend/src/services/reengagement.service.ts` |
| 7 | Add `reEngagementTemplate(candidateName, jobTitle, jobDescription, companyName, optOutLink)`: HTML email — "Hi [Name], We have a new opening for [Job Title] at [Company] that matches your experience. If you're interested, click below to apply. [Apply Button] Not interested? [Opt-out link]". Follow same HTML structure as existing `invitationTemplate()` at line 7 of `email.service.ts` | `backend/src/services/email.service.ts` |
| 8 | Wire email sender worker (line 38 switch statement): add `case 're_engagement':` that calls new `sendReEngagementEmail(candidate, jobTitle, applicationId)`. Import from `email.service.ts` | `backend/src/jobs/emailSender.job.ts` |
| 9 | Create BullMQ recurring job: Queue `reengagement-checker`, recurring every 6 hours via `repeat: { every: 21600000 }`. Worker: query all orgs, call `findStaleJobs()` per org, call `launchCampaign()` per stale job. Also export `triggerReengagement(orgId, jobId)` for manual trigger via API | `backend/src/jobs/reengagement.job.ts` (new) |
| 10 | Create API routes with `authenticate` + `requireRole('admin', 'recruiter')` middleware: `POST /api/reengagement/trigger` body `{job_id}` → calls `triggerReengagement()`, `GET /api/reengagement/campaigns` → list campaigns for org with pagination, `GET /api/reengagement/campaigns/:id` → campaign detail with joined `reengagement_candidates` + candidate names/emails | `backend/src/routes/reengagement.routes.ts` (new) |
| 11 | Mount routes in Express app: `app.use('/api/reengagement', authenticate, reengagementRoutes)`. Import and start recurring job worker alongside existing workers (callScheduler, emailSender, etc.) | `backend/src/index.ts` |
| 12 | Add TypeScript types: `ReengagementCampaign { id, org_id, job_id, status, candidates_matched, candidates_emailed, candidates_responded, config, created_at, completed_at }`, `ReengagementCandidate { id, campaign_id, candidate_id, fit_score, fit_justification, email_sent, responded, created_at }`. Add `'re_engagement'` to `EmailType` union | `backend/src/types/index.ts` |

**Cost Analysis:**
- Without pre-filter: 3,000 candidates × ~2,000 tokens = $0.90/job
- With FTS pre-filter + lite scoring: ~100 candidates × ~500 tokens = **$0.01/job** (90x cheaper)

---

## 4. Database Migration Summary

### Migration 002 — Phase 2 Schema (`supabase/migrations/002_phase2_schema.sql`)

Already applied. Contains: scheduling config columns, job priority, recruiter capacity, interview stages table, candidate portal tokens, client users, duplicate detection indexes.

### Migration 003 — Call Improvements (`supabase/migrations/003_phase3.sql`)

```sql
-- Track missed outbound calls for inbound callback detection
ALTER TABLE calls ADD COLUMN IF NOT EXISTS missed_call_detected_at TIMESTAMPTZ;

-- Index for normalized phone lookup (strip non-digits)
CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized
  ON candidates (regexp_replace(phone, '[^0-9]', '', 'g'));
```

### Migration 004 — Re-engagement Pipeline (`supabase/migrations/004_reengagement.sql`)

```sql
-- Full-text search on candidate resumes (free pre-filtering, no API calls)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', COALESCE(resume_text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_candidates_resume_fts ON candidates USING gin(resume_tsv);

-- Candidate opt-out for re-engagement emails
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS reengagement_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

-- Campaign tracking
CREATE TABLE IF NOT EXISTS reengagement_campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matching', 'emailing', 'completed', 'failed')),
    candidates_matched  INTEGER NOT NULL DEFAULT 0,
    candidates_emailed  INTEGER NOT NULL DEFAULT 0,
    candidates_responded INTEGER NOT NULL DEFAULT 0,
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reengagement_org ON reengagement_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_reengagement_job ON reengagement_campaigns(job_id);

-- Per-candidate campaign results
CREATE TABLE IF NOT EXISTS reengagement_candidates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     UUID NOT NULL REFERENCES reengagement_campaigns(id) ON DELETE CASCADE,
    candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    fit_score       INTEGER NOT NULL,
    fit_justification TEXT,
    email_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    responded       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_reengagement_cands_campaign ON reengagement_candidates(campaign_id);

-- RLS
ALTER TABLE reengagement_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE reengagement_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY reengagement_campaigns_org ON reengagement_campaigns
    FOR ALL USING (org_id = public.get_user_org_id());

CREATE POLICY reengagement_cands_org ON reengagement_candidates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM reengagement_campaigns rc
                WHERE rc.id = reengagement_candidates.campaign_id
                AND rc.org_id = public.get_user_org_id())
    );
```

---

## 5. Recommended Execution Order

Reprioritized for **recruitment agency impact** — fill positions faster with better candidates.

**Execution approach:** Use superpowers skills for disciplined implementation:
- **brainstorming** — Before each sprint, brainstorm edge cases and design decisions
- **writing-plans** — Break each sprint into detailed sub-tasks before coding
- **test-driven-development** — Write tests for critical paths (webhook handlers, phone matching, FTS queries) before implementation
- **subagent-driven-development** — Parallelize independent tasks within each sprint (e.g., migration + service files simultaneously)
- **verification-before-completion** — Run `make validate` + manual verification per the sprint verification step before claiming done
- **requesting-code-review** — Review after each sprint completes

### Phase 3, Sprint 1 — Robust Inbound Call Handling (3.1) ⭐
**Goal:** Stop losing candidates who call back after missed outbound calls.
**Files:** `backend/src/utils/phone.ts`, `backend/src/routes/webhooks.routes.ts`, `backend/src/utils/retellPromptBuilder.ts`, `supabase/migrations/003_phase3.sql`

1. Extend `phone.ts` — add `normalizeForLookup()` and `phonesMatch()` alongside existing `formatPhoneE164()`
2. Run migration 003 — add `missed_call_detected_at` column + phone index
3. Post-call webhook — (a) set `missed_call_detected_at = NOW()` on `no_answer`/`voicemail` calls (b) import `scheduleCallRetry` and call it on `interrupted` with depth guard ≤ 2
4. Inbound webhook — (a) replace `.ilike('phone', ...)` at line 506 with `phonesMatch()` (b) query for recent missed outbound to same number within 2h (c) if found, load that call's job/agent/application context (d) disambiguate multiple candidate matches by most recent application
5. Prompt builder — add `buildInboundContext()` with caller verification + missed-call acknowledgment

**Verification:** Send mock inbound webhook payload with a phone number that matches a candidate who had a `no_answer` outbound call 30 min ago → should route to correct agent with interview context loaded

### Phase 3, Sprint 2 — Natural AI Interview Experience (3.2) ⭐
**Goal:** Make every AI call feel like a real human interview.
**Files:** `backend/src/services/screening.service.ts`, `backend/src/utils/retellPromptBuilder.ts`, `backend/src/services/agent.service.ts`

1. `screening.service.ts` — add `candidate_talking_points: string[]` to `ScreeningResult` interface (line 14) and to the LLM prompt (line 30)
2. `retellPromptBuilder.ts` — enhance `buildDynamicVariables()` (line 19) with `candidate_background_summary`, `candidate_talking_points`, `interview_style_instructions`. Change `interview_questions` format from numbered list to `"Topic: [Q] — Assess: [skill]"`
3. `agent.service.ts` — rewrite `getDefaultSystemPrompt()` (line 7) from current 40-line flat prompt to 5-phase conversation structure: Rapport → Mandate → Deep-dive → Candidate Questions → Closing
4. `agent.service.ts` — add conditional style blocks based on `{{interview_style}}` variable (conversational/technical/formal)
5. `agent.service.ts` — add anti-robotic instruction: "Do NOT read questions from a list..."

**Verification:** Create a test agent with `interview_style: 'conversational'`, build dynamic variables for a candidate with screening results → inspect the assembled prompt — should have rapport section with talking points, conversational question format, style-specific instructions, no numbered question lists

### Phase 3, Sprint 3 — Smart Candidate Re-engagement (3.3) ⭐
**Goal:** Automatically fill empty pipelines from the agency's 3,000+ candidate database.
**New files:** `backend/src/services/reengagement.service.ts`, `backend/src/services/screening-lite.service.ts`, `backend/src/jobs/reengagement.job.ts`, `backend/src/routes/reengagement.routes.ts`, `supabase/migrations/004_reengagement.sql`
**Modified files:** `backend/src/services/email.service.ts`, `backend/src/config/env.ts`, `backend/src/jobs/emailSender.job.ts`, `backend/src/index.ts`, `backend/src/types/index.ts`, `backend/package.json`

1. `npm install nodemailer @types/nodemailer` in backend
2. Activate email sending in `email.service.ts` — create SMTP transporter, feature flag `EMAIL_TRANSPORT=smtp|log`
3. Add SMTP env vars to `env.ts` Zod schema (optional)
4. Run migration 004 — creates FTS index on candidates, campaign tables, opt-out flag
5. Build `reengagement.service.ts` — `findStaleJobs()`, `preFilterCandidates()`, `launchCampaign()`
6. Build `screening-lite.service.ts` — `screenResumeLite()` returning `{fit_score, justification}`
7. Add `reEngagementTemplate()` to `email.service.ts`
8. Add `case 're_engagement'` to email sender worker switch (line 38 of `emailSender.job.ts`)
9. Build `reengagement.job.ts` — recurring BullMQ job every 6h + manual trigger export
10. Build `reengagement.routes.ts` — 3 endpoints (trigger, list, detail)
11. Mount in `index.ts` alongside existing routes and workers
12. Add types to `types/index.ts`

**Verification:** (a) Set `EMAIL_TRANSPORT=log`, manually trigger `POST /api/reengagement/trigger` for a stale job → verify campaign created in DB, candidates matched via FTS, scores computed, emails logged. (b) Set `EMAIL_TRANSPORT=smtp` with real SMTP creds → verify actual email delivery. (c) Check `GET /api/reengagement/campaigns` returns campaign with correct stats.

### Phase 3, Sprint 4 — Remaining Phase 2 Gaps
**Goal:** Complete dashboard features for day-to-day recruiter operations.

7. **Email History** (2.12) — functional Emails page with filters + detail sheet (email sending already activated in Sprint 3)
8. **Activity Log** (2.11) — dedicated page with filtering + pagination
9. **Team Management** (2.13) — invite, roles, activate/deactivate
10. **Scheduling Restrictions** (1.1) — business hours, blackouts, per-job config
11. **Recruiter Workload** (2.2) — comparison dashboard, reassignment
12. **Analytics Export** (2.10) — CSV/PDF export + date range filtering

---

## 6. Features Already Complete (No Work Needed)

| Feature | Status |
|---------|--------|
| Call Resumption (1.2) | DONE |
| Cal.com Self-Booking (1.3) | DONE |
| Individual Recruiter Logins (2.1) | DONE |
| Candidate Management (2.3) | DONE |
| Job Management Portal (2.4) | DONE |
| Company-Wise AI Agents (2.5) | DONE |
| Company-Wise Job Portal (2.6) | DONE |
| Application Pipeline View (2.7) | DONE |
| Call Management Console (2.8) | DONE |
| Call Evaluation & Decisions (2.9) | DONE |
