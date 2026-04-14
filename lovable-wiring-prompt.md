# Wire All Pages to Real Backend API

The app currently uses hardcoded mock data on every page. Replace ALL mock data with real API calls using the `apiRequest` function already defined in `src/lib/api.ts`. Use React Query (`@tanstack/react-query`, already installed) for data fetching, caching, and mutations.

## Environment Setup

Create a `.env` file with:
```
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZWxhdmFzdmJ1aWF2d3JsZGZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODk2ODcsImV4cCI6MjA5MDA2NTY4N30.-eeD-NtoQTBuMqoHyI2tGSWLl-UWOP0D8yLZIbETojk
VITE_API_URL=http://localhost:3001
```

## Important: Auth Flow Fix

The signup flow needs to also call the backend to create the user profile in our `users` table. After Supabase auth signup succeeds, immediately call:

```typescript
await apiRequest('/api/auth/signup', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    full_name: fullName,
    org_name: orgName || undefined,
    org_id: orgId || undefined,
  }),
});
```

Actually, since Supabase Auth creates the auth.users record and the backend signup creates both the auth user AND the profile, change the signup flow to:
- Call `POST /api/auth/signup` (which creates both the Supabase auth user AND the users table profile)
- Then call `supabase.auth.signInWithPassword()` to get a session
- Do NOT call `supabase.auth.signUp()` directly — let the backend handle it

For login, keep using `supabase.auth.signInWithPassword()` directly (that's fine).

## API Helper Usage Pattern

Every page should follow this pattern:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';

// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['candidates', page, search],
  queryFn: () => apiRequest<ApiResponse<Candidate[]>>(`/api/candidates?page=${page}&limit=20&search=${search}`),
});

// Mutate data
const queryClient = useQueryClient();
const createMutation = useMutation({
  mutationFn: (newCandidate: CreateCandidateInput) =>
    apiRequest('/api/candidates', { method: 'POST', body: JSON.stringify(newCandidate) }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    toast({ title: 'Candidate created successfully' });
  },
});
```

## Page-by-Page Wiring

### Dashboard (`/dashboard`)
Replace all mock stats and activity with:
```
GET /api/analytics/overview
```
Response has: `total_candidates`, `open_jobs`, `total_calls`, `calls_today`, `pending_reviews`, `recent_activity[]`

### Candidates (`/candidates`)
- **List:** `GET /api/candidates?page=1&limit=20&search=text&source=CEIPAL`
- **Create:** `POST /api/candidates` with body `{ first_name, last_name, email, phone, location, work_authorization, source }`
- **Detail:** `GET /api/candidates/:id` — returns candidate with `applications[]` and `calls[]`
- **Update:** `PATCH /api/candidates/:id`
- **Resume upload:** `POST /api/candidates/:id/resume` — use `FormData` with `Content-Type` removed (let browser set multipart boundary):
```typescript
const formData = new FormData();
formData.append('resume', file);
await fetch(`${API_URL}/api/candidates/${id}/resume`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
```

### Jobs (`/jobs`)
- **List:** `GET /api/jobs?page=1&limit=20&status=open&company_id=uuid&search=text`
- **Create:** `POST /api/jobs` with body `{ title, description, client_company_id, skills, location, state, country, employment_type, ai_agent_id }`
- **Detail:** `GET /api/jobs/:id` — returns job with `applications[]`, `client_companies`, `ai_agents`
- **Update:** `PATCH /api/jobs/:id`
- **CEIPAL Sync button:** `POST /api/jobs/sync-ceipal` — show loading spinner, then toast with results `{ synced, created, updated }`

### Applications (`/applications`)
- **List:** `GET /api/applications?page=1&limit=20&job_id=uuid&status=new&recruiter_id=uuid`
- **Create:** `POST /api/applications` with body `{ candidate_id, job_id }`
- **Detail:** `GET /api/applications/:id` — returns full detail with `candidates`, `jobs`, `calls[]`
- **Update status (drag on Kanban or click approve/reject):** `PATCH /api/applications/:id` with body `{ status: 'shortlisted' }`
  - IMPORTANT: When status changes to "shortlisted", the backend auto-sends invitation email. Show toast: "Candidate approved — invitation email sent automatically"
- **AI Screening button:** `POST /api/applications/:id/screen` — show loading, then display the returned screening results (strengths, weaknesses, score, etc.)
- The response from `GET /api/applications/:id` includes `ai_screening_result` JSON with: `candidate_strengths[]`, `candidate_weaknesses[]`, `risk_factor`, `reward_factor`, `overall_fit_rating`, `justification_for_rating`

### AI Agents (`/agents`)
- **List:** `GET /api/agents?company_id=uuid&active_only=true`
- **Voices:** `GET /api/agents/voices` — returns list of Retell voices for the voice picker
- **Create:** `POST /api/agents` with body `{ name, client_company_id, system_prompt, voice_id, language, interview_style, max_call_duration_sec, evaluation_criteria, greeting_template, closing_template }`
- **Detail:** `GET /api/agents/:id`
- **Update:** `PATCH /api/agents/:id`
- **Delete:** `DELETE /api/agents/:id`

### Calls (`/calls`)
- **List:** `GET /api/calls?page=1&limit=20&status=completed&direction=outbound`
- **Detail:** `GET /api/calls/:id` — returns call with `transcript`, `recording_url`, `call_analysis`, `candidates`, `call_evaluations[]`, `resumption_calls[]`
- **Initiate call:** `POST /api/calls/outbound` with body `{ application_id }`
- **Schedule call:** `POST /api/calls/schedule` with body `{ application_id, scheduled_at: "2024-03-25T14:00:00Z" }`
- **Batch calls:** `POST /api/calls/batch` with body `{ application_ids: [...], interval_minutes: 5 }`
- **Retry interrupted call:** `POST /api/calls/:id/retry`
- **Submit evaluation:** `POST /api/calls/:id/evaluate` with body `{ application_id, decision: "advance"|"reject"|"callback"|"hold", rating: 1-5, notes: "text" }`
- **Audio player:** Use the `recording_url` field directly as the `<audio>` src. It's a public WAV URL from Retell.

### Companies (`/companies`)
- **List:** `GET /api/companies?search=text`
- **Create:** `POST /api/companies` with body `{ name, description, logo_url }`
- **Detail:** `GET /api/companies/:id` — returns company with `ai_agents[]` and `jobs[]`
- **Update:** `PATCH /api/companies/:id`
- **Delete:** `DELETE /api/companies/:id`

### Emails (`/emails`)
- Emails are logged automatically by the backend. There's no direct email list endpoint yet.
- For now, show the email logs from the application detail view (`GET /api/applications/:id` response includes email info indirectly through the activity log).
- Keep the compose email UI as a placeholder for future implementation.

### Analytics (`/analytics`)
- **Overview:** `GET /api/analytics/overview`
- **Recruiter stats:** `GET /api/analytics/recruiter/:id`
- **Job stats:** `GET /api/analytics/job/:id`

### Settings (`/settings`)
- **Current user:** `GET /api/auth/me` — returns user profile with organization details
- Keep the rest of settings as local/UI-only for now

## Response Format

All API responses follow this structure:
```typescript
// Success
{ success: true, data: T }

// Success with pagination
{ success: true, data: T[], total: 100, page: 1, limit: 20, totalPages: 5 }

// Error
{ success: false, error: "Error message" }
```

## Loading & Error States
- Show skeleton loaders (already available in shadcn) while `isLoading` is true
- Show error toast on API failures
- Show empty states with helpful messages when data arrays are empty: "No candidates yet — add your first candidate"

## Quick Actions on Applications

On the Applications page (both Kanban and table view), add inline action buttons:
- ✅ **Approve** button — sets status to "shortlisted" (auto-sends email)
- ❌ **Reject** button — sets status to "rejected"
- These should work directly from the list/card without opening the detail page
- Show the AI screening score prominently on each card/row (color-coded: green 7+, yellow 4-6, red 0-3)
