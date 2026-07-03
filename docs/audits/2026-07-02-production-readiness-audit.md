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
| B3 | Live secrets travel unencrypted in `.env` files (never committed — verified) | Rotate ALL third-party secrets (Supabase service-role, Retell, CEIPAL, OpenRouter, Graph, Cal, webhook secret) | ⚠️ RISK ACCEPTED by owner 7/3 — keys kept as-is; rotation runbook below stands if circumstances change |
| B4 | `POST /api/portal/generate-token` unauthenticated → 72h PII token for any candidate UUID | `authenticate` + `requireRole(admin,recruiter)` + candidate must be in caller's org | ✅ DONE — #25 merged+deployed 7/2 |
| B5 | Re-engagement sweep runaway: every 6h it treated ~1,730 CEIPAL "open" jobs as stale → 68k junk campaigns / 1.05M child rows; mass-email prevented only by an email-dedup bug (all campaign emails shared one BullMQ jobId) | Sweep opt-in (`REENGAGEMENT_AUTO_SWEEP=false`, removes persisted Redis repeatable at boot), jobId collision fixed, 30-day job recency, 7-day campaign cooldown. Purge script: `scripts/ops/purge_campaigns.py` | ✅ code DONE — #24 merged+deployed 7/2; prod logs confirm recurring job REMOVED. ✅ purge complete 7/3 — both tables verified at 0 rows |
| B6 | Retell agents synced 6/16 (pre account-move) → their webhook URLs likely point at the DEAD old Railway domain → post-call transcripts/evals silently lost | Re-synced 7/3 with Grace/Adrian/Brian personas; webhook URLs verified on the live domain via Retell API. Root cause of rejected webhooks found & fixed: Retell signs with the account key tagged 'Webhook' → RETELL_WEBHOOK_KEY added (PR #29), accepted webhook verified on a live call | ✅ DONE |

## High priority (Day 2)

1. ~~**No CI**~~ ✅ DONE (PR #30): typecheck + lint + tests on every PR; eslint installed in backend.
2. ~~**Fail-closed webhook auth in production**~~ ✅ DONE (PR #31): 503 in production when a webhook secret is unset.
3. ~~**`trust proxy` unset**~~ ✅ DONE (PR #31).
4. **Single-instance assumptions** — 60s `setInterval` call poller + all 7
   BullMQ workers run inside the web process. >1 Railway replica ⇒ duplicate
   dials. Needs a worker service or a DB claim/lock before scaling.
5. ~~**Intake swallows application-insert errors**~~ ✅ DONE (PR #32): throws; failures land in the ceipal_submissions ledger.
6. ~~**Emails endpoint paginates cross-org**~~ ✅ DONE (PR #32): inner-join org scoping at the query level.
7. ~~**Graceful shutdown + deep health**~~ ✅ DONE (PR #31): SIGTERM drain + /health/ready.
8. ~~**Re-engagement launch in HTTP handler**~~ ✅ DONE (PR #32): pending row + worker queue; also fixed missing org scope on the job lookup.

## Compliance / client-handoff (Day 3–4)

- ~~**TCPA/opt-out**~~ ✅ DONE (PR #33): HMAC unsubscribe link in re-engagement emails + public opt-out endpoint + recruiter PATCH field; verified live.
- ~~**Right-to-erasure**~~ ✅ DONE (PR #33): admin DELETE /api/candidates/:id — storage files + FK cascades.
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
