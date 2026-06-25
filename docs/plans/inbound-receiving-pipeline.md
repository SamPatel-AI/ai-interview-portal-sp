> **⚠️ SUPERSEDED (2026-06-24).** Candidate intake no longer goes through email/n8n at all. It now pulls
> submissions **directly from the CEIPAL API** (`getSubmissionsList`) on a schedule — see the implemented
> pipeline (`ceipalSubmissionsPoll.job.ts`, `intake.service.ts`, migration `015_ceipal_submissions.sql`). This
> document is kept for historical context only; do not execute it.

# Plan: In-house Inbound Email → Résumé → Screening Pipeline (replace the n8n monolith)

> Receiving-side plan. Companion to `docs/plans/email-sending-and-scheduling.md` (sending + scheduling).
> Execution handed to a separate agent. Read this + `CLAUDE.md` first.

## Context

**Why this exists.** Candidate intake today runs on a 32-node n8n workflow that, in **one unbroken
execution per email**, does: Outlook trigger → parse → CEIPAL auth + job match → Google Drive upload +
Word→Docs convert + text extract → **two LLM passes** → **3 Google Sheets writes** → move email → POST to
the portal's `/api/webhooks/candidate-intake`. **No node has any error handling** (confirmed: zero
`retryOnFail`/`continueOnFail`/`onError`, no error workflow), so **any single failure kills the whole run
and the candidate is lost** — and recent executions have been failing continuously. The two Google Sheets
were a legacy database; the portal DB is now the single system of record.

Two structural flaws: (1) **capture and processing are fused** — a flaky LLM/Drive/token loses the
applicant entirely; (2) **data lived in 3 places** (2 Sheets + portal DB), so partial runs caused
discrepancies.

**Intended outcome.** Shrink n8n to a **thin "capture relay"** (watch inbox → POST raw email + attachment
to the backend). The backend owns everything else as **staged, independently-retryable jobs** writing to
**one system of record**, with idempotency, a quarantine/dead-letter path, and loud alerting. Once the
applicant is captured to the DB, no downstream failure can lose them.

## Decisions (confirmed with user)

- **Source:** single Outlook mailbox (`AISaanviHR@saanvi.us`). n8n stays a thin relay **for now**, and is
  swappable later to in-house Microsoft Graph delta-polling (we already hold `Mail.Read` consent) — a
  drop-in replacement of the capture stage only.
- **Job matching:** emails carry a **job code in the subject/body** → extract by pattern → match
  `jobs.ceipal_job_id` (org-scoped). No live CEIPAL call per email (jobs are already synced to our DB).
- **OCR:** rare → ship with `pdf-parse`/`mammoth`; **quarantine + flag** the rare unreadable résumé; OCR
  (vision-LLM) fallback is a later add, not day-one.
- **Org scope:** single org → resolve `org_id` from a `DEFAULT_ORG_ID` config value.

---

## Architecture (staged; mailbox + DB are the durable buffers)

```
n8n relay (~3 nodes)         Backend (one durable entry → staged jobs → one DB)
Outlook trigger (attachments)
  → base64 attachment(s)      POST /api/webhooks/inbound-email  (requireWebhookSecret)
  → HTTP POST raw payload  →    STAGE 0 Capture (sync, tiny, bulletproof):
     (x-webhook-secret)            dedupe by message_id → store attachment(s) to 'resumes' bucket
  on 2xx: move email to            → insert inbound_emails row (status 'received') → enqueue → 200
  "Processed"; on failure        STAGE 1 Process (BullMQ, retries):
  leave in inbox (buffer)          parse from/subject/body → extract job code → resolve org/job
                                   → upsert candidate (source 'email') + create application ('new')
                                   → enqueue resume-processor job  (EXISTING orphaned queue)
                                 STAGE 2 Parse+Screen (EXISTING resume-processor worker, retries):
                                   download attachment → extractResumeText → (empty? quarantine+notify)
                                   → screenResume → write ai_screening_* → status 'screening'
```

Each stage fails in isolation: a screening error is a retry on *that* job — the candidate is already saved.
Terminal failures mark `inbound_emails.status='failed'/'needs_ocr'` and fire a recruiter alert. Nothing is
silently dropped; n8n's HTTP retry + the inbox itself back-stop capture.

---

## Workstreams

### WS0 — Housekeeping
- Copy this plan to the repo: `docs/plans/inbound-receiving-pipeline.md` (done).

### WS1 — `POST /api/webhooks/inbound-email` (Stage 0 capture)
- New handler in `backend/src/routes/webhooks.routes.ts`, guarded by `requireWebhookSecret`
  (`middleware/webhookAuth.ts`). Accepts `{ message_id, from, subject, body, attachments[] (filename,
  contentType, base64) }`.
- **⚠️ Body-size limit (verified gotcha).** Webhooks are mounted with `express.raw({ type:
  'application/json' })` (`index.ts:63`) — **no `limit` set, so it defaults to 100 KB**. A base64 PDF
  (a 1 MB PDF → ~1.4 MB encoded) is rejected with `413` *before the handler runs*. The plan MUST mount
  the inbound route with its own raised limit, e.g. `express.raw({ type: 'application/json', limit:
  '25mb' })`, or bump the shared webhook raw limit. (The `express.json({ limit: '10mb' })` at
  `index.ts:65` does NOT apply — webhooks are consumed by `raw` first.)
- **⚠️ Auth fails open (verified).** `requireWebhookSecret` (`webhookAuth.ts:37-40`) lets requests
  through with only a warning when `WEBHOOK_SHARED_SECRET` is unset. For an internet-facing endpoint
  that writes base64 attachments to storage, require the secret to be set (add a `startupChecks.ts`
  assertion, or fail closed for this route specifically).
- Idempotency: dedupe on `message_id` via the new `inbound_emails` table; duplicate → `200` ack, skip.
- Store attachment(s) to the existing **`resumes`** Supabase Storage bucket at
  `${DEFAULT_ORG_ID}/inbound/${message_id}/${filename}` (same bucket/path convention as
  `candidates.routes.ts:143-195` resume upload).
- Insert `inbound_emails` row; enqueue the Stage 1 job; return `200`. Return `5xx` on storage/DB error so
  n8n retries.

### WS2 — Shared intake service (refactor for reuse, no behavior change)
- Extract **candidate upsert (`(org_id,email)`, lines 43-92) + job resolution (`job_code`→
  `jobs.ceipal_job_id`, lines 94-106) + application create (lines 108-138)** out of the `candidate-intake`
  handler (`webhooks.routes.ts:21-198`) into `backend/src/services/intake.service.ts`. Reuse from both
  `candidate-intake` and the new pipeline. Add a small `utils/jobCode.ts` to extract the job code from
  subject/body.
- **Scope the extraction precisely — the screening *trigger* differs between the two callers and should
  NOT be flattened into the shared service:**
  - `candidate-intake` gets `resume_text` in the POST body and screens **inline** (lines 141-177).
  - The inbound pipeline has **no text yet** (only an attachment) → it must enqueue `resume-processor`
    to extract-then-screen. So the shared service returns `{candidateId, applicationId, resolvedJobId}`;
    each caller invokes its own screening path.
- `candidate-intake` takes `org_id` **from the payload** (line 36 requires it); the inbound path resolves
  it from `DEFAULT_ORG_ID`. The service signature must therefore accept `org_id` as an explicit param.

### WS3 — `inbound-processor` job (Stage 1)
- New `backend/src/jobs/inboundProcessor.job.ts` (Queue+Worker following the repo pattern in
  `callScheduler.job.ts`/`emailSender.job.ts`: `redis` from `config/redis.ts`, `attempts:3`, backoff,
  `removeOnComplete/Fail`). Worker: parse sender/subject/body → extract job code → resolve `org_id`
  (default) and job → call `intake.service` to upsert candidate (with `resume_url`=stored path,
  `source='email'`) + create application → then enqueue the **existing** `resume-processor` job via
  `queueResumeProcessing({ candidateId, resumePath, applicationId })` (`resumeProcessor.job.ts:86` — wires
  up the currently-orphaned queue). Mark `inbound_emails.status='processed'`.
- No job code / no match → still create the candidate, leave the application unmatched (or skip app), set
  `status='unmatched'`, and notify a recruiter to link it.

### WS4 — Stage 2 reuse (parse + screen)
- Reuse `resume-processor` worker (`resumeProcessor.job.ts`): it already downloads from `resumes`, runs
  `processResume`→`extractResumeText` (`resume.service.ts`), and triggers `screenResume` + writes the
  `ai_screening_*` fields when `applicationId` is set (worker body lines 22-77). The candidate-intake
  inline screen (`webhooks.routes.ts:141-177`) writes the identical fields, so the two paths converge.
- **Not pure "reuse as-is" — three small edits to `resumeProcessor.job.ts` are required:**
  1. Thread an optional `inboundEmailId` through `queueResumeProcessing` params + `job.data` (currently
     `{candidateId, resumePath, applicationId}`, line 86-98) so Stage 2 can correlate back to the
     `inbound_emails` row. Without this the worker has no handle to update status.
  2. **Empty-text guard:** `processResume` does NOT throw on an image/scanned PDF — `pdf-parse` returns
     `text: ''`, so `processResume` returns `''` (verified: it only throws on unsupported MIME / download
     failure). Add an explicit `if (!resumeText.trim())` → mark `inbound_emails.status='needs_ocr'` +
     notify, and return early (no screen). OCR fallback itself is deferred.
  3. **Terminal-failure marking:** the `resumeWorker.on('failed')` handler (line 79) only logs. Extend it
     to detect exhaustion (`job.attemptsMade >= attempts`, note `attempts: 2` here, not 3) and, if
     `inboundEmailId` is present, mark `inbound_emails.status='failed'` + alert. Guard with a null check
     so the non-inbound (candidate-intake) callers are unaffected.

### WS5 — Loud failures + idempotency
- New migration **`supabase/migrations/015_inbound_emails.sql`** (014 is the latest; the old `0XX`
  placeholder is resolved): `inbound_emails(id, org_id, message_id UNIQUE, from_email, subject, raw_path,
  status, error, created_at)` (+ index on `status`).
- On terminal failure in any stage → set `inbound_emails.status='failed'`, write `activity_log`, and call a
  recruiter notification. **⚠️ `notification.service.ts` currently exports only `notifyBookingIssue` — there
  is no generic recruiter-notify.** This is NOT pure reuse: add a new function (e.g. `notifyInboundIssue({
  type: 'unmatched'|'needs_ocr'|'failed', messageId, fromEmail, subject })`) modeled on `notifyBookingIssue`.
  Every inbound email ends in a definite state (`processed`/`unmatched`/`needs_ocr`/`failed`) — visible,
  never lost.

### WS6 — Config + n8n relay (operational)
- Env: add `DEFAULT_ORG_ID`; reuse `WEBHOOK_SHARED_SECRET` (shared with the sending plan). Document the
  job-code regex pattern once a real example is provided.
- Rebuild the n8n workflow down to ~3 nodes (trigger → base64 → authenticated HTTP POST), add
  `retryOnFail` on the POST + an n8n **error workflow** alert, and move-email-on-success only. (Operational
  task; the plan documents the target, we don't edit n8n from code.)

---

## Critical files

- `backend/src/routes/webhooks.routes.ts` — new `/inbound-email` handler; thin `candidate-intake` via the service.
- **New:** `backend/src/services/intake.service.ts`, `backend/src/utils/jobCode.ts`,
  `backend/src/jobs/inboundProcessor.job.ts`, `supabase/migrations/015_inbound_emails.sql`.
- **Edits (not just new files):** `jobs/resumeProcessor.job.ts` (thread `inboundEmailId`, empty-text guard,
  terminal-failure marking — see WS4); `services/notification.service.ts` (add `notifyInboundIssue` — see
  WS5); `index.ts` (raised body limit for the inbound route + import the new job — see WS1/WS6).
- `backend/src/index.ts` — import the new job (side-effect) so the worker runs.
- `backend/src/config/env.ts` + `backend/.env` — `DEFAULT_ORG_ID` (and existing `WEBHOOK_SHARED_SECRET`).

## Reuse (don't rebuild)

- `resume-processor` queue + worker (extract + screen, retries already set) — `resumeProcessor.job.ts`;
  wire it via `queueResumeProcessing()` (currently never called).
- `extractResumeText` / `processResume` — `resume.service.ts`.
- `screenResume` — `screening.service.ts`.
- Candidate upsert + `job_code`→`ceipal_job_id` resolution — currently in `candidate-intake`
  (`webhooks.routes.ts:21-198`), to be extracted into `intake.service.ts`.
- `resumes` Supabase Storage bucket + path convention — `candidates.routes.ts:143-195`.
- BullMQ Queue/Worker pattern + `redis` — `config/redis.ts`, `callScheduler.job.ts`, `emailSender.job.ts`.
- `requireWebhookSecret` — `middleware/webhookAuth.ts`; `activity_log` + `notification.service.ts` for alerts.

## Inputs still needed (operational)

- A **real example of the job-code format** in application emails (to write `jobCode.ts` precisely).
- `DEFAULT_ORG_ID` value (the Saanvi org id) and `WEBHOOK_SHARED_SECRET` set (also needed by the sending plan).
- Rebuild of the n8n workflow to the thin relay (or decision to build in-house Graph capture instead).
- Confirm `intake.service` refactor keeps `candidate-intake` byte-for-byte compatible for any other callers.

## Verification (end-to-end)

1. Unit test `jobCode.ts` extraction against sample subjects/bodies.
2. POST `/inbound-email` with a sample email + base64 PDF (valid job code) → assert: `inbound_emails` row;
   candidate upserted; application created+matched; `resume_text` populated; `ai_screening_*` written;
   `status='screening'`; `inbound_emails.status='processed'`.
3. **Idempotency:** POST same `message_id` twice → exactly one candidate/application.
4. **No job code:** → candidate created, `status='unmatched'`, `activity_log` + recruiter notice.
5. **Unreadable PDF:** → `inbound_emails.status='needs_ocr'` + notice, no crash.
6. **Stage failure isolation:** force a screening error → candidate/application still present; resume-processor
   retries; on exhaustion → `failed` + alert (candidate NOT lost).
7. `make validate` (type-check + lint) before any push; restart backend so the new worker + env load.

## Phasing

- **Phase 1:** WS0–WS5 (in-house staged pipeline behind the new endpoint; reuse resume-processor + screening).
- **Phase 2:** WS6 n8n relay slim-down (or in-house Graph delta-poll capture) + OCR fallback for `needs_ocr`.
