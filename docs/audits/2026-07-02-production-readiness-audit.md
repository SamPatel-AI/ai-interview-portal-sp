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
- ~~**Right-to-erasure**~~ ⚠️ endpoint shipped (PR #33, hardened #37/#44) but
  the underlying DB DELETE on `candidates` silently affects 0 rows (prod-side
  cause never diagnosed). **Owner decision 7/6: data is retained, deletion not
  needed** — documented as Known Issue §8 in `docs/HANDOFF.md`.
- ~~**PII in logs**~~ ✅ DONE (PR #42, 7/6): maskEmail/maskPhone at all 20
  interpolating log sites (webhooks, intake, mail poll, email service).
- ~~**Sub-processors**~~ ✅ DONE (7/6): full list in `docs/HANDOFF.md` §4.2.
- ~~**Resume serving**~~ ✅ DONE (PR #43 + Lovable prompt, 7/6): signed-URL
  endpoint `GET /api/candidates/:id/resume`; verified in the deployed UI.
- Prod data cleanup (7/6): test jobs already gone; 3 stray Retell agents
  identified by dry-run (10 of the ~13 were already gone) — `--delete` run
  pending; stuck in_progress calls (`c851b08e`, `8a9ca7f6`, `6feaa3b1`) →
  SQL patch pending; rehearsal job close + shared-test-phone clear pending.
  The 2 remaining test candidates stay (deletion non-functional + owner
  retains-all-data decision).
- ~~Docs~~ ✅ DONE: root README (7/3), CLAUDE.md refreshed + creds scrubbed,
  `docs/HANDOFF.md` + `docs/runbooks/credential-rotation.md` added (7/6).

## Frontend (all fixes go via Lovable prompts)

All items below landed in the 7/3 Lovable cleanup batch — re-verified in the
repo 7/6 (detail sheets hook-only, `pipeline_stage` in the detail sheet,
DOMPurify in Emails.tsx, Settings pruned, Index/signup/dead hooks removed).

- ~~Six detail-sheet organisms bypass domain hooks with inline `apiRequest`~~ ✅
- ~~**Stage display inconsistency**~~ ✅
- ~~`Emails.tsx` renders email HTML via `dangerouslySetInnerHTML` unsanitized~~ ✅
- ~~Settings: inert placeholder buttons/tabs~~ ✅
- ~~Dead: `pages/Index.tsx`, `/signup` page, scheduling-hook aliases,
  `useRecruiterWorkloads`~~ ✅
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
4. ~~Secrets rotated~~ (waived 7/6 — runbook delivered instead); CI green ✅;
   webhook auth fail-closed ✅; trust proxy set ✅.
5. Opt-out live ✅; candidate-delete: endpoint live but DB-level delete
   non-functional — waived 7/6 (data-retention decision, see HANDOFF.md §4.8).
6. ~~Lovable prompt batch run~~ ✅ DONE 7/3, re-verified 7/6.
7. ~~End-to-end rehearsal~~ ✅ PASSED 7/3 16:24Z: intake → screen → invite →
   book → outbound → voicemail → missed-call email → inbound callback →
   interview → transcript → application flipped to interviewed.

**Handoff status 7/6: DONE** except account-ownership transfer (checklist in
`docs/HANDOFF.md` §5, executed by the owner at their pace).
