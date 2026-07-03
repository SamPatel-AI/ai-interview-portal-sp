# Saanvi Interview Portal

A multi-tenant AI recruitment platform: it ingests candidates from the CEIPAL
ATS, screens their resumes with AI, conducts first-round voice interviews with
AI agents (Retell), and gives recruiters a pipeline board to review, shortlist,
and hire — with transcripts and AI evaluations attached to every interview.

## How it works

1. **Intake** — A background poller reads CEIPAL notification emails from the
   recruiting inbox (Microsoft Graph) every 5 minutes, parses the candidate +
   job, and creates the application. A signed webhook
   (`POST /api/webhooks/candidate-intake`) accepts direct pushes.
2. **AI screening** — Each resume is scored against the job description
   (OpenRouter / GPT-4o-mini); the result includes a 0–10 score, strengths /
   risks, and tailored interview questions.
3. **Invitation** — Always manual: a recruiter approves, a booking deadline is
   enforced, and the candidate gets a Cal.com scheduling link.
4. **AI interview** — The booking webhook schedules the call; a poller dials it
   through Retell at the booked time. Named voice personas (Grace — general,
   Adrian — technical, Brian — formal) run the interview with the candidate's
   resume and the job's questions in context. No-answers auto-redial (max 3);
   interrupted calls resume where they left off.
5. **Review** — The post-call webhook stores the transcript, analysis, and
   sentiment. The pipeline board renders each application's backend-computed
   `pipeline_stage`; recruiters shortlist or reject from there.
6. **Re-engagement** (optional, off by default) — matches passive candidates to
   stale jobs via full-text search and emails high scorers, with a working
   unsubscribe link and per-candidate opt-out.

## Architecture

| Piece | Tech | Deploys |
|---|---|---|
| `frontend/` | React + Vite + TypeScript, Tailwind, shadcn/ui, React Query | Lovable (auto from `main`) |
| `backend/` | Express + TypeScript, BullMQ/Redis job queues | Railway (auto from `main`) |
| Database | Supabase Postgres (17+ tables, RLS org-scoped) + Storage (resumes) | Supabase cloud |
| Voice | Retell AI (agents + LLM objects synced from the portal's agent builder) | — |
| Email | Microsoft Graph (send + inbox poll) | — |

Multi-tenancy: every table carries `org_id`; every backend query filters by the
authenticated user's org. Auth is Supabase (JWT), invite-only — admins add
team members from Settings → Team.

## Local development

Prereqs: Node 20+, Redis running locally, a Supabase project, the env files.

```bash
make setup      # install deps
make up         # frontend :8082 + backend :3001
make validate   # typecheck + lint (CI runs these + tests on every PR)
cd backend && npm test
```

Configuration: copy `backend/.env.example` → `backend/.env` and fill it in
(each variable is documented in the example file). The frontend needs
`frontend/.env` with `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL`.

Database migrations live in `supabase/migrations/` and apply with
`supabase db push --linked`.

## Operations

- Health: `GET /health` (liveness) and `GET /health/ready` (checks Postgres +
  Redis).
- Deploys: merge to `main` → Railway (backend) and Lovable (frontend) deploy
  automatically. CI (typecheck + lint + tests + build) gates every PR.
- Graceful shutdown, fail-closed webhook auth, and per-IP rate limiting are
  built in.
- Runbooks (ops scripts, purges, agent re-sync, key rotation):
  `docs/audits/2026-07-02-production-readiness-audit.md` and `scripts/ops/`.

## Repository map

```
backend/src/
  routes/       HTTP API (one file per resource; webhooks mounted raw-body)
  services/     External integrations (CEIPAL, Retell, Graph, Cal.com, OpenRouter)
  jobs/         BullMQ queues + workers (calls, emails, syncs, re-engagement)
  middleware/   auth (JWT + roles), webhook signatures, rate limiting
  utils/        pipeline-stage derivation, prompt compiler, phone, opt-out tokens
frontend/src/
  domains/      per-feature types + API services + React Query hooks
  components/   atomic design (atoms/molecules/organisms/templates)
  pages/        thin route-level orchestrators
supabase/migrations/   schema, RLS policies, storage rules
docs/          audits, specs, Lovable prompts, feature roadmap
scripts/ops/   operational scripts (see the audit doc for when to use them)
```
