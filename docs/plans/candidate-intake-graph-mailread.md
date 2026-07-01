# Plan: Candidate intake via Microsoft Graph Mail.Read (CEIPAL notification emails)

> **Status: SPEC READY — blocked only on Azure admin consent (`Mail.Read`).** The same one-click consent that
> turns on invitation sending (`Mail.Send`) also unlocks this. Build the moment consent lands. (2026-06-25)

## Context — why this, after exhausting the API

Candidate intake must capture **new job-board applications** — with the **job code**, candidate details, and
résumé. We exhaustively verified the CEIPAL API **cannot** provide this:
- `getSubmissionsList` / the "Applicants Submission Form" custom API = a **frozen** set (dates 2021→Jan 2026), and
  exposes **no job code and no candidate identity**.
- `getApplicantsList` = current job-board applies, but has **no job link** and **every filter is ignored**
  (`job_id`/`position_id`/`jobcode`/date all return the full 145k).
- CEIPAL **Webhook Events Configuration** exists in the product (release V.25.50) but is **not enabled in the
  Saanvi tenant** (only "Custom API Configuration" + "API Access Configuration" appear under Admin → API Settings).
  Deferred — raise a CEIPAL support request separately if we ever want to drop email.

The **CEIPAL notification email** is the only current source that carries candidate + **JPC code** + résumé, and
it's already scoped to the right jobs (CEIPAL emails the job's "Assigned To" list, which includes
`AISaanviHR@saanvi.us`). We read it **in-house via Microsoft Graph `Mail.Read`** — not n8n. This realizes the
"Phase 2: in-house Graph delta-poll capture" that the earlier `inbound-receiving-pipeline.md` anticipated.

## Architecture

```
AISaanviHR@saanvi.us mailbox
  │  Graph Mail.Read (app-only token — same Azure app as sending)
  ▼
ceipalMailPoll.job (BullMQ, every ~5–10 min)
  │  list new messages from notifications@ceipalmail.com (receivedDateTime > watermark), $expand attachments
  │  dedupe by internetMessageId (ledger)
  ▼
parse each "Pipeline Submission" email:
  • JPC code  ← subject  /JPC\s*-\s*(\d+)/
  • candidate ← body labels (Candidate Name / Email ID / Contact Number / Applicant Location / Work Authorization)
  • résumé    ← PDF attachment bytes
  ▼
GATE: is this JPC one of AISaanviHR's assigned jobs?  (jobs.assigned_recruiter contains Sam Patel's id)
  ├─ yes → intake.service.ingestCandidate(jobCode, candidate, résumé bytes) → existing screen/match pipeline
  └─ no  → log + skip (off-scope / forwarded)
  ▼
mark email processed (move to a "Processed" folder or category) so it's never re-ingested
```

## Components

### New
- **`backend/src/services/graphMail.service.ts`** — Graph Mail.Read helpers (reuse the app-only token logic in
  `email.service.ts getGraphToken()`): `listInboxMessages(since, fromAddr)` (`GET /v1.0/users/{sender}/mailFolders/
  inbox/messages?$filter=...&$expand=attachments`), `getMessageAttachments(id)`, `markProcessed(id)` (move to a
  `Processed` folder via `POST /messages/{id}/move`, or add a category). Sender mailbox = `MS_GRAPH_SENDER` (AISaanviHR).
- **`backend/src/utils/ceipalEmail.ts`** — parse a CEIPAL notification email → `{ jpcCode, firstName, lastName,
  email, phone, location, workAuthorization, source, resume? }`. Subject pattern: `"<Source> applicant for <Client>
  : JPC - <num> : <JobTitle> : <CandidateName>"`; body is `Label - Value` lines under "Candidate Details".
- **`backend/src/jobs/ceipalMailPoll.job.ts`** — BullMQ repeatable (copy `ceipalSync.job.ts` pattern). Poll inbox →
  dedupe (ledger) → parse → assigned-job gate → `ingestCandidate` → mark processed. Bootstrap in `index.ts`.
- Ledger: reuse the existing **`ceipal_submissions`** table (or rename concept) — dedupe key = the email's
  `internetMessageId`; status `processed`/`unmatched`/`needs_resume`/`failed`/`skipped`.

### Edited
- **`ceipal.service.ts` / job sync** — store the full `assigned_recruiter` list (comma-separated CEIPAL user ids,
  from `getJobPostingDetails`) on `jobs` (new `jobs.ceipal_assigned_recruiters TEXT`). Resolve Sam Patel's id once
  (`getUsersList`; currently `z5G7h3l6a1kMvyS65NP3c9XXNG0FW3dPbRUaKR83guY=`, email `AISaanviHR@saanvi.us`). The gate
  checks the JPC's job has Sam's id in that list. *(Belt-and-suspenders; the email already arrives only for assigned
  jobs.)*
- **`index.ts`** — bootstrap `ceipalMailPoll`; **retire/disable `ceipalSubmissionsPoll.job`** (it polls the dead
  `getSubmissionsList` — currently logs "0 new" forever and makes ~29 wasted CEIPAL calls per cycle).
- **`config/env.ts`** — reuse `MS_GRAPH_*` (sender = AISaanviHR). Optional `CEIPAL_MAIL_POLL_MINUTES` (default 5).

### Reuse (unchanged, already built + proven)
- `intake.service.ingestCandidate` (upsert candidate → match job by `jobCode`→`ceipal_job_id` → create application →
  upload résumé → enqueue `resume-processor`).
- `resume-processor` (extract text → `screenResume` → fit score + analysis + role-specific questions). Verified live.
- Graph app-only token (`email.service.ts`) — same Azure app, just add the read calls.

## What's already lined up (so this is a fast build)
- ✅ Azure Graph app "Interview Portal Email" requests **`Mail.Send` + `Mail.Read`** — one consent unlocks both.
- ✅ Downstream pipeline (intake → résumé extract → AI screen → role-specific questions) built and proven on real data.
- ✅ Cal.com connected; booking → AI-call loop wired + signature-verified live.
- ✅ Assignment data confirmed in the API (`assigned_recruiter`; Sam Patel's id known).
- ✅ Email format known (subject carries `JPC-xxxx`; body has candidate fields; résumé attached).

## The moment admin consent (`Mail.Send` + `Mail.Read`) lands — execution checklist
1. **Rotate** the Graph client secret (it was pasted in chat) → set `MS_GRAPH_*` + `EMAIL_TRANSPORT=graph` in Railway
   (turns on invitation *sending*).
2. Build `graphMail.service` + `ceipalEmail` parser + `ceipalMailPoll.job`; bootstrap it; retire `ceipalSubmissionsPoll`.
3. Add `jobs.ceipal_assigned_recruiters` + populate in job sync; resolve Sam's id; wire the assigned-job gate.
4. **Verify end-to-end:** a real CEIPAL email → parsed → JPC gated → candidate + résumé ingested → screened
   (score + questions). Then the full loop: invite → book → AI call.

## Verification
- Unit: `ceipalEmail.ts` parser against real CEIPAL notification email bodies (JPC code + fields extracted correctly).
- Integration: point Graph read at the live AISaanviHR inbox → confirm new notification emails are captured,
  deduped by message id, parsed, gated, ingested, and marked processed (not re-ingested).
- `make validate` before push; feature-branch → PR per the repo convention.
