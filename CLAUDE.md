# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Saanvi Interview Portal — a multi-tenant AI recruitment platform that automates candidate screening via voice interviews (Retell AI), syncs jobs from CEIPAL ATS, and manages the full hiring pipeline. Built as a separate frontend/backend architecture with a shared Supabase database.

## Development Commands

Use the root `Makefile` for common operations:
```bash
make setup           # Install all dependencies
make up              # Start frontend (:8082) + backend (:3001)
make down            # Stop both servers
make validate        # Type-check + lint (run before every push)
make build           # Production build
make seed            # Seed demo data (sahil@saanvi.us / Test@1234)
```

Or run individual servers:
```bash
make fe-dev          # Frontend only (Vite on :8082)
make be-dev          # Backend only (tsx watch on :3001)
```

Run frontend unit tests (Vitest + jsdom):
```bash
cd frontend && npx vitest            # watch mode
cd frontend && npx vitest run        # single pass (CI)
cd frontend && npx vitest run src/path/to/file.test.ts  # single file
```

### Prerequisites
- Redis must be running locally (`redis://localhost:6379`) for BullMQ job queue
- Supabase project must be provisioned; schema in `supabase/migrations/`

## Architecture

### Frontend — Domain-Driven + Atomic Design

**Data flow rule:** `Page → Hook → Service → API` (never skip a layer, never go backwards)

- **Domains** (`src/domains/{name}/`): Each feature area has `types.ts`, `services/` (API calls), `hooks/` (React Query wrappers), `domain.json`, and a barrel `index.ts`. Always import from the barrel: `import { useCandidates } from '@/domains/candidates'`. Never import hooks or services directly from their sub-paths.
- **Components** (Atomic Design):
  - `atoms/` — <50 LOC, no state (NavLink)
  - `molecules/` — 50-150 LOC, local UI state (EmptyState, ErrorBoundary)
  - `organisms/{domain}/` — 150-500 LOC, data-aware (detail sheets, builders, dialogs)
  - `templates/` — Layout shells (DashboardLayout)
  - `ui/` — Shadcn primitives (**do not edit**)
- **Pages** (`src/pages/`): Thin orchestrators. Import hooks from domains, compose components. Target <150 LOC.
- **Constants** (`src/lib/constants.ts`): All cache timing (`STALE.*`), page sizes (`PAGE_SIZE.*`), status color maps, labels. No magic values in components.
- **Auth**: Supabase JS SDK via `AuthContext.tsx`. JWT auto-attached by `lib/api.ts`.
- **Routing**: React Router v6. Path constants in `src/routes/index.ts`.
- **ESLint**: Import boundary rules enforce barrel-only imports from domains.

### Backend (Express + TypeScript)
- **Entry**: `src/index.ts` — helmet → CORS (multi-origin from comma-separated `FRONTEND_URL`) → webhooks with raw body → JSON parser → morgan → rate limiter → routes → error handler.
- **Auth middleware**: `middleware/auth.ts` — validates JWT via `supabaseAdmin.auth.getUser()`, attaches `req.user` with `{id, email, org_id, role}`. Role-based access via `requireRole()`.
- **Multi-tenancy**: Every query is scoped by `org_id` from `req.user.org_id`. Uses `supabaseAdmin` (service role, bypasses RLS) for server-side operations.
- **Validation**: Zod schemas at route level. `AppError` class for operational errors; global `errorHandler` catches Zod, AppError, and unknown errors.
- **Background jobs**: BullMQ with Redis for call scheduling, email sending, resume processing, CEIPAL sync.
- **External services**: Retell AI (voice calls), CEIPAL (ATS job sync), OpenRouter/GPT-4o-mini (AI screening), Microsoft Graph (Outlook email).

### Database (Supabase/PostgreSQL)
- 17 tables with RLS enabled. Key relations: `organizations` → `users` → `candidates`/`jobs`/`applications` → `calls` → `call_evaluations`. Phase 2 added: `interview_stages`, `candidate_portal_tokens`, `client_users`. Phase 3/4 added: `reengagement_campaigns`, `reengagement_candidates`; plus columns `calls.missed_call_detected_at` and `candidates.resume_tsv` (generated tsvector for FTS) and `candidates.reengagement_opted_out`.
- Migrations run in order: `001_initial.sql` → `002_phase2.sql` → `003_phase3.sql` → `004_reengagement.sql`.
- `ai_agents` links to Retell AI agents. `jobs.ceipal_job_id` links to CEIPAL ATS.
- `ai_screening_score` on applications is stored as JSONB — can be `number` or `{score, explanation}`. Frontend must use a `getScore()` helper to safely extract the numeric value.
- `ai_screening_result` fields like `risk_factor`/`reward_factor` are objects `{score, explanation}`, not strings.

### Webhook Flow
Webhooks (`/api/webhooks/*`) are mounted before the JSON body parser with `express.raw()` for signature verification. Key webhooks:
- `POST /api/webhooks/retell/post-call` — Retell call completed → update call record, schedule callbacks
- `POST /api/webhooks/candidate-intake` — External candidate submission → upsert + auto-screen
- `POST /api/webhooks/cal-booking` — Cal.com booking → schedule outbound call

### Re-engagement Pipeline (Phase 4)
`reengagement.service.ts` + `reengagement.job.ts` + `reengagement.routes.ts` implement bulk candidate re-engagement:
1. Match passive candidates to open jobs via PostgreSQL full-text search on `candidates.resume_tsv` (no API cost).
2. Optionally run `screening-lite.service.ts` (lightweight keyword-based scoring) to rank matches cheaply before spending OpenRouter credits.
3. Send re-engagement emails at rate-limited pace via BullMQ; track per-candidate results in `reengagement_candidates`.
- Candidates with `reengagement_opted_out = true` are excluded at the query level.

## Key Patterns

- **CORS**: Backend accepts comma-separated origins in `FRONTEND_URL` env var. Currently: `http://localhost:8082,https://ai-interview-portal-sp.lovable.app`.
- **Detail sheets**: Clicking a row/card in list pages opens a `Sheet` component (slide-in panel) that fetches detail via `GET /api/{resource}/:id`. Pattern: `JobDetailSheet`, `CompanyDetailSheet`, `ApplicationDetailSheet`, `CandidateDetailSheet`, `CallDetailSheet`.
- **Status transitions**: Application status changes (e.g., → `shortlisted`) trigger side effects like auto-sending invitation emails. These are fire-and-forget with error logging.
- **AI Screening**: `POST /api/applications/:id/screen` calls OpenRouter, stores structured result in `ai_screening_result` (JSONB) and score in `ai_screening_score`.
- **Seed data**: 5 companies (Ford, Toyota, BCBS, Rocket Mortgage, GM), 3 AI agents, 6 jobs, 8 candidates, 9 applications, 2 completed calls with transcripts.

## Environment

Frontend `.env`: `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (defaults to `http://localhost:3001`).

Backend `.env` required keys: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.
Optional/feature-gated: `RETELL_API_KEY`, `RETELL_WEBHOOK_SECRET`, `RETELL_FROM_NUMBER`; `CEIPAL_API_KEY/EMAIL/PASSWORD`; `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`; `MS_GRAPH_CLIENT_ID/SECRET/TENANT_ID/REDIRECT_URI` (Outlook email); `SMTP_HOST/PORT/USER/PASS/FROM`.

Email transport: `EMAIL_TRANSPORT=log` (default, dev-safe — logs to stdout instead of sending) or `EMAIL_TRANSPORT=smtp` (real delivery via SMTP_* vars). Always use `log` in local dev.

Supabase URL is hardcoded in `frontend/src/lib/supabase.ts`.
