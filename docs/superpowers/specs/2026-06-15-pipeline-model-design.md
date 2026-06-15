# Unified Pipeline Model — Design

> **Created:** 2026-06-15 · Goal: one coherent recruiting-pipeline model so backend, frontend, and data logic never drift. Source of truth lives in the backend; the frontend only renders.

## 1. Core principle — ONE derived stage, computed in the backend

The board, list view, analytics, and any automation must all agree on "what stage is this application in." So we compute it in **one place** — a backend helper `derivePipelineStage(application)` — and return it on every application from the API as **`pipeline_stage`** + **`sub_status`**. The frontend **renders by these fields and never re-derives** them from raw status/calls/email. This is what keeps every layer in link.

```
derivePipelineStage(app) -> { pipeline_stage, sub_status }
  inputs: app.status, app.invitation_sent, app.calls[], app.shortlisted_at
```

## 2. The canonical stages (the only vocabulary everyone uses)

| pipeline_stage | Meaning | Board column | Actions on card |
|---|---|---|---|
| `new` | Screened, no invite sent | **New** | Send Invite, Reject |
| `in_progress` | Invited; booking/calling underway | **In Progress** | (none — system-driven) |
| `interviewed` | A call completed successfully | **Interviewed** | Shortlist, Reject |
| `failed` | Invited, 3 call attempts, none completed | **Interviewed** (red) | Recall, Re-send Invite, Reject |
| `shortlisted` | Final positive (last 7 days) | **Shortlisted** | (Hire later) |
| `archived` | shortlisted >7d ago, rejected, hired | hidden from board | visible in List view only |

`sub_status` (label shown on `in_progress` / `failed` cards): `invited` ("Email Sent") · `booked` ("Slot Booked") · `retrying` ("Retrying n/3") · `no_answer` · `disconnected`.

## 3. Derivation rules (the single function)

```
if status in (rejected, hired)                         -> archived
if status == shortlisted:
    shortlisted within 7 days  -> shortlisted   else   -> archived
if any call.status == 'completed' OR status==interviewed-> interviewed
if invitation_sent:
    attempts = calls.length
    if attempts >= 3 and no completed call             -> failed
    else                                               -> in_progress
        sub_status: latest call no_answer->no_answer;
                    failed/interrupted->disconnected;
                    (no_answer|failed) & attempts<3 ->retrying;
                    scheduled/in_progress->booked; else->invited
else                                                   -> new
```

## 4. DB status vs derived stage (don't duplicate state)

`applications.status` (enum: new, screening, interviewed, shortlisted, rejected, hired) stays the **stored high-level state**. `in_progress` and `failed` are **derived only** (not stored) — they come from invitation + calls. Transitions that write `status`:

| Event | Who | status becomes |
|---|---|---|
| Candidate intake / screened | system | `new` → `screening` |
| Send Invite (approve-interview) | recruiter | stays `screening`, invitation logged + job deadline set |
| Call completed (post-call webhook) | system | `interviewed` |
| Shortlist | recruiter | `shortlisted` (+ set `shortlisted_at`) |
| Reject | recruiter | `rejected` |

> Add column `applications.shortlisted_at TIMESTAMPTZ` so the 7-day archive is exact (not `updated_at` guesswork).

## 5. Deadline model (on the JOB) — PR #5

`jobs.interview_deadline` set once on the **first** Send Invite for that job (mandatory date picker), reused for all its candidates, shown everywhere the job appears, and caps the Cal.com booking window. Per-application `interview_deadline` mirrors it for the record.

## 6. Call retry / escalation model — PR #6

Post-call webhook: `no_answer`/`failed` → auto-redial (fresh outbound, ~3 min apart) up to **3 total attempts** → then left `failed` (→ derived stage `failed`). Manual: **Recall** = `POST /api/calls/outbound`, **Re-send Invite** = `POST /api/applications/:id/resend-invitation`. `interrupted` still resumes (existing).

## 7. Client linking model

`jobs.ceipal_company_id` (captured, PR #4) → matched to `client_companies.ceipal_company_id`. Sync auto-links jobs to the client with the matching id. Mapping of CEIPAL company id → client is set once per client (manual, since CEIPAL v1 exposes no client names). Current data: all jobs = company `14295` (pending confirm = Ford).

## 8. API contract (what the frontend consumes)

- `GET /api/applications` (list) → each app includes `pipeline_stage`, `sub_status`, `invitation_sent`, `candidates{name}`, `jobs{title, interview_deadline}`, `calls[]`. Board groups by `pipeline_stage`; List view shows all + a Stage column.
- `GET /api/jobs/:id` → includes `pay_rate`, `location`, `employment_type`, `interview_deadline`, `client_company{name}`, `description`.
- Actions: `approve-interview` (Send Invite + deadline), `PATCH status` (shortlist/reject), `calls/outbound` (recall), `resend-invitation` (re-invite), `jobs/sync-ceipal`.

## 9. What changes (reconciled)

**Already in open PRs (consistent with this model — keep):**
- PR #4: CEIPAL pagination + enrichment + `ceipal_company_id`/`pay_rate`.
- PR #5: job-level deadline.
- PR #6: auto-redial + escalation.

**New backend work (the "in link" glue):**
1. `derivePipelineStage()` helper + return `pipeline_stage`/`sub_status` from the applications list (and detail).
2. Migration: `applications.shortlisted_at`; set it on shortlist transition.
3. Client auto-link in the CEIPAL sync (match `ceipal_company_id` → client).
4. `GET /api/jobs/:id` select to include `pay_rate`, `interview_deadline`.

**Frontend (Lovable) — one prompt, renders by `pipeline_stage`/`sub_status`:**
- 4 columns keyed by `pipeline_stage`; cards show `sub_status` badge + the actions from §2. No client-side derivation.
- Job detail shows enriched fields + deadline.

## 10. Implementation order
1. Merge PRs #4, #5, #6.
2. Backend glue (§9 new work) as one PR → deploy → re-sync.
3. One consolidated Lovable prompt that renders purely from `pipeline_stage`/`sub_status`.
4. Confirm CEIPAL `14295` → link clients.
