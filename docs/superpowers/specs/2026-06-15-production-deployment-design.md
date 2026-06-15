# Production Deployment & Rollout Plan

> **Created:** 2026-06-15
> **Status:** Approved (design) — pending implementation plan
> **Goal:** Take the Saanvi Interview Portal live for a real client, with a safe way to
> push updates, isolate testing from the client's live data, migrate historical data,
> and capture errors the client reports.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Backend hosting | **Railway** (API + BullMQ worker + managed Redis). *Default recommendation; not explicitly confirmed — change here if desired.* |
| Environment isolation | **Full staging + production** — separate backend deploys AND separate Supabase projects. |
| Historical data source | **Google Sheet** → CSV export → idempotent import script. |
| n8n at launch | **Keep n8n, re-pointed at `candidate-intake` webhook.** Native email intake is a **deferred phase**, built after the system is proven live. |
| Frontend hosting | **Lovable**, auto-deploying from `main` (production). Staging frontend via Vercel/Netlify on a `staging` branch, or local dev against staging backend. |
| Email transport (prod) | **Resend** SMTP. |

## Non-goals (out of scope for this rollout)

- **Native inbound email intake** (replacing n8n's email-watching/parsing). Designed but
  deferred — see "Deferred work" below. n8n continues to feed the system at launch.
- Custom domain for the frontend (optional, can be added later on Lovable).
- Multi-client / multi-tenant onboarding beyond the current single client.

## Target architecture

Two fully isolated environments. "Staging" is where the developer (you) validates updates;
"Production" is what the client uses.

| Layer | Staging ("your version") | Production ("their version") |
|---|---|---|
| Frontend | `staging` branch → Vercel/Netlify, or local dev | `main` branch → Lovable (auto-deploy) |
| Backend API + worker | Railway service (staging) | Railway service (prod) |
| Redis (BullMQ) | Railway Redis (staging) | Railway Redis (prod) |
| Database | New Supabase project (staging) | Existing "Job Dashboard" Supabase |
| Email | `log` or test SMTP | Resend SMTP |
| Error monitoring | Sentry (staging env) | Sentry (prod env) |

**Request/deploy flow:**
```
feature branch
   → PR (GitHub Actions runs `make validate`)
   → merge to `staging`  → auto-deploy to Staging → you test
   → merge to `main`     → Lovable + Railway auto-deploy to Production
```

## Phased plan

### Phase 0 — Pre-production hardening *(small)*
- Merge PR #2 (remove manual candidate creation, backend).
- Set `WEBHOOK_SHARED_SECRET` (shared with n8n).
- `EMAIL_TRANSPORT=smtp` with Resend credentials.
- Optional migration `007`: pin `search_path` on `get_user_org_id` / `update_updated_at`
  (clears the two function advisor warnings).
- Confirm prod Supabase has migrations 001–006 applied + RLS enabled (already verified for 006).
- **Acceptance:** `main` builds; prod Supabase clean on `supabase db advisors`.

### Phase 1 — Provision environments
- Create a **new staging Supabase project**; run migrations 001–006 (+ 007 if added).
- Railway: create **prod** and **staging** backend services, each with a Redis instance.
- Decide worker model: single service running API + BullMQ worker initially (split later if load requires).
- Configure env vars per environment (Supabase keys, Redis URL, Retell, OpenRouter, Resend, CORS `FRONTEND_URL`, `WEBHOOK_SHARED_SECRET`).
- Set `VITE_API_URL` per frontend environment.
- Add a `/health` endpoint if not present (for uptime checks + Railway healthchecks).
- **Acceptance:** Both backends boot, connect to their Supabase + Redis, `/health` returns OK; staging frontend talks to staging backend.

### Phase 2 — Release workflow
- Protect `main` (require PR + passing CI).
- Create the long-lived `staging` branch.
- GitHub Actions: run `make validate` (type-check + lint) on every PR; optionally run frontend tests.
- Document the branch → staging → prod path, the hotfix path, and rollback steps
  (Railway: redeploy previous; Lovable: revert commit on `main`; Supabase: forward-only migrations).
- **Acceptance:** A trivial change flows feature → PR (CI green) → staging → main → prod deploy.

### Phase 3 — Historical data migration
- Export the Google Sheet(s) to CSV.
- Write a one-time, **idempotent** import script (upsert candidates by email; load available
  interview/call details into `calls` / `call_evaluations`; set `source` appropriately).
- Map spreadsheet columns to schema; log unmapped/needs-review rows.
- **Dry-run on staging**, verify counts and spot-check records, then run against production.
- **Acceptance:** Expected candidate/interview counts present in prod; re-running the script
  makes no duplicate rows.

### Phase 4 — Intake (launch path)
- Re-point the existing n8n flow to POST parsed candidates to the production
  `POST /api/webhooks/candidate-intake` with the `x-webhook-secret` header.
- Verify end-to-end: new email in old pipeline → candidate + application created + AI screening triggered in new system.
- **Acceptance:** A test submission via n8n appears as a screened application in production.
- *(Native email intake to replace n8n is deferred — see "Deferred work".)*

### Phase 5 — Monitoring & feedback loop
- Add **Sentry** to backend (Express error handler) and frontend (Lovable env var).
- Uptime monitor (e.g., UptimeRobot) pinging `/health` on prod.
- Define the **client error-reporting channel** (email/Slack/Linear) and a triage cadence.
- Ensure structured logs are retained (Railway logs / log drain).
- **Acceptance:** A forced test error surfaces in Sentry; uptime alert fires on a simulated outage.

### Phase 6 — Soft launch
- Full smoke test on **staging** across all core flows (candidate intake via n8n, screening,
  call scheduling, evaluation, analytics, re-engagement).
- Pilot on **production** with a limited set of real candidates/jobs.
- Monitor Sentry + logs; iterate via the Phase 2 update workflow.
- **Acceptance:** Pilot runs for an agreed window with no Sev-1 issues; client sign-off to widen usage.

## Deferred work — native email intake (post-launch)

Replaces n8n entirely. Requires:
1. **Receiver** (recommended: **MS Graph poller**, reusing existing `MS_GRAPH_*` Outlook setup;
   alternatives: inbound-parse service like Mailgun/SendGrid, or IMAP poller).
2. New BullMQ repeatable job (`emailIntake.job.ts`) to pull unread mail.
3. LLM extraction service (`emailParser.service.ts`) via OpenRouter (GPT-4o-mini) to turn email
   bodies into structured candidate fields.
4. Attachment → Supabase Storage, then hand off to the existing intake + `resumeProcessor` pipeline.
5. Idempotency (no double-processing) + dead-letter path for unparseable emails.

Estimated ~2–4 days of backend work. The receiver choice (Graph vs inbound-parse vs IMAP) is
decided when this phase begins.

## Risks & mitigations

- **Single shared Supabase for prod is the source of truth** — staging uses a *separate* project
  so tests never touch client data. Migrations are forward-only and applied to staging first.
- **n8n dependency at launch** — acceptable; it already works. Native intake removes it later.
- **Lovable owns `main`/prod frontend** — keep prod deploys gated behind staging validation; never
  hand-edit frontend (Lovable-only, per project convention).
- **Secrets** — `WEBHOOK_SHARED_SECRET`, service-role keys, Resend/Retell keys live only in
  Railway/Supabase/Lovable env config, never in the repo.

## Rough cost (starting)

Railway ~$5–20/mo per environment (×2), Supabase free/Pro, Resend free tier, Sentry free tier,
Vercel/Netlify free, UptimeRobot free. **Estimate: ~$15–45/mo** to start, scaling with usage.
