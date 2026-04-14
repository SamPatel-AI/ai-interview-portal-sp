# Interview Portal — Project Restructuring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Interview Portal from a flat file structure into a domain-driven, AI-agent-friendly codebase following Atomic Design (components) and domain modules (data/logic).

**Architecture:** Frontend pages become thin orchestrators that delegate to domain hooks (data fetching/caching), domain services (API calls), and organized components (Atomic Design levels). Backend is already well-structured — it gets minor cleanup only: a Makefile, constants extraction, and documentation.

**Tech Stack:** React 18, TypeScript, Vite, TanStack React Query, Shadcn/UI, Express, Supabase, BullMQ

---

## File Map — What Changes

### Frontend New Structure

```
frontend/src/
├── components/
│   ├── atoms/              # <50 LOC, no state — Badge wrappers, StatusDot, etc.
│   ├── molecules/          # 50-150 LOC, local UI state — EmptyState, SearchBar, PageHeader
│   ├── organisms/          # 150-500 LOC, data-aware
│   │   ├── applications/   # ApplicationDetailSheet, ApplicationKanban, ApplicationTable
│   │   ├── calls/          # CallDetailSheet, CallPlayer, CallTranscript
│   │   ├── candidates/     # CandidateDetailSheet, AddCandidateDialog
│   │   ├── jobs/           # JobDetailSheet, CreateJobDialog, StageConfigurator
│   │   ├── companies/      # CompanyDetailSheet, CreateCompanyDialog
│   │   ├── agents/         # AgentBuilder
│   │   └── settings/       # TeamManagement, SchedulingSettings
│   ├── templates/          # DashboardLayout
│   └── ui/                 # Shadcn primitives (unchanged)
├── contexts/               # AuthContext (unchanged)
├── domains/
│   ├── applications/
│   │   ├── hooks/
│   │   │   ├── useApplications.ts
│   │   │   ├── useApplicationActions.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── applications.service.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── candidates/
│   │   ├── hooks/
│   │   │   ├── useCandidates.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── candidates.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── jobs/
│   │   ├── hooks/
│   │   │   ├── useJobs.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── jobs.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── calls/
│   │   ├── hooks/
│   │   │   ├── useCalls.ts
│   │   │   ├── useCallActions.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── calls.service.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── agents/
│   │   ├── hooks/
│   │   │   ├── useAgents.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── agents.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── companies/
│   │   ├── hooks/
│   │   │   ├── useCompanies.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── companies.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── emails/
│   │   ├── hooks/
│   │   │   ├── useEmails.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── emails.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── analytics/
│   │   ├── hooks/
│   │   │   ├── useAnalytics.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── analytics.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── activity/
│   │   ├── hooks/
│   │   │   ├── useActivity.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── activity.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   ├── settings/
│   │   ├── hooks/
│   │   │   ├── useTeam.ts
│   │   │   ├── useScheduling.ts
│   │   │   └── queryKeys.ts
│   │   ├── services/
│   │   │   └── settings.service.ts
│   │   ├── types.ts
│   │   ├── domain.json
│   │   └── index.ts
│   └── auth/
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   └── queryKeys.ts
│       ├── services/
│       │   └── auth.service.ts
│       ├── types.ts
│       ├── domain.json
│       └── index.ts
├── hooks/                  # Only shared/generic hooks (use-toast, use-mobile)
├── lib/
│   ├── api.ts              # apiRequest, apiUpload (unchanged)
│   ├── supabase.ts         # Supabase client (unchanged)
│   ├── utils.ts            # cn() helper (unchanged)
│   └── constants.ts        # NEW: app-wide constants (cache timing, page sizes, status maps)
├── pages/                  # Thin orchestrators only — data hooks + component composition
└── routes/                 # NEW: centralized route definitions
```

### Backend Cleanup (Minimal)

```
backend/
├── Makefile                # NEW: dev commands
├── src/
│   ├── config/             # (unchanged)
│   ├── middleware/          # (unchanged)
│   ├── routes/             # (unchanged — already domain-separated)
│   ├── services/           # (unchanged)
│   ├── jobs/               # (unchanged)
│   ├── types/              # (unchanged)
│   └── lib/
│       └── constants.ts    # NEW: shared constants (status maps, limits)
```

### Project Root

```
Interview Portal/
├── .agents/
│   └── AGENTS.md           # NEW: AI agent project guide
├── Makefile                 # NEW: root-level dev commands
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
└── scratch/                 # NEW: gitignored temp directory
```

---

## Round 1 — Foundation (No Behavior Change)

### Task 1: Create folder skeleton + Makefile + constants

**Files:**
- Create: `Makefile`
- Create: `frontend/src/lib/constants.ts`
- Create: `frontend/src/routes/index.ts`
- Create: `scratch/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Create root Makefile**

```makefile
# Interview Portal — Development Commands

# ─── Setup ──────────────────────────────────────────────────
setup:
	cd frontend && npm install
	cd backend && npm install

# ─── Development ────────────────────────────────────────────
up:
	@echo "Starting backend on :3001 and frontend on :8082..."
	cd backend && npm run dev &
	cd frontend && npm run dev &

down:
	@lsof -ti :3001 | xargs kill -9 2>/dev/null || true
	@lsof -ti :8082 | xargs kill -9 2>/dev/null || true
	@echo "Servers stopped."

# ─── Code Quality ───────────────────────────────────────────
validate: type-check lint test
	@echo "All checks passed."

type-check:
	cd frontend && npx tsc --noEmit
	cd backend && npx tsc --noEmit

lint:
	cd frontend && npm run lint

test:
	cd frontend && npm run test -- --run 2>/dev/null || true

build:
	cd frontend && npm run build
	cd backend && npm run build

# ─── Database ───────────────────────────────────────────────
seed:
	cd backend && npx tsx src/seed.ts

# ─── Shortcuts ──────────────────────────────────────────────
fe-dev:
	cd frontend && npm run dev

be-dev:
	cd backend && npm run dev

.PHONY: setup up down validate type-check lint test build seed fe-dev be-dev
```

- [ ] **Step 2: Create frontend constants**

```typescript
// frontend/src/lib/constants.ts

// ─── Cache Timing (React Query staleTime) ──────────────────
export const STALE = {
  FAST: 30 * 1000,         // 30s — dashboard stats, activity feed
  MEDIUM: 5 * 60 * 1000,   // 5m — lists (candidates, jobs, applications)
  LONG: 15 * 60 * 1000,    // 15m — rarely changing (agents, companies)
  STATIC: 60 * 60 * 1000,  // 1h — reference data (voices, filter options)
} as const;

// ─── Page Sizes ────────────────────────────────────────────
export const PAGE_SIZE = {
  SM: 10,
  MD: 20,
  LG: 50,
  XL: 100,
} as const;

// ─── Status Color Maps ────────────────────────────────────
export const APPLICATION_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600',
  screening: 'bg-yellow-500/10 text-yellow-600',
  interviewed: 'bg-purple-500/10 text-purple-600',
  shortlisted: 'bg-green-500/10 text-green-600',
  rejected: 'bg-destructive/10 text-destructive',
  hired: 'bg-emerald-500/10 text-emerald-600',
};

export const CALL_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600',
  scheduled: 'bg-blue-500/10 text-blue-600',
  in_progress: 'bg-yellow-500/10 text-yellow-600',
  failed: 'bg-destructive/10 text-destructive',
  no_answer: 'bg-muted text-muted-foreground',
  voicemail: 'bg-muted text-muted-foreground',
  interrupted: 'bg-orange-500/10 text-orange-600',
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-500/10 text-green-600',
  closed: 'bg-muted text-muted-foreground',
  on_hold: 'bg-yellow-500/10 text-yellow-600',
  filled: 'bg-blue-500/10 text-blue-600',
};

export const EMAIL_TYPE_COLORS: Record<string, string> = {
  invitation: 'bg-primary/10 text-primary',
  follow_up: 'bg-blue-500/10 text-blue-600',
  rejection: 'bg-destructive/10 text-destructive',
  custom: 'bg-muted text-muted-foreground',
};

export const EMAIL_STATUS_COLORS: Record<string, string> = {
  sent: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  bounced: 'bg-yellow-500/10 text-yellow-600',
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600',
  high: 'bg-orange-500/10 text-orange-600',
  normal: 'bg-blue-500/10 text-blue-600',
  low: 'bg-muted text-muted-foreground',
};

// ─── Status Labels ─────────────────────────────────────────
export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  interviewed: 'Interviewed',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
  hired: 'Hired',
};

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  invitation: 'Invitation',
  follow_up: 'Follow-up',
  rejection: 'Rejection',
  custom: 'Custom',
};
```

- [ ] **Step 3: Create route definitions**

```typescript
// frontend/src/routes/index.ts

export const ROUTES = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  DASHBOARD: '/dashboard',
  CANDIDATES: '/candidates',
  JOBS: '/jobs',
  APPLICATIONS: '/applications',
  AGENTS: '/agents',
  CALLS: '/calls',
  COMPANIES: '/companies',
  EMAILS: '/emails',
  ANALYTICS: '/analytics',
  ACTIVITY: '/activity',
  SETTINGS: '/settings',
} as const;
```

- [ ] **Step 4: Create scratch directory and update .gitignore**

Add to `.gitignore`:
```
scratch/
```

Create `scratch/.gitkeep` (empty file).

- [ ] **Step 5: Verify and commit**

```bash
make validate
git add -A && git commit -m "chore: add Makefile, constants, route definitions, scratch directory"
```

---

### Task 2: Create domain folder skeleton with domain.json and barrel exports

**Files:**
- Create: 12 domain directories with `domain.json` and `index.ts` each

- [ ] **Step 1: Create all domain directories**

```bash
for domain in auth candidates jobs applications calls agents companies emails analytics activity settings; do
  mkdir -p frontend/src/domains/$domain/{hooks,services}
done
```

- [ ] **Step 2: Create domain.json for each domain**

Priority hierarchy (lower = more foundational):
- auth: 1
- candidates: 5
- jobs: 6
- applications: 7
- calls: 8
- agents: 9
- companies: 10
- emails: 12
- analytics: 15
- activity: 16
- settings: 20

Each `domain.json`:

```json
// frontend/src/domains/auth/domain.json
{ "domain": "auth", "displayName": "Authentication", "priority": 1, "dependencies": [], "description": "User authentication and session management", "status": "active" }

// frontend/src/domains/candidates/domain.json
{ "domain": "candidates", "displayName": "Candidates", "priority": 5, "dependencies": ["auth"], "description": "Candidate profiles, resume management, duplicate detection", "status": "active" }

// frontend/src/domains/jobs/domain.json
{ "domain": "jobs", "displayName": "Jobs", "priority": 6, "dependencies": ["auth", "companies", "agents"], "description": "Job postings, CEIPAL sync, interview stages, priority management", "status": "active" }

// frontend/src/domains/applications/domain.json
{ "domain": "applications", "displayName": "Applications", "priority": 7, "dependencies": ["auth", "candidates", "jobs"], "description": "Application pipeline, AI screening, recruiter assignment", "status": "active" }

// frontend/src/domains/calls/domain.json
{ "domain": "calls", "displayName": "Calls", "priority": 8, "dependencies": ["auth", "applications", "agents"], "description": "AI voice interviews, call scheduling, evaluation, resumption", "status": "active" }

// frontend/src/domains/agents/domain.json
{ "domain": "agents", "displayName": "AI Agents", "priority": 9, "dependencies": ["auth", "companies"], "description": "AI interviewing agent configuration and management", "status": "active" }

// frontend/src/domains/companies/domain.json
{ "domain": "companies", "displayName": "Companies", "priority": 10, "dependencies": ["auth"], "description": "Client company management", "status": "active" }

// frontend/src/domains/emails/domain.json
{ "domain": "emails", "displayName": "Emails", "priority": 12, "dependencies": ["auth", "candidates", "applications"], "description": "Email log viewing and tracking", "status": "active" }

// frontend/src/domains/analytics/domain.json
{ "domain": "analytics", "displayName": "Analytics", "priority": 15, "dependencies": ["auth"], "description": "Dashboard KPIs, recruiter/agent/job performance analytics", "status": "active" }

// frontend/src/domains/activity/domain.json
{ "domain": "activity", "displayName": "Activity Log", "priority": 16, "dependencies": ["auth"], "description": "Audit trail of all user and system actions", "status": "active" }

// frontend/src/domains/settings/domain.json
{ "domain": "settings", "displayName": "Settings", "priority": 20, "dependencies": ["auth"], "description": "Organization settings, team management, scheduling config", "status": "active" }
```

- [ ] **Step 3: Create empty barrel exports**

Each `index.ts` starts empty — filled as hooks/services are created:

```typescript
// frontend/src/domains/{domain}/index.ts
// Barrel export for {domain} domain — populated as hooks/services are added
export {};
```

- [ ] **Step 4: Verify and commit**

```bash
make type-check
git add -A && git commit -m "chore: create domain folder skeleton with domain.json metadata"
```

---

### Task 3: Create component directory structure (Atomic Design)

**Files:**
- Create: `frontend/src/components/atoms/`, `molecules/`, `organisms/{domain}/`, `templates/`

- [ ] **Step 1: Create atomic design directories**

```bash
mkdir -p frontend/src/components/{atoms,molecules,templates}
for domain in applications calls candidates jobs companies agents settings; do
  mkdir -p frontend/src/components/organisms/$domain
done
```

- [ ] **Step 2: Move DashboardLayout to templates**

Move `frontend/src/components/DashboardLayout.tsx` → `frontend/src/components/templates/DashboardLayout.tsx`

Update import in `App.tsx`:
```typescript
// Change:
import DashboardLayout from "@/components/DashboardLayout";
// To:
import DashboardLayout from "@/components/templates/DashboardLayout";
```

- [ ] **Step 3: Move EmptyState to molecules**

Move `frontend/src/components/EmptyState.tsx` → `frontend/src/components/molecules/EmptyState.tsx`

Update all imports (10 files import EmptyState):
```typescript
// Change in all files:
import EmptyState from '@/components/EmptyState';
// To:
import EmptyState from '@/components/molecules/EmptyState';
```

- [ ] **Step 4: Move PageSkeleton to molecules**

Move `frontend/src/components/PageSkeleton.tsx` → `frontend/src/components/molecules/PageSkeleton.tsx`

Update imports.

- [ ] **Step 5: Move NavLink to atoms**

Move `frontend/src/components/NavLink.tsx` → `frontend/src/components/atoms/NavLink.tsx`

Update import in AppSidebar.tsx:
```typescript
import { NavLink } from '@/components/atoms/NavLink';
```

- [ ] **Step 6: Move detail sheets and dialogs to organisms**

Move files:
- `ApplicationDetailSheet.tsx` → `organisms/applications/ApplicationDetailSheet.tsx`
- `CallDetailSheet.tsx` → `organisms/calls/CallDetailSheet.tsx`
- `CandidateDetailSheet.tsx` → `organisms/candidates/CandidateDetailSheet.tsx`
- `JobDetailSheet.tsx` → `organisms/jobs/JobDetailSheet.tsx`
- `CompanyDetailSheet.tsx` → `organisms/companies/CompanyDetailSheet.tsx`
- `CreateJobDialog.tsx` → `organisms/jobs/CreateJobDialog.tsx`
- `CreateCompanyDialog.tsx` → `organisms/companies/CreateCompanyDialog.tsx`
- `AgentBuilder.tsx` → `organisms/agents/AgentBuilder.tsx`

Update all imports in pages that reference these components.

- [ ] **Step 7: Move ProtectedRoute and ErrorBoundary to molecules**

Move `ProtectedRoute.tsx` → `molecules/ProtectedRoute.tsx`
Move `ErrorBoundary.tsx` → `molecules/ErrorBoundary.tsx`

Update imports in App.tsx:
```typescript
import ProtectedRoute from "@/components/molecules/ProtectedRoute";
import ErrorBoundary from "@/components/molecules/ErrorBoundary";
```

- [ ] **Step 8: Verify and commit**

```bash
make validate
git add -A && git commit -m "refactor: organize components into Atomic Design structure"
```

---

## Round 2 — Domain Services and Hooks (Extract Data Layer)

### Task 4: Create the candidates domain (lowest risk, simplest)

**Files:**
- Create: `frontend/src/domains/candidates/types.ts`
- Create: `frontend/src/domains/candidates/services/candidates.service.ts`
- Create: `frontend/src/domains/candidates/hooks/queryKeys.ts`
- Create: `frontend/src/domains/candidates/hooks/useCandidates.ts`
- Modify: `frontend/src/domains/candidates/index.ts`
- Modify: `frontend/src/pages/Candidates.tsx` — thin out

- [ ] **Step 1: Create types**

```typescript
// frontend/src/domains/candidates/types.ts
export interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  work_authorization: string | null;
  resume_url: string | null;
  resume_text: string | null;
  source: string | null;
  flags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  applications_count?: number;
}

export interface CandidateDetail extends Candidate {
  applications: Array<{
    id: string;
    job_id: string;
    status: string;
    ai_screening_score: number | null;
    created_at: string;
    jobs: { id: string; title: string; client_company_id: string; status: string };
  }>;
  calls: Array<{
    id: string;
    direction: string;
    status: string;
    duration_seconds: number | null;
    started_at: string | null;
    recording_url: string | null;
  }>;
}

export interface CreateCandidateInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  work_authorization?: string;
  source?: string;
}
```

- [ ] **Step 2: Create service**

```typescript
// frontend/src/domains/candidates/services/candidates.service.ts
import { apiRequest, apiUpload, ApiResponse } from '@/lib/api';
import type { Candidate, CandidateDetail, CreateCandidateInput } from '../types';

export async function fetchCandidates(params: {
  page?: number;
  limit?: number;
  search?: string;
  source?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.source) qs.set('source', params.source);
  return apiRequest<ApiResponse<Candidate[]>>(`/api/candidates?${qs}`);
}

export async function fetchCandidate(id: string) {
  return apiRequest<ApiResponse<CandidateDetail>>(`/api/candidates/${id}`);
}

export async function createCandidate(input: CreateCandidateInput) {
  return apiRequest<ApiResponse<Candidate>>('/api/candidates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCandidate(id: string, input: Partial<CreateCandidateInput>) {
  return apiRequest<ApiResponse<Candidate>>(`/api/candidates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function uploadResume(candidateId: string, file: File) {
  const formData = new FormData();
  formData.append('resume', file);
  return apiUpload<ApiResponse<{ resume_url: string }>>(`/api/candidates/${candidateId}/resume`, formData);
}

export async function checkDuplicates(input: { email?: string; first_name?: string; last_name?: string; phone?: string }) {
  return apiRequest<ApiResponse<{ duplicates_found: number; matches: unknown[] }>>('/api/candidates/check-duplicates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 3: Create query keys**

```typescript
// frontend/src/domains/candidates/hooks/queryKeys.ts
export const candidateKeys = {
  all: ['candidates'] as const,
  lists: () => [...candidateKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...candidateKeys.lists(), filters] as const,
  details: () => [...candidateKeys.all, 'detail'] as const,
  detail: (id: string) => [...candidateKeys.details(), id] as const,
};
```

- [ ] **Step 4: Create hooks**

```typescript
// frontend/src/domains/candidates/hooks/useCandidates.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { candidateKeys } from './queryKeys';
import * as candidateService from '../services/candidates.service';
import type { CreateCandidateInput } from '../types';
import { STALE, PAGE_SIZE } from '@/lib/constants';

export function useCandidates(params: { page?: number; search?: string; source?: string } = {}) {
  return useQuery({
    queryKey: candidateKeys.list(params),
    queryFn: () => candidateService.fetchCandidates({ ...params, limit: PAGE_SIZE.MD }),
    staleTime: STALE.MEDIUM,
  });
}

export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: candidateKeys.detail(id!),
    queryFn: () => candidateService.fetchCandidate(id!),
    enabled: !!id,
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateCandidateInput) => candidateService.createCandidate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
      toast({ title: 'Candidate created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create candidate', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUploadResume() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ candidateId, file }: { candidateId: string; file: File }) =>
      candidateService.uploadResume(candidateId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
      toast({ title: 'Resume uploaded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });
}
```

- [ ] **Step 5: Update barrel export**

```typescript
// frontend/src/domains/candidates/index.ts
export { useCandidates, useCandidate, useCreateCandidate, useUploadResume } from './hooks/useCandidates';
export { candidateKeys } from './hooks/queryKeys';
export type { Candidate, CandidateDetail, CreateCandidateInput } from './types';
```

- [ ] **Step 6: Refactor Candidates page to use domain hooks**

Replace inline `useQuery`/`useMutation`/`apiRequest` calls in `Candidates.tsx` with:
```typescript
import { useCandidates, useCreateCandidate, useUploadResume } from '@/domains/candidates';
```

Remove all direct `apiRequest` and `apiUpload` imports from the page.

- [ ] **Step 7: Verify and commit**

```bash
make validate
git add -A && git commit -m "refactor: extract candidates domain — types, service, hooks, barrel export"
```

---

### Task 5–13: Repeat Task 4 pattern for remaining domains

Each domain follows the IDENTICAL pattern as Task 4. Create in this order:

- [ ] **Task 5: `auth` domain** — types, service (`/api/auth/*`), hooks (`useAuthMe`), barrel export
- [ ] **Task 6: `companies` domain** — types, service, hooks, refactor Companies page
- [ ] **Task 7: `agents` domain** — types, service, hooks, refactor Agents page
- [ ] **Task 8: `jobs` domain** — types, service (include `/api/jobs/:id/stages`), hooks, refactor Jobs page
- [ ] **Task 9: `applications` domain** — types, service (include screen, approve, assign), hooks, refactor Applications page
- [ ] **Task 10: `calls` domain** — types, service (include outbound, schedule, batch, auto-queue, evaluate), hooks, refactor Calls page
- [ ] **Task 11: `emails` domain** — types, service, hooks, refactor Emails page
- [ ] **Task 12: `analytics` domain** — types, service (overview, recruiter, job, agent, recruiters, export), hooks, refactor Analytics + Dashboard pages
- [ ] **Task 13: `activity` domain** — types, service, hooks, refactor ActivityLog page
- [ ] **Task 14: `settings` domain** — types, service (scheduling, team/users), hooks, refactor Settings page

For each: create types.ts, service, queryKeys, hooks, barrel export, refactor the page to use hooks, verify with `make validate`, commit.

---

### Task 15: Split Settings.tsx into sub-components

Settings.tsx is 515 lines — the largest page. Extract the inline components.

**Files:**
- Create: `frontend/src/components/organisms/settings/TeamManagement.tsx`
- Create: `frontend/src/components/organisms/settings/SchedulingSettings.tsx`
- Modify: `frontend/src/pages/Settings.tsx` — thin to ~80 lines

- [ ] **Step 1: Extract TeamManagement component**

Move the `TeamManagement` function (currently ~100 lines at the bottom of Settings.tsx) into its own file at `organisms/settings/TeamManagement.tsx`. It should import from `@/domains/settings` for hooks.

- [ ] **Step 2: Extract SchedulingSettings component**

Move the `SchedulingSettings` function (~120 lines at the bottom of Settings.tsx) into its own file. It should import from `@/domains/settings` for hooks.

- [ ] **Step 3: Thin out Settings.tsx**

Settings.tsx becomes a thin orchestrator that renders Tabs and delegates to components:
```typescript
import TeamManagement from '@/components/organisms/settings/TeamManagement';
import SchedulingSettings from '@/components/organisms/settings/SchedulingSettings';
```

Target: Settings.tsx under 100 lines.

- [ ] **Step 4: Verify and commit**

```bash
make validate
git add -A && git commit -m "refactor: extract TeamManagement and SchedulingSettings from Settings page"
```

---

## Round 3 — Boundaries (Enforce Rules)

### Task 16: Add ESLint import boundary rules

**Files:**
- Modify: `frontend/eslint.config.js`

- [ ] **Step 1: Add no-restricted-imports rule**

```javascript
// In eslint.config.js, add to the rules:
'no-restricted-imports': ['error', {
  patterns: [
    // Enforce barrel imports for domains
    { group: ['@/domains/*/hooks/*'], message: 'Import from @/domains/{name} barrel export instead.' },
    { group: ['@/domains/*/services/*'], message: 'Import from @/domains/{name} barrel export instead.' },
    { group: ['@/domains/*/types*'], message: 'Import from @/domains/{name} barrel export instead.' },
  ],
}],
```

- [ ] **Step 2: Fix any violations**

Run `npm run lint` and fix any violations.

- [ ] **Step 3: Verify and commit**

```bash
make validate
git add -A && git commit -m "chore: add ESLint import boundary rules for domain barrel exports"
```

---

## Round 4 — Documentation

### Task 17: Write AGENTS.md

**Files:**
- Create: `.agents/AGENTS.md`

- [ ] **Step 1: Write the project guide**

```markdown
# Saanvi Interview Portal — AI Agent Guide

## Common Development Commands
- `make setup` — Install all dependencies
- `make up` — Start frontend (:8082) + backend (:3001)
- `make validate` — Type-check + lint + test (run before every push)
- `make build` — Production build
- `make seed` — Seed demo data (sahil@saanvi.us / Test@1234)

## Prerequisites
- Node.js 20+
- Redis running on localhost:6379 (for BullMQ job queue)
- Supabase project provisioned

## High-Level Architecture

**Frontend:** React 18 + Vite + TanStack React Query + Shadcn/UI + Tailwind CSS
**Backend:** Express + TypeScript + Supabase (service role) + BullMQ + Redis
**Database:** Supabase (PostgreSQL with RLS)
**External:** Retell AI (voice), CEIPAL (ATS sync), OpenRouter (AI screening), Cal.com (booking)

## Code Organization

### Frontend — Domain-Driven + Atomic Design

Data flow: **Page → Hook → Service → API**

- `src/domains/{name}/` — Feature modules. Each has: types, services (API calls), hooks (React Query wrappers), barrel export
- `src/components/atoms/` — <50 LOC, no state, pure display
- `src/components/molecules/` — 50-150 LOC, local UI state
- `src/components/organisms/{domain}/` — 150-500 LOC, data-aware, domain-grouped
- `src/components/templates/` — Layout shells
- `src/components/ui/` — Shadcn primitives (do NOT edit these)
- `src/pages/` — Thin orchestrators. Import hooks from domains, compose components. Should stay under 150 LOC.
- `src/lib/constants.ts` — All color maps, cache timing, page sizes. No magic values in components.

### Backend — Route/Service/Job separation

- `src/routes/` — Express routes, validation (Zod), auth middleware
- `src/services/` — Business logic, external API calls
- `src/jobs/` — BullMQ background jobs
- `src/middleware/` — Auth, error handling, rate limiting

## Key Rules

1. **Import from barrel exports only:** `import { useCandidates } from '@/domains/candidates'` — never from `@/domains/candidates/hooks/useCandidates`
2. **Pages don't fetch data:** All `useQuery`/`useMutation` calls live in domain hooks, not pages
3. **Services are the only API layer:** Components and hooks never call `apiRequest` directly
4. **Multi-tenancy:** Every backend query is scoped by `req.user.org_id`
5. **Backend uses supabaseAdmin:** Service role client, bypasses RLS. All org scoping is manual.
6. **ai_screening_score can be number or JSONB:** Frontend must handle both formats

## Domain Priority (lower = more foundational)
auth(1) → candidates(5) → jobs(6) → applications(7) → calls(8) → agents(9) → companies(10) → emails(12) → analytics(15) → activity(16) → settings(20)

Lower-priority domains CAN import higher-priority. Never the reverse.

## Common Pitfalls
- Don't edit files in `src/components/ui/` — these are Shadcn-generated
- Redis must be running for backend to start (BullMQ connection)
- Supabase URL is hardcoded in `frontend/src/lib/supabase.ts`
- The `FRONTEND_URL` env var accepts comma-separated origins for CORS
- Webhooks mount BEFORE the JSON parser — they use `express.raw()`
```

- [ ] **Step 2: Verify and commit**

```bash
git add -A && git commit -m "docs: add AGENTS.md project guide for AI agents and developers"
```

---

### Task 18: Update CLAUDE.md with new structure

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add restructured architecture section**

Add the domain system, atomic design, and data flow rules to the existing CLAUDE.md. Reference `.agents/AGENTS.md` for the full guide.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: update CLAUDE.md with restructured architecture"
```

---

## Execution Summary

| Round | Tasks | What Changes | Risk |
|-------|-------|-------------|------|
| 1 — Foundation | 1-3 | Folders, Makefile, constants, component moves | Zero — no logic changes |
| 2 — Layering | 4-15 | Extract services/hooks/types per domain, thin pages | Low — just moving code |
| 3 — Boundaries | 16 | ESLint import rules | Zero — lint rule only |
| 4 — Documentation | 17-18 | AGENTS.md, CLAUDE.md update | Zero — docs only |

**Total: 18 tasks. Each task ends with `make validate` + commit.**

**Validation command between every task:** `make validate` (type-check + lint + test)
