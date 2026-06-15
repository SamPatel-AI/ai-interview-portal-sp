# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Saanvi Interview Portal live for one client with isolated staging/production environments, a safe update workflow, historical data migration, and error monitoring.

**Architecture:** Railway hosts the backend (Express API + in-process BullMQ workers) and Redis, one service per environment. Two Supabase projects (existing prod + new staging). Lovable serves the production frontend from `main`. Updates flow `feature → PR (CI) → staging → main → prod`.

**Tech Stack:** Express/TypeScript, BullMQ/Redis, Supabase/Postgres, Railway, Lovable, Resend (email), Sentry (errors), GitHub Actions (CI).

> **Legend:** `[AGENT]` = Claude does this in-repo now. `[USER]` = you do this (external accounts/dashboards — Claude cannot create accounts or provision cloud resources).

---

## File structure (new/changed artifacts)

- Create: `.github/workflows/ci.yml` — runs `make validate` on PRs.
- Create: `backend/railway.json` — Railway build/start + healthcheck config.
- Create: `supabase/migrations/007_function_search_path.sql` — advisor hardening.
- Create: `backend/scripts/importCandidates.ts` — one-time CSV → Supabase importer.
- Create: `backend/scripts/importCandidates.test.ts` — test for the row-mapper.
- Modify: `backend/package.json` — add `import:candidates` script.
- Modify: `backend/.env.example` — add Sentry DSN key.
- Modify: `backend/src/index.ts` — Sentry init + error capture (Phase 5).

---

## Phase 0 — Pre-production hardening

### Task 0.1: `[AGENT]` Migration 007 — pin function search_path

**Files:**
- Create: `supabase/migrations/007_function_search_path.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Migration 007: Pin search_path on SECURITY DEFINER / trigger functions
-- Clears the two `function_search_path_mutable` advisor warnings by making the
-- functions immune to search_path hijacking.
-- ============================================================================

ALTER FUNCTION public.get_user_org_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
```

- [ ] **Step 2: Apply to the linked (prod) project**

Run: `supabase db query --linked --file supabase/migrations/007_function_search_path.sql`
Expected: JSON envelope with empty `rows`, no error.

- [ ] **Step 3: Verify advisors no longer flag those functions**

Run: `supabase db advisors --linked --type security --output json | grep -c function_search_path_mutable`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_function_search_path.sql
git commit -m "migration 007: pin function search_path (advisor hardening)"
```

### Task 0.2: `[USER]` Merge PR #2

- [ ] Merge PR #2 (remove manual candidate creation, backend) via GitHub or `gh pr merge 2 --merge`.
- [ ] Tell Claude when done so it can sync local `main`.

### Task 0.3: `[USER]` Resend account for production email

- [ ] Create a Resend account (resend.com), verify your sending domain.
- [ ] Generate an API key. Hold these for Phase 1 env config:
  - `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`,
    `SMTP_USER=resend`, `SMTP_PASS=<api key>`, `SMTP_FROM=<verified sender>`.

---

## Phase 1 — Provision environments

### Task 1.1: `[USER]` Create the staging Supabase project

- [ ] In the Supabase dashboard, create a new project (e.g., "Job Dashboard — Staging").
- [ ] Copy its `URL`, `anon key`, `service_role key`, and JWT secret.
- [ ] Tell Claude the project ref; Claude will run migrations 001–007 against it
      (`supabase link --project-ref <staging-ref> --yes` then apply each migration file
      via `supabase db query --linked --file ...`, then re-link prod).

### Task 1.2: `[AGENT]` Railway deploy config

**Files:**
- Create: `backend/railway.json`

- [ ] **Step 1: Write the config**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 2: Verify the start path exists**

Run: `cd backend && npm run build && ls dist/index.js`
Expected: `dist/index.js` exists (start command is `node dist/index.js`).

- [ ] **Step 3: Commit**

```bash
git add backend/railway.json
git commit -m "chore: add Railway deploy config for backend"
```

### Task 1.3: `[USER]` Provision Railway (prod + staging)

- [ ] Create a Railway project. Add a **Redis** plugin (prod).
- [ ] Add a service from the GitHub repo, **root directory = `backend`**, branch = `main`.
- [ ] Set env vars from `backend/.env.example` using the **prod** Supabase keys,
      `REDIS_URL` (Railway provides it), Retell/OpenRouter keys, the Resend SMTP vars,
      `WEBHOOK_SHARED_SECRET` (generate one), `NODE_ENV=production`,
      `FRONTEND_URL=https://ai-interview-portal-sp.lovable.app`.
- [ ] Repeat as a **second environment/service** (branch = `staging`, **staging** Supabase
      keys, its own Redis). Set `FRONTEND_URL` to the staging frontend URL.
- [ ] Note both deployed backend URLs (prod + staging) for the frontend `VITE_API_URL`.

### Task 1.4: `[USER]` Point the frontend at the backend

- [ ] In Lovable (production), set `VITE_API_URL` to the prod Railway URL and `VITE_SUPABASE_ANON_KEY` to the prod anon key. Redeploy.
- [ ] For staging frontend: run locally (`make fe-dev`) with `.env` pointing at the staging
      backend + staging anon key, OR deploy the `staging` branch to Vercel/Netlify with those vars.
- [ ] Verify: open the prod frontend, log in, confirm data loads (network calls hit the Railway URL).

---

## Phase 2 — Release workflow

### Task 2.1: `[AGENT]` GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI
on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main, staging]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install backend deps
        run: cd backend && npm install
      - name: Install frontend deps
        run: cd frontend && npm install
      - name: Type-check + lint
        run: make validate
```

- [ ] **Step 2: Verify `make validate` works locally (proxy for CI)**

Run: `make validate`
Expected: `All checks passed.` with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run make validate on PRs to main/staging"
```

### Task 2.2: `[USER]` Branch protection + staging branch

- [ ] Create the `staging` branch from `main` and push it (Claude can do this:
      `git checkout -b staging main && git push -u origin staging`).
- [ ] In GitHub repo settings → Branches: protect `main` — require PR + require the
      `validate` CI check to pass before merge.
- [ ] Confirm Lovable deploys from `main` (it already does).

---

## Phase 3 — Historical data migration

### Task 3.1: `[USER]` Export the Google Sheet

- [ ] Export each relevant tab to CSV (File → Download → CSV).
- [ ] Share the column headers with Claude (candidate fields + interview/call fields)
      so the importer can map them exactly. Place CSVs in `backend/scripts/data/` (gitignored).

### Task 3.2: `[AGENT]` CSV → Supabase importer

**Files:**
- Create: `backend/scripts/importCandidates.ts`
- Create: `backend/scripts/importCandidates.test.ts`
- Modify: `backend/package.json` (add `import:candidates` script)

> **Note:** Final column mapping depends on Task 3.1 output. This task delivers the
> importer with a `mapRow()` function and an idempotent upsert; the mapping is finalized
> once headers are known.

- [ ] **Step 1: Write the failing test for the row mapper**

```ts
// backend/scripts/importCandidates.test.ts
import { describe, it, expect } from 'vitest';
import { mapRow } from './importCandidates';

describe('mapRow', () => {
  it('maps sheet columns to a candidate insert payload', () => {
    const row = {
      'First Name': 'Jane', 'Last Name': 'Doe',
      'Email': 'jane@example.com', 'Phone': '+1 555-0101', 'Source': 'Email',
    };
    expect(mapRow(row, 'org-123')).toEqual({
      org_id: 'org-123',
      first_name: 'Jane', last_name: 'Doe',
      email: 'jane@example.com', phone: '+1 555-0101', source: 'Email',
    });
  });

  it('returns null when email is missing (skip row)', () => {
    expect(mapRow({ 'First Name': 'NoEmail' }, 'org-123')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run scripts/importCandidates.test.ts`
Expected: FAIL — `mapRow` not exported.

- [ ] **Step 3: Implement the importer**

```ts
// backend/scripts/importCandidates.ts
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

type Row = Record<string, string>;

export function mapRow(row: Row, orgId: string) {
  const email = (row['Email'] ?? '').trim().toLowerCase();
  if (!email) return null;
  return {
    org_id: orgId,
    first_name: (row['First Name'] ?? '').trim(),
    last_name: (row['Last Name'] ?? '').trim(),
    email,
    phone: (row['Phone'] ?? '').trim(),
    source: (row['Source'] ?? 'Import').trim(),
  };
}

async function main() {
  const [csvPath, orgId] = process.argv.slice(2);
  if (!csvPath || !orgId) {
    throw new Error('Usage: tsx scripts/importCandidates.ts <csv-path> <org-id>');
  }
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const rows: Row[] = parse(fs.readFileSync(csvPath), { columns: true, skip_empty_lines: true });
  const payloads = rows.map((r) => mapRow(r, orgId)).filter(Boolean) as object[];

  let ok = 0, skipped = rows.length - payloads.length;
  for (const p of payloads) {
    const { error } = await supabase.from('candidates').upsert(p, { onConflict: 'org_id,email' });
    if (error) { console.error('Row failed:', error.message); } else { ok++; }
  }
  console.log(`Imported/updated: ${ok}, skipped (no email): ${skipped}`);
}

// Only run when invoked directly, not when imported by the test.
if (process.argv[1] && process.argv[1].endsWith('importCandidates.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run scripts/importCandidates.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the npm script**

In `backend/package.json` `scripts`, add:
```json
"import:candidates": "tsx scripts/importCandidates.ts"
```

- [ ] **Step 6: Verify the upsert conflict target exists**

Run: `supabase db query --linked "select 1 from pg_constraint where conname like '%candidates%email%' or conname like '%candidates%org%';"`
Expected: confirm a unique constraint on `(org_id, email)`. If absent, add it in a migration first
(the upsert `onConflict: 'org_id,email'` requires it).

- [ ] **Step 7: Commit**

```bash
git add backend/scripts/importCandidates.ts backend/scripts/importCandidates.test.ts backend/package.json
git commit -m "feat: one-time CSV candidate importer with row-mapper test"
```

### Task 3.3: `[AGENT+USER]` Run the import (dry-run on staging, then prod)

- [ ] Dry-run against **staging** first: `cd backend && npm run import:candidates -- scripts/data/candidates.csv <staging-org-id>` (with staging env loaded). Verify counts.
- [ ] Spot-check 5 records in the Supabase table editor.
- [ ] Run against **prod** with prod env + prod org id. Re-run once to confirm no duplicates (idempotent).

---

## Phase 4 — Intake (launch via n8n)

### Task 4.1: `[USER]` Re-point n8n at the new webhook

- [ ] In n8n, change the final HTTP node to POST to
      `https://<prod-railway-url>/api/webhooks/candidate-intake`.
- [ ] Add header `x-webhook-secret: <WEBHOOK_SHARED_SECRET>` (same value set in Railway).
- [ ] Ensure the body includes at least `email` and `org_id`, plus any of
      `first_name,last_name,phone,location,work_authorization,source,job_code,job_id,resume_url,resume_text`.

- [ ] **Verify end-to-end:** trigger a test submission → confirm a candidate + application
      appear in prod with AI screening triggered. Check Railway logs for `Candidate intake: ...`.

---

## Phase 5 — Monitoring & feedback

### Task 5.1: `[USER]` Create Sentry projects

- [ ] Create Sentry projects for backend (Node) and frontend (React). Copy both DSNs.
- [ ] Set `SENTRY_DSN` in Railway (both envs) and `VITE_SENTRY_DSN` in Lovable.

### Task 5.2: `[AGENT]` Wire Sentry into the backend

**Files:**
- Modify: `backend/.env.example` (add `SENTRY_DSN=`)
- Modify: `backend/src/config/env.ts` (add optional `SENTRY_DSN`)
- Modify: `backend/src/index.ts` (init + capture)

- [ ] **Step 1:** Add `SENTRY_DSN=` to `backend/.env.example` and `SENTRY_DSN: z.string().optional()` to the env schema.
- [ ] **Step 2:** Install: `cd backend && npm install @sentry/node`.
- [ ] **Step 3:** In `backend/src/index.ts`, init Sentry at the top (guarded by `env.SENTRY_DSN`) and ensure the global `errorHandler` captures exceptions:

```ts
import * as Sentry from '@sentry/node';
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
```
In `errorHandler`, call `Sentry.captureException(err)` for non-operational errors.

- [ ] **Step 4: Verify build:** `cd backend && npm run build` → no type errors.
- [ ] **Step 5: Commit:** `git commit -am "feat: Sentry error capture (backend)"`

> Frontend Sentry is added via a Lovable prompt (Claude will write it), since frontend is Lovable-owned.

### Task 5.3: `[USER]` Uptime + reporting channel

- [ ] Add an UptimeRobot (or similar) monitor on `https://<prod-railway-url>/health`.
- [ ] Decide the client's error-reporting channel (email/Slack/Linear) and document it.

---

## Phase 6 — Soft launch

### Task 6.1: `[USER+AGENT]` Smoke test on staging

- [ ] Walk every core flow on staging: intake (n8n→webhook), screening, call scheduling,
      evaluation, analytics, re-engagement, candidate/application detail sheets.
- [ ] Fix issues via the Phase 2 workflow (feature → PR → staging → main).

### Task 6.2: `[USER]` Production pilot

- [ ] Run a limited pilot with real candidates/jobs. Monitor Sentry + Railway logs daily.
- [ ] Get client sign-off to widen usage.

---

## Deferred (post-launch) — native email intake

Build the inbound-email receiver to retire n8n (MS Graph poller recommended; reuses
`MS_GRAPH_*`). New `emailIntake.job.ts` + `emailParser.service.ts` (OpenRouter extraction) +
attachment → Supabase Storage → existing intake pipeline. ~2–4 days. Planned separately when reached.

---

## What Claude can do immediately (no accounts needed)

Tasks 0.1, 1.2, 2.1, 3.2, and the `staging` branch — these are committed in-repo now and
become one PR. Everything marked `[USER]` waits on you (Railway/Supabase/Resend/Sentry accounts,
the Google Sheet, n8n config, GitHub branch protection).
