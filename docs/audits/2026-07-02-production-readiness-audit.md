# Production-Readiness Audit & Go-Live Plan — 2026-07-02

Full-codebase audit (backend, frontend, security/ops) ahead of client handoff.
Every finding below was verified in code, not just reported. This document is
the single source of truth for what remains before the platform is
client-ready; strike items as they land.

## System snapshot (verified live 2026-07-02)

- Backend: Railway account **AISaanviHR**, project Saanvi-portal, service
  `ai-interview-portal-sp` → `https://ai-interview-portal-sp-production-976b.up.railway.app`
  (the pre-move URL without `-976b` is DEAD).
- Frontend: Lovable → `ai-interview-portal-sp.lovable.app` (auto-deploys `main`).
- DB: Supabase `xaoqqqiniuatyvdwzjnj`, migrations 001–016 written (remote
  migration history only tracks 005 — apply new ones with the single-file
  method below).
- Data: ~853 candidates, ~2,000 CEIPAL jobs, 903 AI-scored applications,
  3 Retell voice agents. `EMAIL_TRANSPORT=graph` → **real email is ON**.

## Launch blockers — status

| # | Finding | Fix | Status |
|---|---------|-----|--------|
| B1 | `POST /api/auth/signup` public, email pre-confirmed, accepted arbitrary `org_id` → outsider joins ANY org as recruiter (or becomes admin of a new org) | Invite-only signup: org-join path removed, self-serve gated behind `ALLOW_PUBLIC_SIGNUP=false`; members via admin `POST /api/users/invite`. Lovable prompt removes the Signup page | ✅ DONE — #25 merged+deployed 7/2 |
| B2 | `resumes` storage bucket policies allowed any authenticated user to read/overwrite every org's resumes | Migration **017**: drop permissive policies, pin bucket private (all access is backend/service-role; verified frontend never touches storage) | ✅ DONE — 017 applied 7/2, bucket verified private |
| B3 | Live secrets travel unencrypted in `.env` files (never committed — verified) | Rotate ALL third-party secrets (Supabase service-role, Retell, CEIPAL, OpenRouter, Graph, Cal, webhook secret) | OPEN — Day 2 |
| B4 | `POST /api/portal/generate-token` unauthenticated → 72h PII token for any candidate UUID | `authenticate` + `requireRole(admin,recruiter)` + candidate must be in caller's org | ✅ DONE — #25 merged+deployed 7/2 |
| B5 | Re-engagement sweep runaway: every 6h it treated ~1,730 CEIPAL "open" jobs as stale → 68k junk campaigns / 1.05M child rows; mass-email prevented only by an email-dedup bug (all campaign emails shared one BullMQ jobId) | Sweep opt-in (`REENGAGEMENT_AUTO_SWEEP=false`, removes persisted Redis repeatable at boot), jobId collision fixed, 30-day job recency, 7-day campaign cooldown. Purge script: `scripts/ops/purge_campaigns.py` | ✅ code DONE — #24 merged+deployed 7/2; prod logs confirm recurring job REMOVED. ⏳ purge of 68k junk rows still to run (user-run only) |
| B6 | Retell agents synced 6/16 (pre account-move) → their webhook URLs likely point at the DEAD old Railway domain → post-call transcripts/evals silently lost | Re-sync all 3 agents (`scripts/ops/update_agent_personas.py` does this while applying the Grace/Adrian/Brian personas). Verify webhook URL in Retell dashboard | Script ready — RUN |

## High priority (Day 2)

1. **No CI** — add GitHub Actions: typecheck + test on every PR. Note: backend
   `lint` script exists but eslint is not installed (devDependency missing).
2. **Fail-closed webhook auth in production** — `middleware/webhookAuth.ts`
   passes requests through with a warning when `RETELL_API_KEY` /
   `WEBHOOK_SHARED_SECRET` are unset. Must 503 in `NODE_ENV=production`.
3. **`trust proxy` unset** (`index.ts`) — rate limiter keys on Railway's proxy
   IP: one shared bucket for all users. `app.set('trust proxy', 1)`.
4. **Single-instance assumptions** — 60s `setInterval` call poller + all 7
   BullMQ workers run inside the web process. >1 Railway replica ⇒ duplicate
   dials. Needs a worker service or a DB claim/lock before scaling.
5. **Intake swallows application-insert errors** (`intake.service.ts` ~L131) —
   candidate saved, application silently missing.
6. **Emails endpoint paginates cross-org then filters in JS**
   (`emails.routes.ts` ~L22-44) — wrong totals + cross-org count leak;
   `email_logs` needs org scoping at query level.
7. **Graceful shutdown + deep health** — no SIGTERM handling; `/health`
   doesn't check DB/Redis.
8. **Re-engagement campaign launch runs synchronously in the HTTP handler**
   (`reengagement.routes.ts`) — move to the queue.

## Compliance / client-handoff (Day 3–4)

- **TCPA/opt-out**: `candidates.reengagement_opted_out` is read but NOTHING can
  set it — build unsubscribe link + endpoint before any automated outreach.
- **Right-to-erasure**: no candidate delete endpoint; add one (+ storage/
  transcript cleanup) for GDPR/CCPA requests.
- **PII in logs**: emails/phones logged at info level in webhooks; redact.
- **Sub-processors**: resumes go to OpenRouter; name/phone/transcript/audio to
  Retell — client's DPA needs both listed.
- **Resume serving**: stored `getPublicUrl` links never worked on the private
  bucket — add a backend signed-URL endpoint for uploaded resumes.
- Prod data cleanup: test candidates (`bf635c3b…`, `1af7e2eb…` Sam Patel,
  andrew…@gmail.com, test-pipeline@example.com), ~3 "Web Developer" test jobs,
  orphan call `6feaa3b1`; ~13 stray dev agents in the Retell dashboard.
- Docs: root README for the client; frontend README is still the Lovable
  placeholder; CLAUDE.md DB section outdated (says 4 migrations / 17 tables).

## Frontend (all fixes go via Lovable prompts)

- Six detail-sheet organisms bypass domain hooks with inline `apiRequest`
  (JobDetailSheet, CandidateDetailSheet, CompanyDetailSheet, CallDetailSheet,
  ApplicationDetailSheet partly, AgentBuilder) → ~15 domain hooks now dead and
  `getScore()`/status-color maps triplicated. One prompt: collapse onto the
  existing hooks.
- **Stage display inconsistency**: list/kanban render `pipeline_stage`; the
  application detail sheet still renders legacy `status` — same application
  can show different stages.
- `Emails.tsx` renders email HTML via `dangerouslySetInnerHTML` unsanitized —
  sanitize (DOMPurify) or render text-only.
- Settings: Profile/Organization save buttons and the whole Integrations tab
  are inert placeholders — wire up or hide before handoff.
- Dead: `pages/Index.tsx` (unrouted), `/signup` page (after PR #25),
  scheduling-hook aliases, `useRecruiterWorkloads` (plural).
- Role gating is cosmetic (button-hiding in 3 spots, `as any` casts) — real
  enforcement is backend `requireRole`; acceptable, but don't rely on the UI.

## Operational runbooks

**Apply a migration**: remote history is fully in sync (001–017 as of 7/2), so a
plain `supabase db push --linked` applies exactly the pending files. (The old
single-file `mv` trick is obsolete.)

**Purge junk campaigns**: `python3 scripts/ops/purge_campaigns.py` (reads
`backend/.env`; deletes ALL reengagement_campaigns in 6h windows, children
cascade). Run after PR #24 deploys; re-run once if the sweep refilled a few.

**Agent persona update / re-sync**: `PORTAL_ADMIN_EMAIL=… PORTAL_ADMIN_PASSWORD=…
python3 scripts/ops/update_agent_personas.py` — sets Grace/Adrian/Brian
personas, re-syncs to Retell (fixes webhook URL), prints sync_status. Follow
with a test call (`POST /api/agents/:id/test-call`) to a recruiter phone.

## Definition of done for client handoff

1. PRs #23 (dead code), #24 (runaway), #25 (auth) merged + deployed; migration 017 applied.
2. Campaign purge complete; sweep confirmed disabled in deploy logs.
3. Agents re-synced (webhook URL on new domain), personas live, sign-off test
   call completed and transcript/eval landed in the DB.
4. Secrets rotated; CI green on a test PR; webhook auth fail-closed;
   trust proxy set.
5. Opt-out + candidate-delete endpoints live.
6. Lovable prompt batch run (signup removed, detail-sheet unification,
   pipeline_stage consistency, email sanitization, Settings placeholders).
7. End-to-end rehearsal: intake → screen → invite → book → live call →
   transcript → pipeline board, all on the deployed stack.
