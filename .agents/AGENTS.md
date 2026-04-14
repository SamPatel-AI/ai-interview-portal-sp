# Saanvi Interview Portal — AI Agent Guide

## Common Development Commands
- `make setup` — Install all dependencies (frontend + backend)
- `make up` — Start frontend (:8082) + backend (:3001)
- `make down` — Stop both servers
- `make validate` — Type-check + lint (run before every push)
- `make build` — Production build
- `make seed` — Seed demo data (sahil@saanvi.us / Test@1234)
- `make fe-dev` / `make be-dev` — Start individual servers

## Prerequisites
- Node.js 20+
- Redis running on localhost:6379 (for BullMQ job queue)
- Supabase project provisioned (URL hardcoded in frontend/src/lib/supabase.ts)

## High-Level Architecture

**Frontend:** React 18 + Vite + TanStack React Query + Shadcn/UI + Tailwind CSS
**Backend:** Express + TypeScript + Supabase (service role) + BullMQ + Redis
**Database:** Supabase (PostgreSQL with RLS, 15 tables)
**External:** Retell AI (voice interviews), CEIPAL (ATS job sync), OpenRouter/GPT-4o-mini (AI screening), Cal.com (candidate booking), Microsoft Graph (email)

## Code Organization

### Frontend — Domain-Driven + Atomic Design

**Data flow rule:** Page → Hook → Service → API (never skip a layer)

```
src/
├── domains/{name}/        # Feature modules (THE core of structure)
│   ├── hooks/             # React Query hooks (caching, mutations)
│   │   └── queryKeys.ts   # Cache key factory
│   ├── services/          # API calls (ONLY layer that talks to backend)
│   ├── types.ts           # Domain-specific TypeScript interfaces
│   ├── domain.json        # Metadata: priority, dependencies
│   └── index.ts           # Barrel export (REQUIRED, use this for imports)
├── components/
│   ├── atoms/             # <50 LOC, no state, pure display
│   ├── molecules/         # 50-150 LOC, local UI state only
│   ├── organisms/{domain}/ # 150-500 LOC, data-aware, domain-grouped
│   ├── templates/         # Layout shells (DashboardLayout)
│   └── ui/                # Shadcn primitives (DO NOT EDIT)
├── pages/                 # Thin orchestrators (<150 LOC target)
├── contexts/              # AuthContext
├── hooks/                 # Shared hooks only (use-toast, use-mobile)
├── lib/                   # api.ts, supabase.ts, constants.ts, utils.ts
└── routes/                # Route path constants
```

### Domains (priority order — lower imports higher, never reverse)

| Priority | Domain | Description |
|----------|--------|-------------|
| 1 | auth | User authentication and session |
| 5 | candidates | Candidate profiles, resumes, duplicate detection |
| 6 | jobs | Job postings, CEIPAL sync, interview stages, priority |
| 7 | applications | Pipeline, AI screening, recruiter assignment |
| 8 | calls | Voice interviews, scheduling, evaluation, resumption |
| 9 | agents | AI agent configuration (Retell) |
| 10 | companies | Client company management |
| 12 | emails | Email log viewing |
| 15 | analytics | Dashboard KPIs, performance analytics, CSV export |
| 16 | activity | Audit trail |
| 20 | settings | Org settings, team management, scheduling config |

### Backend — Route/Service/Job separation

```
backend/src/
├── routes/        # Express routes + Zod validation + auth middleware
├── services/      # Business logic, external API calls
├── jobs/          # BullMQ background workers
├── middleware/     # Auth (JWT via Supabase), error handling, rate limiting
├── config/        # env, database, redis, retell
└── types/         # Shared TypeScript types
```

## Key Rules

1. **Import from barrel exports only:** `import { useCandidates } from '@/domains/candidates'` — never from internal paths
2. **Pages don't fetch data:** All useQuery/useMutation live in domain hooks
3. **Services are the only API layer:** Components never call apiRequest directly
4. **Multi-tenancy:** Every backend query scoped by req.user.org_id
5. **Backend uses supabaseAdmin:** Service role client, bypasses RLS
6. **ai_screening_score can be number or JSONB:** Frontend must handle both
7. **Don't edit src/components/ui/:** These are Shadcn-generated primitives

## API Patterns

- All responses: `{ success: boolean, data: T, total?: number, page?: number, limit?: number }`
- Auth: JWT via Supabase, attached automatically by lib/api.ts
- Webhooks mount BEFORE JSON parser (express.raw for signature verification)
- CORS: comma-separated origins in FRONTEND_URL env var

## Common Pitfalls
- Redis must be running for backend to start (BullMQ fails on connect)
- Supabase URL is hardcoded in frontend/src/lib/supabase.ts
- Webhooks at /api/webhooks/* use express.raw(), not express.json()
- Call resumption uses parent_call_id FK chain — don't break call relationships
- Application status transitions trigger side effects (emails, etc.)
