# Operations manual & handoff guide

Everything an operator needs to run the Saanvi Interview Portal in production.
Architecture and development conventions live in the root
[`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md); this document
covers the live system, its knobs, its known constraints, and the
ownership-transfer checklist.

## 1. Infrastructure map

| Piece | Where | Notes |
|---|---|---|
| Backend API | Railway — project `Saanvi-portal`, service `ai-interview-portal-sp` | Auto-deploys `main`. Health: `/health` (shallow), `/health/ready` (DB + Redis). |
| Frontend | Lovable — auto-deploys `main` | All frontend changes are made via Lovable prompts (`docs/lovable-prompts/`), never by editing `frontend/` directly. Lovable sometimes adds dependencies without updating `package-lock.json` (breaks `npm ci` in CI) and its "Build unsuccessful" banner is a sandbox quirk — trust a local `npm run build`. |
| Database + storage + auth | Supabase | Migrations `supabase/migrations/001…018`, applied with `supabase db push --linked`. The `resumes` bucket is private (service-role only); files are served via the signed-URL endpoint. |
| Job queue | Redis (Railway service) | BullMQ workers run inside the web process — see §4 single-instance constraint. |
| Voice calls | Retell AI | One phone number; inbound routing is **dynamic** via `inbound_webhook_url` → `POST /api/webhooks/retell/inbound` (do not statically bind agents to the number). Three portal agents (persona names live in agent prompts, not DB names). |
| Outbound email + intake inbox | Microsoft Graph (Azure app registration) | Sends from the mailbox in `MS_GRAPH_SENDER`; polls the same inbox for CEIPAL notification emails. |
| Interview booking | Cal.com | Candidates book via the link in invitation emails; webhooks drive call scheduling. |
| ATS | CEIPAL | Job sync via API; candidate intake via notification-email polling. |

## 2. Environment variables

The complete reference is [`backend/.env.example`](../backend/.env.example) —
every variable, with comments. Values live in Railway (backend) and Lovable
(frontend `VITE_*`). Rotation procedures: [`runbooks/credential-rotation.md`](./runbooks/credential-rotation.md).

**Feature gates (and why they're set the way they are):**

| Variable | Production value | Why |
|---|---|---|
| `REENGAGEMENT_AUTO_SWEEP` | `false` | The recurring sweep auto-emails matched passive candidates every 6h. It once ran away and generated 68k campaigns; leave off unless the volume is understood and intended. Manual re-engagement from the UI still works. |
| `ALLOW_PUBLIC_SIGNUP` | `false` | Signup is invite-only (Settings → Team). Turning this on lets anyone create an org. |
| `EMAIL_TRANSPORT` | `graph` | Real email via Microsoft Graph. `log` = dev mode (logs instead of sending). |
| `CEIPAL_RECRUITER_ID` | set (encoded id) | Gates mail intake to jobs assigned to your recruiter. **Unset disables the gate** — every parsed applicant email in the inbox gets ingested (startup logs a warning). |
| `WEBHOOK_SHARED_SECRET` | set | Without it, intake/cal-booking webhooks are open. Webhook auth fails closed in production. |
| `PUBLIC_API_URL` | set | Required in prod — Retell's post-call webhook URL is built from it. |

## 3. Routine operations

- **Apply a DB migration**: add `supabase/migrations/0NN_*.sql` →
  `supabase db push --linked` (remote history is in sync).
- **Deploy**: merge to `main`; Railway and Lovable both auto-deploy. Verify
  `/health/ready` after backend deploys.
- **Candidate deletion**: by owner decision (2026-07-06), candidate data is
  retained indefinitely — deletion is not part of the operating model. See
  Known Issues §8 before ever relying on `DELETE /api/candidates/:id`.
- **Ops scripts** (`scripts/ops/`): `cleanup_retell_strays.py` (delete
  non-portal Retell agents; guards live + phone-bound agents; dry-run by
  default), `purge_campaigns.py` (bulk-delete re-engagement campaigns),
  `update_agent_personas.py` (re-sync the three agents' personas/webhook URL to
  Retell).
- **Credential rotation**: [`runbooks/credential-rotation.md`](./runbooks/credential-rotation.md).
- More runbooks (campaign purge, persona re-sync details) live at the bottom of
  [`audits/2026-07-02-production-readiness-audit.md`](./audits/2026-07-02-production-readiness-audit.md).

## 4. Known constraints & issues

Read this before scaling, contracting, or debugging.

1. **Single instance only.** The 60-second call poller and all BullMQ workers
   run inside the web process. Scaling Railway above **1 replica will place
   duplicate phone calls**. Before scaling, split workers into their own
   service or add a DB-level claim/lock.
2. **Sub-processors for your DPA/privacy policy**: candidate name, phone,
   interview audio + transcript go to **Retell AI**; resume text goes to
   **OpenRouter** (model: `OPENROUTER_MODEL`); email content and the intake
   inbox go through **Microsoft Graph**; booking data through **Cal.com**;
   all candidate data rests in **Supabase**.
3. **`activity_log` retains candidate name/email** written by the Cal-booking
   webhook (`interview_booked` details) and intake (`intake_received`), and is
   **not** scrubbed by candidate erasure. For a strict erasure guarantee,
   scrub `activity_log.details` for the candidate's entity_id as a follow-up
   (candidate ids do cascade elsewhere; this is metadata only).
4. **Frontend test suite is a stub** (one placeholder test). CI's frontend
   "test" step is effectively lint + build only. Backend has 60+ real unit
   tests.
5. **Role gating in the UI is cosmetic** — real enforcement is server-side
   (`requireRole`). Hiding a button is UX, not security (this is by design).
6. **Retell phone number bindings**: keep the number's inbound routing on the
   dynamic webhook. Statically binding an agent to the number bypasses the
   backend (no call records, no context routing) — this failure mode happened
   once and was hard to spot.
7. **Voicemail vs no-answer**: voicemail does not auto-redial (the candidate
   got the message + a missed-call email); no-answer/failed redials up to 3
   attempts, then emails. Inbound callbacks match a missed candidate for 7
   days, resume an interrupted interview within 2 hours.
8. **Candidate deletion is non-functional.** The `DELETE /api/candidates/:id`
   endpoint's application code is correct (it scrubs storage + the intake
   ledger, then deletes with verification), but the database DELETE on
   `candidates` silently affects 0 rows — a prod-side trigger/rule/RLS quirk
   that was never diagnosed. The endpoint fails **loudly** (500) rather than
   pretending success. Accepted at handoff because the operating model retains
   all candidate data. If a legal erasure request ever arrives, diagnose first:
   inspect triggers/rules/RLS on `candidates` in the Supabase SQL editor
   (`pg_trigger`, `pg_rules`, `pg_class.relrowsecurity`).

## 5. Account-ownership transfer checklist

Credentials were **not** rotated at handoff (owner decision 2026-07-06 —
internal software, risk accepted). Run the rotation runbook at takeover, since
the previous operator held all current secrets.

- [ ] **1. Rotate all credentials** per the runbook, storing new values in the
  new owner's vault.
- [ ] **2. GitHub**: transfer the repository (Settings → Danger Zone →
  Transfer) to the client's org. Re-point Railway's and Lovable's GitHub
  connections at the new repo location afterward — auto-deploy breaks until
  you do. Prune stale branches first.
- [ ] **3. Railway**: transfer the `Saanvi-portal` project to the client's
  team/workspace (Project Settings → Transfer, or invite → promote → remove).
  Billing follows the workspace. Confirm env vars and both services (API +
  Redis) came along; redeploy and check `/health/ready`.
- [ ] **4. Supabase**: transfer the project to the client's organization
  (Project Settings → General → Transfer project). Auth, DB, storage, and keys
  are unaffected by the transfer itself.
- [ ] **5. Retell**: Retell has no self-serve workspace transfer — either hand
  over the account (change login email + password + billing) or contact Retell
  support to move the workspace. The **phone number** must stay in whichever
  workspace the agents live in; confirm `inbound_webhook_url` still points at
  `POST /api/webhooks/retell/inbound` afterward.
- [ ] **6. Lovable**: add the client as owner of the workspace/project (or
  transfer the project), and confirm the GitHub connection + custom domain (if
  any) survive.
- [ ] **7. Microsoft Graph / Azure** ⚠️ **decision required**: the app
  registration and the sender mailbox live in the current Microsoft 365
  tenant. If the client uses a different tenant, they must (a) create their own
  app registration (Application permissions: `Mail.Send`, `Mail.Read` — plus
  `Mail.ReadWrite` if inbox cleanup is wanted), (b) provide a sender mailbox in
  their tenant, and (c) update all four `MS_GRAPH_*` vars + `EMAIL_TRANSPORT`.
  Email sending and CEIPAL mail intake are down until this is done.
- [ ] **8. Cal.com**: transfer the account or recreate the event type in the
  client's account; update `CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_BASE_URL`
  and the Cal webhook (URL + `x-webhook-secret`).
- [ ] **9. CEIPAL**: client provides their own API credentials + recruiter id;
  update the five `CEIPAL_*` vars.
- [ ] **10. Smoke test** end-to-end on the transferred stack: login → create a
  scratch candidate → invite → book → outbound call → transcript lands →
  erase the scratch candidate. Then check `/health/ready`, one email, one
  screening.
