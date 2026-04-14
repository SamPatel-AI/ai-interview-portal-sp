# Phase 2 — Implementation Plan

## Status Legend
- **DONE** — Already built and working
- **PARTIAL** — Groundwork exists, needs completion
- **TODO** — Not started, needs full implementation

---

## 1. Features From Your Requirements

### 1.1 Interview Scheduling Restrictions — `PARTIAL`

**What exists:** Calls can be scheduled with a `scheduled_at` timestamp. Cal.com handles slot selection externally.

**What's missing:**
- Business hours configuration per org/company (e.g., 9 AM–5 PM EST)
- Blackout date management (holidays, freeze periods)
- Custom date range windows per job
- Timezone-aware scheduling validation
- Candidate-facing availability display

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `scheduling_config` JSONB column to `organizations` and `jobs` tables | `supabase/migrations/002_phase2.sql` |
| 2 | Create scheduling config schema: `{ business_hours: {start, end, timezone, days[]}, blackout_dates: string[], custom_windows: {start, end}[] }` | `backend/src/schemas/scheduling.ts` |
| 3 | Add `GET/PATCH /api/settings/scheduling` endpoints for org-level config | `backend/src/routes/settings.ts` |
| 4 | Add per-job scheduling override in `PATCH /api/jobs/:id` | `backend/src/routes/jobs.ts` |
| 5 | Add validation middleware that checks scheduling constraints before creating/scheduling any call | `backend/src/middleware/schedulingGuard.ts` |
| 6 | Update `POST /calls/schedule` and `POST /calls/batch` to reject calls outside allowed windows | `backend/src/routes/calls.ts` |
| 7 | Update Cal.com webhook to validate booked time against restrictions | `backend/src/routes/webhooks.ts` |
| 8 | Build scheduling settings UI in Settings page → new "Scheduling" tab | `frontend/src/pages/Settings.tsx` |
| 9 | Build per-job scheduling config in job create/edit forms | `frontend/src/components/CreateJobDialog.tsx` |
| 10 | Show available windows when scheduling calls manually | `frontend/src/pages/Calls.tsx` |

---

### 1.2 Call Resumption — Pick Up Where It Left Off — `DONE`

**What exists:**
- `is_resumption` flag and `parent_call_id` FK on calls table
- `resumeInterruptedCall()` service that creates new call with previous context
- Callback scheduling via `scheduleCallback()` in call retry job
- Retell post-call webhook detects interruptions and auto-schedules callback
- Previous transcript passed in dynamic variables for continuity
- Frontend shows parent/child call chains in call detail sheet
- Retry button for failed/interrupted calls

**Status: Fully implemented.** No further work needed.

---

### 1.3 Calendar Self-Booking (Cal.com Integration) — `DONE`

**What exists:**
- `POST /api/webhooks/cal-booking` receives booking events from Cal.com
- Auto-extracts candidate email from attendees, finds matching application
- Validates AI agent is assigned to the job
- Auto-schedules AI call at the booked time
- Updates application status to 'screening'
- Frontend sends invitation emails with Cal.com scheduling link

**Status: Fully implemented.** Works end-to-end with the scheduling restrictions feature above to limit available slots.

---

## 2. Dashboard & Recruiter Portal

### 2.1 Individual Recruiter Logins — `DONE`

**What exists:**
- Supabase Auth with email/password and Google OAuth
- Role-based access: `admin`, `recruiter`, `viewer` (user_role enum)
- `requireRole()` middleware for backend route protection
- `ProtectedRoute` wrapper on frontend
- `AuthContext` with `signIn`, `signUp`, `signInWithGoogle`, `signOut`

**Status: Fully implemented.**

---

### 2.2 Recruiter Workload Management — `PARTIAL`

**What exists:**
- `GET /api/analytics/recruiter/:id` — shows applications handled, calls completed, avg duration, evaluation breakdown
- `assigned_recruiter_id` on both applications and jobs tables
- Analytics page has "Recruiter Performance" tab

**What's missing:**
- Dedicated workload dashboard showing all recruiters side-by-side
- Recruiter capacity settings (max concurrent applications)
- Auto-assignment / load balancing
- Reassignment functionality

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/analytics/recruiters` endpoint — returns all recruiters with their current load (open applications, scheduled calls, pending evaluations) | `backend/src/routes/analytics.ts` |
| 2 | Add `POST /api/applications/:id/assign` endpoint for reassignment | `backend/src/routes/applications.ts` |
| 3 | Add `max_capacity` column to users table | `supabase/migrations/002_phase2.sql` |
| 4 | Build recruiter workload comparison view — bar chart of load per recruiter | `frontend/src/pages/Analytics.tsx` |
| 5 | Add recruiter reassignment dropdown in application detail sheet | `frontend/src/components/ApplicationDetailSheet.tsx` |

---

### 2.3 Candidate Management Dashboard — `DONE`

**What exists:**
- Full candidate list with search and filters
- Add candidate dialog (name, email, phone, source, resume upload)
- Candidate detail sheet: contact info, work authorization, resume preview, applications list, call history, emails
- Bulk resume upload

**Status: Fully implemented.**

---

### 2.4 Job Management Portal — `DONE`

**What exists:**
- Job CRUD with table view
- Filters by status (open, closed, on_hold, filled)
- CEIPAL sync
- Job detail sheet: all fields, assigned recruiter/agent, application pipeline by status
- Create/edit forms with all fields

**Status: Fully implemented.**

---

### 2.5 Company-Wise AI Agents — `DONE`

**What exists:**
- `client_company_id` FK on `ai_agents` table
- Agent builder with: name, company selection, voice, language, interview style, max duration, evaluation criteria, greeting/closing templates, system prompt
- Company detail sheet shows all assigned agents
- Agents filterable by company

**Status: Fully implemented.**

---

### 2.6 Company-Wise Job Portal — `DONE`

**What exists:**
- `client_company_id` FK on `jobs` table
- Company detail sheet shows all jobs (active + inactive)
- Companies page with grid cards showing job count and agent count

**Status: Fully implemented.**

---

### 2.7 Application Pipeline View — `DONE`

**What exists:**
- Kanban view with 6 stages: New → Screening → Interviewed → Shortlisted → Rejected → Hired
- Table view with AI score, status, date
- Pre-interview actions: Send Invite, Reject
- Post-interview actions: Shortlist, Reject
- AI screening trigger
- Application detail sheet with full screening results, call history, transcript, evaluations

**Status: Fully implemented.**

---

### 2.8 Call Management Console — `DONE`

**What exists:**
- Call list with search and status filters
- Schedule call, batch calls, call now, retry
- Call detail sheet: transcript, recording playback (1x/1.5x/2x), AI analysis, sentiment, cost
- Call resumption chain tracking

**Status: Fully implemented.**

---

### 2.9 Call Evaluation & Decision Making — `DONE`

**What exists:**
- `POST /api/calls/:id/evaluate` endpoint
- Star rating (1–5), notes, decision (advance/reject/callback/hold)
- Evaluation auto-updates application status (advance → shortlisted, reject → rejected)
- Evaluation visible in call detail sheet and application detail sheet

**Status: Fully implemented.**

---

### 2.10 Analytics & Reporting — `PARTIAL`

**What exists:**
- Dashboard KPIs: total candidates, open jobs, total calls, calls today, pending reviews
- Application pipeline visualization
- Top jobs by application volume
- Recruiter performance analytics
- Agent performance analytics (call success rate, sentiment, duration)
- Recharts visualizations (line, bar, pie)

**What's missing:**
- PDF/CSV export of any analytics view
- Scheduled report delivery (email)
- Custom date range filtering on analytics
- Client-ready report generation (see 3.2 below)

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/reports/export` endpoint with `format=csv|pdf` and `type=pipeline|recruiter|agent|calls` query params | `backend/src/routes/reports.ts` |
| 2 | Install `pdfkit` or `puppeteer` for PDF generation | `backend/package.json` |
| 3 | Build CSV serializer for each report type | `backend/src/services/reportGenerator.ts` |
| 4 | Add date range filter component to Analytics page | `frontend/src/pages/Analytics.tsx` |
| 5 | Add export buttons (CSV, PDF) to each analytics tab | `frontend/src/pages/Analytics.tsx` |
| 6 | Add export button to candidate/job/application list pages | Multiple frontend pages |

---

### 2.11 Activity Audit Log — `PARTIAL`

**What exists:**
- `activity_log` table with org_id, user_id, entity_type, entity_id, action, details, timestamp
- Dashboard shows recent activity widget
- Backend logs actions for major operations

**What's missing:**
- Dedicated activity log page with full filtering (by user, entity type, date range, action)
- Pagination for activity log
- Search within activity log

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/activity` endpoint with filters: `user_id`, `entity_type`, `action`, `from`, `to`, pagination | `backend/src/routes/activity.ts` |
| 2 | Build dedicated Activity Log page with filter bar and paginated table | `frontend/src/pages/ActivityLog.tsx` |
| 3 | Add route to React Router | `frontend/src/App.tsx` |
| 4 | Add sidebar navigation item | `frontend/src/components/DashboardLayout.tsx` |

---

### 2.12 Email History — `PARTIAL`

**What exists:**
- `email_logs` table with application_id, candidate_id, type, subject, body, status, sent_at
- Backend email queue with BullMQ, rate limiting, duplicate prevention
- Email templates (invitation, rejection, follow_up) in code
- Frontend has an Emails page but it's a **placeholder only**

**What's missing:**
- Functional email list view with filters
- Email detail view (subject, body, delivery status)
- Per-candidate and per-application email history in detail sheets
- Actually sending emails (Microsoft Graph API integration is stubbed)

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Complete Microsoft Graph API email sending (currently stubbed) | `backend/src/services/emailService.ts` |
| 2 | Add `GET /api/emails` endpoint with filters: `candidate_id`, `application_id`, `type`, `status`, pagination | `backend/src/routes/emails.ts` |
| 3 | Build functional Emails page — table with candidate, type, subject, status, date | `frontend/src/pages/Emails.tsx` |
| 4 | Add email detail sheet or expandable row showing body and delivery status | `frontend/src/components/EmailDetailSheet.tsx` |
| 5 | Add configurable email templates UI in Settings | `frontend/src/pages/Settings.tsx` |

---

### 2.13 Team Management — `TODO`

**What exists:**
- Settings page has a "Team" tab but it's marked **"coming soon"**
- Backend has user CRUD basics (signup, role assignment)

**What's missing:**
- Invite team member flow
- Role management UI (change user roles)
- Deactivate/reactivate team members
- Team member list with status

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `GET /api/users` (org-scoped list), `POST /api/users/invite`, `PATCH /api/users/:id/role`, `PATCH /api/users/:id/deactivate` | `backend/src/routes/users.ts` |
| 2 | Add Supabase invite-by-email flow using admin SDK | `backend/src/services/userService.ts` |
| 3 | Build Team tab: member list with role badges, invite button, role dropdown, activate/deactivate toggle | `frontend/src/pages/Settings.tsx` |

---

## 3. Additional Features (Suggestions)

### 3.1 Smart Priority Queuing — `TODO`

**What exists:** AI screening scores (0–10) stored on applications. No prioritization logic.

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Add `priority` column (enum: `urgent`, `high`, `normal`, `low`) to `jobs` table | `supabase/migrations/002_phase2.sql` |
| 2 | Add `priority_score` computed column or function: `(job.priority_weight * 0.4) + (screening_score * 0.6)` | `backend/src/services/priorityService.ts` |
| 3 | Update batch call scheduling to sort by priority score descending | `backend/src/routes/calls.ts` |
| 4 | Add auto-queue feature: `POST /api/calls/auto-queue` — selects top N uninterviewed candidates by priority and schedules calls | `backend/src/routes/calls.ts` |
| 5 | Add priority badge on jobs UI and priority sort on applications | `frontend/src/pages/Jobs.tsx`, `frontend/src/pages/Applications.tsx` |

---

### 3.2 AI Client-Ready Reports — `TODO`

**What exists:** Call transcripts, AI analysis, screening results all stored. No report generation.

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Create `POST /api/reports/candidate/:id` — generates executive summary using AI (OpenRouter) from screening results + call transcript + evaluation | `backend/src/routes/reports.ts` |
| 2 | Create report template with sections: Candidate Overview, Screening Summary, Interview Highlights, Strengths/Weaknesses, Recommendation | `backend/src/services/reportGenerator.ts` |
| 3 | Add PDF rendering using `pdfkit` with company branding | `backend/src/services/pdfService.ts` |
| 4 | Add "Generate Report" button on candidate/application detail sheets | `frontend/src/components/ApplicationDetailSheet.tsx` |
| 5 | Add report preview and download UI | `frontend/src/components/ReportPreview.tsx` |

---

### 3.3 Candidate Self-Service Portal — `TODO`

**What exists:** Nothing. Currently recruiter-only access.

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Design candidate auth flow — magic link via email (no password) using Supabase magic link auth | Design doc |
| 2 | Create `candidate_portal_tokens` table for secure, time-limited access tokens | `supabase/migrations/002_phase2.sql` |
| 3 | Create candidate-facing API routes (no org context needed, scoped by candidate token): `GET /api/portal/status` (interview status), `GET /api/portal/schedule` (available slots), `POST /api/portal/reschedule`, `POST /api/portal/resume` (upload updated resume) | `backend/src/routes/portal.ts` |
| 4 | Create candidate portal middleware — validates portal token, attaches candidate context | `backend/src/middleware/portalAuth.ts` |
| 5 | Build candidate portal frontend — separate route tree under `/portal`: status page, scheduling page, resume upload | `frontend/src/pages/portal/` |
| 6 | Update invitation email to include portal link | `backend/src/services/emailService.ts` |

---

### 3.4 Client Dashboard — `TODO`

**What exists:** Company management page (recruiter view). No client-facing access.

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Create `client_users` table: id, client_company_id, email, name, is_active | `supabase/migrations/002_phase2.sql` |
| 2 | Create client auth flow (separate from recruiter auth) — magic link or password-based | `backend/src/routes/clientAuth.ts` |
| 3 | Create client-scoped API routes: `GET /api/client/jobs` (their jobs only), `GET /api/client/pipeline` (application pipeline for their jobs), `GET /api/client/candidates/:id` (candidate summary + AI report), `GET /api/client/recordings/:id` (call recording access), `POST /api/client/feedback` (feedback on candidates) | `backend/src/routes/clientPortal.ts` |
| 4 | Create client middleware — validates client token, scopes queries to their company | `backend/src/middleware/clientAuth.ts` |
| 5 | Build client dashboard frontend — separate route tree under `/client`: pipeline view, candidate summaries, recording playback, feedback form | `frontend/src/pages/client/` |
| 6 | Add client user management UI for admins (invite client users, manage access) | `frontend/src/pages/Companies.tsx` |

---

### 3.5 Duplicate & Fraud Detection — `PARTIAL`

**What exists:**
- `UNIQUE (candidate_id, job_id)` constraint prevents same candidate applying to same job twice
- `UNIQUE (org_id, email)` on candidates prevents duplicate email within an org
- Webhook checks for existing application before creating

**What's missing:**
- Cross-job duplicate detection (same candidate, different jobs — flag, don't block)
- Fuzzy matching (similar names, phone numbers)
- Suspicious pattern detection (bulk submissions from same IP, identical resumes)
- Duplicate flagging UI

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Create `POST /api/candidates/check-duplicates` — fuzzy match on name + email + phone using pg_trgm extension | `backend/src/routes/candidates.ts` |
| 2 | Add `pg_trgm` extension and similarity index on candidates.email, first_name, last_name | `supabase/migrations/002_phase2.sql` |
| 3 | Add duplicate check hook in candidate creation flow — returns potential matches before confirming | `backend/src/services/duplicateDetection.ts` |
| 4 | Add `flags` JSONB column on candidates for fraud/duplicate flags | `supabase/migrations/002_phase2.sql` |
| 5 | Build duplicate review UI — when adding candidate, show "Possible duplicates found" modal with merge/skip options | `frontend/src/components/DuplicateCheckDialog.tsx` |
| 6 | Add fraud flag indicators on candidate list and detail views | `frontend/src/pages/Candidates.tsx` |

---

### 3.6 Multi-Stage Interviews — `TODO`

**What exists:** Single call per application with one AI agent per job. `call_evaluations` allows post-call decisions. Call resumption exists but for continuity, not separate stages.

**Execution:**

| Step | Task | Files |
|------|------|-------|
| 1 | Create `interview_stages` table: id, job_id, org_id, stage_number, name (e.g. "Screening", "Technical", "Final"), ai_agent_id, evaluation_criteria, is_eliminatory | `supabase/migrations/002_phase2.sql` |
| 2 | Add `stage_id` FK on `calls` table | `supabase/migrations/002_phase2.sql` |
| 3 | Expand `application_status` enum: add `technical_interview`, `final_interview` or make status dynamic based on stages | `supabase/migrations/002_phase2.sql` |
| 4 | Create `GET/POST/PATCH /api/jobs/:id/stages` endpoints for managing interview stages per job | `backend/src/routes/jobs.ts` |
| 5 | Update call creation to accept `stage_id` and use stage-specific agent/criteria | `backend/src/routes/calls.ts` |
| 6 | Update evaluation to auto-advance to next stage when decision = 'advance' | `backend/src/routes/calls.ts` |
| 7 | Build stage configuration UI in job create/edit flow — add/remove/reorder stages with agent assignment | `frontend/src/components/StageConfigurator.tsx` |
| 8 | Update application detail sheet to show multi-stage progress tracker | `frontend/src/components/ApplicationDetailSheet.tsx` |
| 9 | Update pipeline kanban to reflect stage-based statuses | `frontend/src/pages/Applications.tsx` |

---

## 4. Database Migration Summary

All schema changes for Phase 2 go into `supabase/migrations/002_phase2.sql`:

```sql
-- Scheduling config on orgs and jobs
ALTER TABLE organizations ADD COLUMN scheduling_config JSONB DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN scheduling_config JSONB DEFAULT '{}';

-- Job priority
ALTER TABLE jobs ADD COLUMN priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low'));

-- Recruiter capacity
ALTER TABLE users ADD COLUMN max_capacity INTEGER DEFAULT 50;

-- Multi-stage interviews
CREATE TABLE interview_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stage_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    ai_agent_id UUID REFERENCES ai_agents(id),
    evaluation_criteria JSONB DEFAULT '{}',
    is_eliminatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE calls ADD COLUMN stage_id UUID REFERENCES interview_stages(id);

-- Candidate portal tokens
CREATE TABLE candidate_portal_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client users
CREATE TABLE client_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_company_id UUID NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Duplicate/fraud detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE candidates ADD COLUMN flags JSONB DEFAULT '{}';
CREATE INDEX idx_candidates_name_trgm ON candidates USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_candidates_email_trgm ON candidates USING gin (email gin_trgm_ops);

-- RLS for new tables
ALTER TABLE interview_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

-- Policies (org-scoped)
CREATE POLICY stages_select ON interview_stages FOR SELECT USING (org_id = public.get_user_org_id());
CREATE POLICY stages_insert ON interview_stages FOR INSERT WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY stages_update ON interview_stages FOR UPDATE USING (org_id = public.get_user_org_id());
CREATE POLICY stages_delete ON interview_stages FOR DELETE USING (org_id = public.get_user_org_id());
```

---

## 5. Recommended Execution Order

Prioritized by dependency chain and business impact:

### Sprint 1 — Core Dashboard Gaps (1–2 weeks)
1. **Email History** (2.12) — complete email sending + build functional page
2. **Activity Log page** (2.11) — dedicated page with filters
3. **Team Management** (2.13) — invite, roles, deactivate

### Sprint 2 — Scheduling & Restrictions (1–2 weeks)
4. **Interview Scheduling Restrictions** (1.1) — business hours, blackouts, per-job config
5. **Recruiter Workload Management** (2.2) — workload dashboard, reassignment

### Sprint 3 — Advanced Features (2–3 weeks)
6. **Smart Priority Queuing** (3.1) — priority on jobs, auto-queue by score
7. **Analytics Export** (2.10) — CSV/PDF export on all analytics
8. **AI Client-Ready Reports** (3.2) — AI-generated summaries, PDF export

### Sprint 4 — Multi-Stage & Detection (2–3 weeks)
9. **Multi-Stage Interviews** (3.6) — stage config, stage-specific agents, pipeline updates
10. **Duplicate & Fraud Detection** (3.5) — fuzzy matching, flags, merge UI

### Sprint 5 — External Portals (2–3 weeks)
11. **Candidate Self-Service Portal** (3.3) — magic link auth, status, reschedule, resume upload
12. **Client Dashboard** (3.4) — client auth, pipeline view, recordings, feedback

---

## 6. Features Already Complete (No Work Needed)

| Feature | Status |
|---------|--------|
| Call Resumption (1.2) | DONE |
| Cal.com Self-Booking (1.3) | DONE |
| Individual Recruiter Logins (2.1) | DONE |
| Candidate Management (2.3) | DONE |
| Job Management Portal (2.4) | DONE |
| Company-Wise AI Agents (2.5) | DONE |
| Company-Wise Job Portal (2.6) | DONE |
| Application Pipeline View (2.7) | DONE |
| Call Management Console (2.8) | DONE |
| Call Evaluation & Decisions (2.9) | DONE |
