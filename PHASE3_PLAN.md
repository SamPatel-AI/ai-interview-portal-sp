# Phase 3 Execution Plan — Interview Portal

## Context

After a deep audit of the codebase, Phase 3 is in a much better state than it appears. The three major sub-features (Inbound Call Handling, Natural AI Interviews, Re-engagement Pipeline) are **already implemented in the backend**. The prompt builder has all 12 template variables and a 5-phase conversation structure. The re-engagement service, scheduler, routes, and migration SQL are written and registered in `index.ts`. The call retry is wired in the post-call webhook.

**The actual work is: activation, 4 missing frontend screens, and 3 backend fixes.** Estimated: 5–7 days of focused work.

---

## What's Actually Done (Don't Rebuild)

- `phonesMatch()` / `normalizeForLookup()` — `backend/src/utils/phone.ts`
- Inbound routing with `buildInboundContext()` — `backend/src/routes/webhooks.routes.ts:518`
- `scheduleCallRetry()` called in post-call webhook — `webhooks.routes.ts:452`
- 5-phase system prompt with all 12 dynamic vars — `backend/src/utils/retellPromptBuilder.ts` + `backend/src/services/agent.service.ts`
- `interview_style`, `candidate_talking_points`, `greeting_template`, `closing_template` all injected
- Re-engagement: service + job + routes registered in `backend/src/index.ts:27,84,100`
- Migration SQL file exists: `supabase/migrations/004_reengagement.sql`
- `reEngagementTemplate()` in `backend/src/services/email.service.ts`
- `re_engagement` email type handled in `backend/src/jobs/emailSender.job.ts`
- Health check endpoint at `GET /health` — `backend/src/index.ts:64`

---

## Phase 3A — Backend Activation (Day 1–2)

### 1. Apply migrations to production Supabase
Run in Supabase SQL editor (or via Supabase CLI):
- `supabase/migrations/003_phase3.sql` — adds `calls.missed_call_detected_at`, phone index
- `supabase/migrations/004_reengagement.sql` — adds `resume_tsv`, `reengagement_opted_out`, `reengagement_campaigns`, `reengagement_candidates`

### 2. Configure SMTP via Resend (unblocks ALL email features)
Sign up at resend.com → create an API key → verify your sending domain (saanvi.us).

In `backend/.env` (production only):
```
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<your-resend-api-key>
SMTP_FROM=noreply@saanvi.us
```
Do NOT set `EMAIL_TRANSPORT=smtp` in local dev — keep `EMAIL_TRANSPORT=log` locally.
Free tier: 3,000 emails/month, 100/day.

### 3. Fix `follow_up` email dead code
**File:** `backend/src/jobs/emailSender.job.ts` — the worker switch handles `invitation`, `rejection`, `re_engagement` but has no `follow_up` case. Either:
- Add a `sendFollowUpEmail()` handler (mirrors invitation but with follow-up copy), OR
- Remove `follow_up` from `queueEmail()`'s accepted types and throw on unknown type

### 4. Explicit BullMQ worker bootstrap
**File:** `backend/src/index.ts` — currently only `startReengagementScheduler` is explicitly imported from jobs. Other workers (`callScheduler`, `emailSender`, `callRetry`, `resumeProcessor`, `ceipalSync`) rely on transitive imports via route files. This is fragile.

**Fix:** Add explicit worker imports to `index.ts` so startup is intentional:
```typescript
// backend/src/index.ts — add after existing job import
import './jobs/callRetry.job';       // starts callRetryWorker
import './jobs/emailSender.job';     // starts emailSenderWorker
import './jobs/callScheduler.job';   // starts call polling
import './jobs/ceipalSync.job';      // starts 30-min sync
import './jobs/resumeProcessor.job'; // starts resume parsing
```
Side-effect imports (no binding needed) — BullMQ workers auto-start on module instantiation.

### 5. Set production security env vars
```
RETELL_WEBHOOK_SECRET=<from-retell-dashboard>   # enforces signature verification
```
The webhook handler checks this only when set. It should be required in production.

---

## Phase 3B — Frontend Screens via Lovable (Day 2–5)

> Frontend is built by Lovable. Paste each prompt into Lovable, then pull the result before moving to the next screen.

### Screen 1: Team Management (Settings page)

```
In the Settings page, replace the Team Management placeholder tab with a working UI.

Backend APIs available (all require auth token, base URL http://localhost:3001):
- GET /api/users — returns array of {id, email, full_name, role, is_active, max_capacity, created_at}
- POST /api/users/invite — body: {email, full_name, role: 'admin'|'recruiter'|'viewer'} — admin only
- PATCH /api/users/:id — body: {role?, is_active?, full_name?} — admin only for other users

UI to build:
- Table of team members: avatar, full name, email, role chip (color-coded), active/inactive badge
- "Invite Member" button (top right) → modal with email, full name, role select
- Per row: role dropdown (inline edit, admin-only for other users), deactivate toggle
- Viewer role users cannot see the invite button or edit controls
- Follow the existing domain pattern: create hooks in src/domains/settings/ and export from its index.ts barrel
```

### Screen 2: Email History Page

```
Build out the Emails page (currently an empty placeholder).

Backend APIs:
- GET /api/emails?page=1&limit=20&candidate_id=&application_id=&type=&status= — paginated list
  Response: {emails: [{id, candidate_name, subject, type, status, sent_at, application_id}], total, page}
- GET /api/emails/:id — full detail: {id, to_email, subject, body_html, type, status, sent_at, opened_at, error_message}

UI to build:
- Filter bar: type dropdown (invitation/rejection/follow_up/re_engagement), status dropdown (sent/failed/bounced), search by candidate name
- Table: candidate name, subject, type badge, status badge (sent=green, failed=red, bounced=yellow), sent date
- Click row → slide-in Sheet (follow CallDetailSheet pattern) showing: full email body rendered as HTML, delivery metadata (sent_at, opened_at if available, error if failed)
- Empty state when no emails match filters
- Use src/domains/emails/ domain (already exists) — add any missing hooks following the barrel pattern
```

### Screen 3: Re-engagement Campaign UI

```
Add a "Re-engagement" section to the sidebar nav and build the campaign management page.

Backend APIs:
- GET /api/reengagement/campaigns?page=1&limit=20 — list campaigns
  Response: {campaigns: [{id, job_id, job_title, status, candidates_matched, candidates_emailed, candidates_responded, created_at, completed_at}]}
- GET /api/reengagement/campaigns/:id — detail with per-candidate results
  Response: {campaign: {...}, candidates: [{candidate_name, fit_score, fit_justification, email_sent, responded}]}
- POST /api/reengagement/trigger — body: {job_id} — launches a new campaign
- GET /api/jobs (existing endpoint) — for job dropdown in trigger modal

UI to build:
- Page with header "Re-engagement Campaigns" + "Launch Campaign" button
- Campaign list: job name, status badge (pending=gray/matching=blue/emailing=yellow/completed=green/failed=red), matched/emailed/responded counts, launched date
- "Launch Campaign" button → modal: select job from dropdown (open jobs only), warning text "This will email matching candidates from your database", Confirm button
- Click campaign row → detail sheet: campaign stats at top, table of candidates with fit score bar (0-10), fit justification tooltip, email sent checkbox, responded badge
- Create src/domains/reengagement/ with types, service (API calls), hooks (useReengagementCampaigns, useTriggerCampaign), index.ts barrel
```

### Screen 4: Scheduling Restrictions (Settings page)

```
Add a "Scheduling" tab to the Settings page for configuring when AI calls can be placed.

Backend APIs:
- GET /api/settings/scheduling — returns {business_hours: {monday: {enabled, start, end}, ...all 7 days}, blackout_dates: string[], timezone: string}
- PATCH /api/settings/scheduling — body: same structure, saves config

UI to build:
- Scheduling tab in Settings alongside Team Management
- Business hours section: 7 rows (Mon–Sun), each with: enable toggle, start time select (30-min increments, 6am–10pm), end time select
- Timezone select dropdown (common US timezones: ET, CT, MT, PT)
- Blackout dates section: date picker to add dates, list of added dates with remove button
- Save button with loading state, success toast on save
- Disabled state for days where toggle is off (grey out time selects)
```

---

## Phase 3C — Smoke Test & Harden (Day 6–7)

### End-to-end test flows
1. **Email flow:** Approve an application → invitation email arrives in inbox (not just logged)
2. **Re-engagement flow:** Trigger campaign for a stale job → check `reengagement_campaigns` row created, candidates matched, emails queued and sent
3. **Inbound call flow:** Trigger a missed outbound call → call from same number → verify Retell gets context about the missed call
4. **Interrupted call retry:** Manually set a call to `interrupted` status → verify retry job fires after 2 min delay and creates child call with `is_resumption=true`

### Final production checklist
- [x] Migrations 003 + 004 applied in production Supabase
- [ ] `EMAIL_TRANSPORT=smtp` + all `SMTP_*` vars set in production env (Resend key ready — add to server .env)
- [ ] `RETELL_WEBHOOK_SECRET` set in production env
- [x] All 5 BullMQ workers explicitly bootstrapped in `backend/src/index.ts`
- [x] `follow_up` email dead code fixed — `sendFollowUpEmail()` added to email.service.ts + worker case wired
- [ ] `make validate` passes (tsc + eslint) with zero errors
- [ ] `GET /health` returns 200 — point uptime monitor at it
- [ ] Default seed credentials changed (`sahil@saanvi.us / Test@1234`)

---

## Critical Files

| Area | File |
|------|------|
| Worker bootstrap | `backend/src/index.ts` |
| Email transport | `backend/src/services/email.service.ts` |
| Email worker fix | `backend/src/jobs/emailSender.job.ts` |
| Migrations | `supabase/migrations/003_phase3.sql`, `004_reengagement.sql` |

---

## Defer to Phase 4

Do not start these until Phase 3 is shipped and tested:
- Client dashboard (separate login for Ford, Toyota, etc.)
- Multi-stage interview pipeline (Phone Screen → Technical → Client stages)
- Candidate self-service portal (scaffolded in `portal.routes.ts`, not complete)
- Conversation intelligence (Q&A extraction exists, analytics layer missing)
- PDF report generation (AI summary exists, PDF rendering not built)
