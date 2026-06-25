# Plan: Email Sending (Graph) + Cal.com → AI-Call Scheduling Hardening

> Source plan; execution handed to a separate agent. Read this file and `CLAUDE.md` first.

## Context

**Why this work exists.** The Saanvi Interview Portal automates: recruiter approves a candidate → an
invitation email is sent → candidate books a slot on Cal.com → an AI voice agent (Retell) calls them at
that slot. Two problems block this from working reliably in production:

1. **Email was never actually sending.** `EMAIL_TRANSPORT` defaulted to `log`, so invitations were only
   written to logs, never delivered. We attempted SMTP from the company mailbox `AISaanviHR@saanvi.us`
   (Microsoft 365), but the tenant has **SMTP basic auth disabled** (`535 5.7.139 SmtpClientAuthentication
   is disabled`), and **app passwords are not available** on the account. The supported path is the
   **Microsoft Graph API** (app-only / client-credentials). An Azure app registration ("Interview Portal
   Email") was created with `Mail.Send` + `Mail.Read` application permissions.

2. **The scheduling loop has integration seams that fail silently.** The per-job interview **deadline is
   not actually enforced** (the `?endDate=` URL param is a no-op in Cal.com, and the webhook never checks),
   bookings are matched to candidates **by email only** (fragile), failures are **silently dropped**
   (`received: true` even on no-phone / no-match), there is **no reschedule/cancel handling**, and there is
   **no idempotency** against duplicate Cal.com webhook deliveries.

**Intended outcome.** Invitations send for real from `AISaanviHR@saanvi.us` via Graph, and the
invite→book→call loop becomes reliable: per-job deadlines are enforced (both visually in Cal.com and as an
authoritative backend backstop), bookings match the exact application, reschedules/cancellations keep the
scheduled call in sync, and nothing fails silently.

## Decisions (confirmed with user)

- **Scope:** sending + scheduling only. Inbound application-email receiving (Graph `Mail.Read` → resume
  parse → candidate-intake) is a **separate later plan**. (`Mail.Read` consent is pre-positioned now.)
- **Scheduler:** keep **Cal.com**, harden the integration (do not build an in-house booking page now).
- **Deadline enforcement:** **both** layers — a webhook backstop (authoritative) **and** per-job Cal.com
  availability via the Cal.com API (so late slots aren't shown).

## Already done (code complete, verification pending)

- `email.service.ts`: added Graph sender — app-only OAuth token (cached) + `sendMail`; `sendEmail()` now
  branches `graph | smtp | log`.
- `config/env.ts`: `EMAIL_TRANSPORT` enum extended to include `graph`; added `MS_GRAPH_SENDER`.
- `backend/.env`: filled `MS_GRAPH_CLIENT_ID / _SECRET / _TENANT_ID`, `MS_GRAPH_SENDER=AISaanviHR@saanvi.us`,
  `EMAIL_TRANSPORT=graph`. Backend type-checks clean.
- A live test helper exists at the session scratchpad: `graph-send-test.js` (sends via Graph; expects 202).
- **Blocked on:** admin consent for `Mail.Send`/`Mail.Read` (the "Grant admin consent" button is disabled
  for the non-admin who registered the app — handed a step-by-step guide to the tech team / Global Admin).

---

## Workstreams

### WS0 — Housekeeping (do first)
- Copy this plan into the repo at `docs/plans/email-sending-and-scheduling.md` (done).
- (Assistant memory entries about the Graph migration + decisions are written separately.)

### WS1 — Finish & verify SENDING (Graph) — *Phase 1*
- **Pre-req:** Global Admin grants admin consent (Mail.Send/Mail.Read → green ✓).
- Run live test → expect HTTP `202`; confirm email arrives.
- Restart backend so `.env` loads; verify a real invite writes `email_logs.status = 'sent'`.
- Swap the booking link in `email.service.ts` (`CAL_BASE_URL`, currently
  `cal.com/saanvitech/screen-interview-x-saanvi-tech`) to the confirmed real Cal.com link.
- Add a startup log/guard: if `EMAIL_TRANSPORT=graph` but Graph vars missing, warn loudly (no silent fallback).

### WS2 — Secure the webhooks — *Phase 1*
- Set `WEBHOOK_SHARED_SECRET` in `backend/.env` and configure Cal.com to send the `x-webhook-secret` header.
- Rationale: `requireWebhookSecret` (`middleware/webhookAuth.ts:37`) currently **passes through with a
  warning when the secret is unset** — both `cal-booking` and `candidate-intake` are open today.

### WS3 — Carry identity through the link (kill email-only matching) — *Phase 1*
- In `email.service.ts` `buildCalUrl()` + invitation flow: append Cal.com prefill + metadata
  `?email=…&name=…&metadata[application_id]=<uuid>&metadata[job_id]=<uuid>`. (`sendInvitationEmail` already
  receives `applicationId` + candidate; thread `job_id` through.)
- In `cal-booking` webhook (`webhooks.routes.ts:203–323`): resolve the application by
  `payload.metadata.application_id` **first**, fall back to email match. Load the exact application+job
  from that id (fixes the "most-recent active application / wrong-job" risk at lines 255–265).

### WS4 — Deadline backstop (authoritative) — *Phase 1*
- In `cal-booking` webhook, after resolving the application/job, compare `payload.startTime` to
  `job.interview_deadline`. If the slot is **after** the deadline: do **not** schedule the call; **cancel
  the Cal.com booking via the Cal.com API** and re-invite/notify the candidate.
- New `services/cal.service.ts` to wrap Cal.com API calls (cancel booking; later, availability). Requires
  `CAL_API_KEY` in env.

### WS5 — Per-job Cal.com availability (UX layer) — *Phase 2*
- When a job's `interview_deadline` is set (approve-interview flow, `applications.routes.ts:285–304`), drive
  that date window into Cal.com via the API so candidates don't see slots past the deadline.
- Approach decision at build time: per-job managed event type vs. event-type booking-limit date range.
  Heavier integration — phase **after** the backstop (WS4), which guarantees correctness regardless.

### WS6 — Booking lifecycle: reschedule / cancel + idempotency — *Phase 2*
- Handle `BOOKING_RESCHEDULED` → update the scheduled call's `scheduled_at` (reuse the existing row via
  `initiateOutboundCall({ existingCallId })`, `call.service.ts:78–118`). Handle `BOOKING_CANCELLED` →
  cancel the scheduled call.
- Idempotency: add a `cal_booking_uid` column to `calls` (new migration), store it on schedule, and dedupe
  duplicate webhook deliveries. (`calls` has no external-id column today; PK only.)

### WS7 — Fail loudly, not silently — *Phase 1*
- No phone / no match / past deadline → write `activity_log` **and** notify the recruiter (channel TBD),
  instead of returning `received: true` and discarding.
- Return `5xx` on transient/internal errors so Cal.com retries; return `200` only for handled outcomes.

---

## Critical files

- `backend/src/services/email.service.ts` — Graph sender (done), `CAL_BASE_URL` swap, prefill/metadata link.
- `backend/src/config/env.ts` + `backend/.env` — `EMAIL_TRANSPORT`, Graph vars (done), `WEBHOOK_SHARED_SECRET`, `CAL_API_KEY`.
- `backend/src/routes/webhooks.routes.ts` — `cal-booking` handler (WS3/4/6/7).
- `backend/src/routes/applications.routes.ts` — approve-interview deadline flow (WS5).
- `backend/src/services/call.service.ts` — reuse `existingCallId` path; reschedule/cancel helpers.
- **New:** `backend/src/services/cal.service.ts` (Cal.com API), `supabase/migrations/0XX_calls_cal_booking_uid.sql`.

## Reuse (don't rebuild)

- `initiateOutboundCall({ existingCallId })` reuse-row pattern — `call.service.ts:78–118`.
- `pollScheduledCalls` 60s poller — already wired (`callScheduler.job.ts:73–94`, `index.ts:114–121`).
- `requireWebhookSecret` — `middleware/webhookAuth.ts:36–58`.
- `sendInvitationEmail` / `sendFollowUpEmail` — `email.service.ts`.
- `idx_calls_scheduled` partial index — `001_initial_schema.sql:217`.

## Inputs still needed (operational)

- Admin consent granted (WS1 blocker — tech team).
- Real Cal.com booking link (WS1).
- Cal.com **API key** + confirm the event type + Outlook calendar connected in Cal.com (WS4/WS5).
- Recruiter notification channel for loud failures (email to recruiter vs in-app) (WS7).

## Verification (end-to-end)

1. **Sending:** run the Graph send test → `202`; invite arrives; `email_logs.status='sent'`.
2. **Happy path:** seed a candidate *with phone* + an application; `approve-interview` (sets job deadline +
   sends invite); simulate a Cal.com `BOOKING_CREATED` webhook with `metadata.application_id` → assert a
   `calls` row is `scheduled` for the correct application/job at the booked time; poller fires the Retell call.
3. **Deadline backstop:** simulate a booking *after* the deadline → assert no call scheduled, booking
   cancelled via Cal API, candidate re-invited.
4. **Reschedule:** `BOOKING_RESCHEDULED` → assert `scheduled_at` updated on the same call row.
5. **Cancel:** `BOOKING_CANCELLED` → assert the scheduled call is cancelled.
6. **Idempotency:** deliver the same `BOOKING_CREATED` twice → assert only one scheduled call.
7. **Loud failure:** booking for a candidate with no phone → assert `activity_log` entry + recruiter notice.
8. `make validate` (type-check + lint) before any push.

## Phasing

- **Phase 1 (sending live + reliable loop):** WS0, WS1, WS2, WS3, WS4, WS7.
- **Phase 2 (UX + lifecycle):** WS5 (per-job Cal availability), WS6 (reschedule/cancel + idempotency).
