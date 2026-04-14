# Lovable Prompt — Interview Portal Dashboard

Build a modern, professional recruitment interview portal called **"Saanvi Interview Portal"**. This is an AI-powered recruitment management system where recruiters manage candidates, jobs, AI interview agents, and voice-based screening calls — all from one dashboard.

## Tech Stack
- React + TypeScript + Tailwind CSS + shadcn/ui
- Supabase for auth (email/password + Google OAuth), database, and storage
- React Router for navigation
- React Query (TanStack Query) for API state management
- Lucide React for icons
- Recharts for analytics charts

## Supabase Connection
Connect to this Supabase project:
- URL: `https://aielavasvbuiavwrldfo.supabase.co`

The backend API runs at `http://localhost:3001` during development. All API calls go to `/api/*` endpoints with a Bearer token from Supabase auth.

---

## Authentication Pages

### Login Page (`/login`)
- Clean, centered login form with email + password
- "Sign in with Google" button (Supabase Google OAuth)
- Link to signup page
- Company logo/branding at top: "Saanvi Interview Portal"
- Redirect to `/dashboard` after successful login

### Signup Page (`/signup`)
- Full name, email, password, confirm password
- Organization name field (for new org creation)
- Or "Join existing organization" toggle with org ID input
- "Sign up with Google" button
- Redirect to `/dashboard` after signup

### Auth Guard
- Protected route wrapper that redirects to `/login` if not authenticated
- Store auth token and user profile in context
- Auto-refresh token on expiry

---

## Main Layout

### Sidebar Navigation (collapsible)
- **Logo** at top: "Saanvi AI" with a small brain/AI icon
- Navigation items with icons:
  - 📊 Dashboard
  - 👥 Candidates
  - 💼 Jobs
  - 📋 Applications
  - 🤖 AI Agents
  - 📞 Calls
  - 🏢 Companies
  - 📧 Emails
  - 📈 Analytics
  - ⚙️ Settings
- Collapse to icon-only mode on smaller screens
- Active state highlight on current page
- User avatar + name + role at bottom of sidebar
- Logout button

### Top Bar
- Page title (dynamic based on current route)
- Search bar (global search across candidates, jobs)
- Notification bell icon
- Quick action button: "+ New" dropdown (New Candidate, New Job, New Agent)

---

## Pages & Features

### 1. Dashboard (`/dashboard`)
The main overview page with key metrics and activity.

**Stats Cards Row (4 cards):**
- Total Candidates (with trend arrow)
- Open Jobs
- Calls Today
- Pending Reviews

**Two-column layout below:**

**Left column (wider):**
- **Recent Activity Feed** — Timeline-style list showing recent actions: "John screened candidate X", "Call completed with Y", "New application for Z". Each item shows avatar, action text, and relative timestamp.
- **Application Pipeline** — Horizontal funnel/bar showing count at each stage: New → Screening → Interviewed → Shortlisted → Hired (with colors for each stage)

**Right column:**
- **Upcoming Scheduled Calls** — List of next 5 scheduled calls with candidate name, job title, scheduled time, and "Call Now" button
- **Top Jobs by Applications** — Small bar chart showing top 5 jobs by application count

### 2. Candidates Page (`/candidates`)
**List View:**
- Data table with columns: Name, Email, Phone, Source, Applications, Created Date
- Search bar to filter by name/email/phone
- Filter dropdowns: Source (CEIPAL, Email, Manual), Date range
- Sort by any column
- Pagination (20 per page)
- "Add Candidate" button → opens modal/drawer

**Add/Edit Candidate Modal:**
- First name, last name, email, phone, location
- Work authorization dropdown
- Source dropdown
- Resume file upload (drag & drop zone accepting PDF, DOCX, TXT)
- Save button

**Candidate Detail Page (`/candidates/:id`):**
- **Header**: Full name, email, phone, location, work authorization, source badge
- **Resume section**: View/download resume, extracted text preview
- **Applications tab**: List of all jobs they've applied to with status badges
- **Call History tab**: All calls with this candidate — status, duration, recording player, transcript expandable
- **Activity tab**: Timeline of all actions related to this candidate

### 3. Jobs Page (`/jobs`)
**List View:**
- Data table: Job Code, Title, Company, Status, Assigned Agent, Recruiter, Applications Count, Created Date
- Filter by: Status (Open/Closed/On Hold/Filled), Company, Recruiter
- Search by title or job code
- "Add Job" button and "Sync from CEIPAL" button
- Status shown as colored badges: 🟢 Open, 🔴 Closed, 🟡 On Hold, 🔵 Filled

**Sync CEIPAL Dialog:**
- Shows a confirmation dialog: "Sync all jobs from CEIPAL? This will import new jobs and update existing ones."
- Loading spinner during sync
- Results summary: "Synced 15 jobs: 3 new, 12 updated"

**Job Detail Page (`/jobs/:id`):**
- **Header**: Title, company name, status badge, location, employment type, tax terms
- **Description section**: Full job description (rendered as formatted text)
- **Skills**: Tag/chip list of required skills
- **Assigned AI Agent**: Shows agent name with link, or "No agent assigned" with "Assign Agent" button
- **Assigned Recruiter**: Shows recruiter name or "Unassigned"
- **Applications tab**: All applications for this job with candidate name, screening score (as colored number 0-10), status, and action buttons
- **Analytics tab**: Application funnel, avg screening score, time since posted

### 4. Applications Page (`/applications`)
**Kanban Board View (default):**
- Columns: New | Screening | Interviewed | Shortlisted | Rejected | Hired
- Each card shows: Candidate name, job title, screening score badge, date
- Cards are draggable between columns (updates status via API)
- Click card to open detail

**Table View (toggle):**
- Standard data table with all application fields
- Filters: Job, Status, Recruiter, Score range

**Application Detail Page (`/applications/:id`):**
- **Left panel (60%):**
  - Candidate info header (name, email, phone)
  - Resume text (scrollable)
  - AI Screening Results panel:
    - Overall Fit Score (large number 0-10 with color: green 7+, yellow 4-6, red 0-3)
    - Strengths (green bulleted list)
    - Weaknesses (red bulleted list)
    - Risk Factor (badge + explanation)
    - Reward Factor (badge + explanation)
    - Justification text
  - Mandate Questions list
  - Interview Questions list

- **Right panel (40%):**
  - Status badge with dropdown to change
  - Assigned recruiter with change option
  - **Actions:**
    - "Screen with AI" button (triggers AI analysis)
    - "Schedule Call" button → date/time picker
    - "Call Now" button
    - "Send Invitation Email" button
  - **Call History** for this application:
    - Each call shows: status badge, duration, date
    - Expandable transcript
    - Audio player for recording
    - Evaluation (if exists): decision badge, rating stars, notes
  - **Notes section**: Text area for recruiter notes with save button

### 5. AI Agents Page (`/agents`)
**Agent Cards Grid:**
- Card for each agent showing: Name, company badge, voice name, style badge, status (active/inactive), number of jobs using it
- "Create New Agent" prominent button
- Filter by company

**Create/Edit Agent Page (`/agents/new` or `/agents/:id/edit`):**
This is the AI Agent Builder — the most important configuration page.

- **Basic Info Section:**
  - Agent name (text input)
  - Client company (dropdown select)
  - Interview style (radio buttons: Formal / Conversational / Technical)
  - Active toggle

- **Voice Selection Section:**
  - Grid of available voices from Retell API
  - Each voice card shows: name, gender, accent, "Preview" play button
  - Selected voice highlighted with checkmark

- **Prompt Configuration Section:**
  - Large text area for system prompt with syntax highlighting
  - Template variable helper: shows available variables ({{candidate_name}}, {{job_title}}, {{company_name}}, {{mandate_questions}}, {{interview_questions}}, {{call_context}}) as clickable chips that insert into the text area
  - "Reset to Default" button that fills in the default prompt template
  - Greeting template text area
  - Closing template text area

- **Call Settings Section:**
  - Max call duration slider (5-60 minutes, default 20)
  - Language dropdown (English US, English UK, Hindi, Spanish, etc.)

- **Evaluation Criteria Section:**
  - Editable list of criteria: each has name, description, weight (slider 0-1)
  - Default categories: Technical Fit, Communication, Experience Relevance, Cultural Fit, Enthusiasm
  - Add/remove criteria buttons

- **Save button** at bottom (creates/updates agent in both our DB and Retell AI)

**Agent Detail Page (`/agents/:id`):**
- All config displayed read-only
- "Edit" button
- List of jobs using this agent
- Call stats: total calls, success rate, avg duration

### 6. Calls Page (`/calls`)
**List View:**
- Data table: Candidate, Job Title, Agent, Direction (inbound/outbound icon), Status, Duration, Date
- Status badges with colors: 🟢 Completed, 🔵 Scheduled, 🟡 In Progress, 🔴 Failed, ⚫ No Answer, 📧 Voicemail, ⚡ Interrupted
- Filter by: Status, Direction, Date range, Agent
- "Schedule New Call" button

**Call Detail Page (`/calls/:id`):**
- **Header**: Candidate name, job title, direction badge, status badge, duration, date/time
- **Audio Player**: Full-width audio player for call recording with play/pause, seek, speed control (1x, 1.5x, 2x)
- **Transcript Section**:
  - Chat-style display: Agent messages on left (blue), User messages on right (gray)
  - Timestamp on each message
  - Searchable within transcript
- **AI Analysis Panel** (if available):
  - Call summary
  - Candidate sentiment badge
  - Call successful (yes/no)
  - Callback requested (yes/no with time)
- **Evaluation Form** (if not yet evaluated):
  - Decision: 4 large buttons — ✅ Advance, ❌ Reject, 🔄 Callback, ⏸️ Hold
  - Rating: 5-star selector
  - Notes text area
  - Submit button
- **If already evaluated**: Show the evaluation read-only with who evaluated and when
- **Call Chain** (for resumed calls): Shows linked parent/child calls with a visual chain/timeline
- **Retry Call** button (if status is interrupted or failed)

### 7. Companies Page (`/companies`)
**Card Grid View:**
- Company card: Logo (or initials avatar), name, description preview, count of jobs, count of agents
- "Add Company" button
- Search bar

**Company Detail (`/companies/:id`):**
- Company name, logo, description
- **Jobs tab**: All jobs for this company
- **Agents tab**: All AI agents configured for this company
- Edit/Delete buttons

### 8. Emails Page (`/emails`)
**Email Log Table:**
- Columns: Candidate, Type (badge: Invitation/Follow-up/Rejection), Subject, Status (Sent/Failed/Bounced), Sent Date
- Filter by type, status, date range
- "Compose Email" button

**Compose Email Dialog:**
- To: Candidate search/select
- Template dropdown: Invitation, Follow-up, Rejection, Custom
- Subject (auto-filled from template, editable)
- Body (rich text editor, auto-filled from template)
- Send button

### 9. Analytics Page (`/analytics`)
**Overview Tab:**
- **Row 1**: KPI cards — Total Candidates, Total Calls, Avg Screening Score, Hire Rate %
- **Row 2**:
  - Line chart: Calls over time (last 30 days)
  - Pie chart: Call outcomes (Completed, No Answer, Voicemail, Failed, Interrupted)
- **Row 3**:
  - Bar chart: Applications by status
  - Bar chart: Top 10 jobs by applications

**Recruiter Performance Tab:**
- Recruiter selector dropdown
- Cards: Total applications, completed calls, avg call duration, evaluations made
- Table: Recent evaluations with decision and rating

**Agent Performance Tab:**
- Agent selector dropdown
- Cards: Total calls, success rate, avg duration, avg sentiment
- Chart: Calls over time for this agent

### 10. Settings Page (`/settings`)
- **Profile**: Edit name, avatar upload, email (read-only)
- **Organization**: Edit org name, logo upload (admin only)
- **Team Members**: List of users with role badges, invite new member form (admin only)
- **Phone Numbers**: List of registered phone numbers with assigned agent, status toggle
- **Integrations**:
  - CEIPAL: Connection status, last sync time, "Sync Now" button
  - Retell AI: Connection status, API key masked
  - Microsoft Outlook: Connect/disconnect button

---

## Design System

### Theme
- **Primary color**: Deep indigo/blue (#4F46E5)
- **Background**: Light gray (#F9FAFB) with white cards
- **Dark mode support** (toggle in settings)
- Professional, clean, minimal design similar to Linear or Notion
- Rounded corners (border-radius: 8-12px)
- Subtle shadows on cards
- Smooth transitions and hover states

### Components to Use (shadcn/ui)
- Button, Input, Select, Textarea, Switch, Slider
- Card, Dialog, Sheet (slide-over drawer), Popover
- Table with sorting and pagination
- Tabs, Accordion
- Badge, Avatar, Tooltip
- Toast notifications for success/error feedback
- Command palette (Cmd+K) for quick navigation
- Skeleton loaders while data is fetching

### Responsive Design
- Desktop-first but responsive down to tablet
- Sidebar collapses to hamburger menu on mobile
- Tables become card lists on small screens
- Forms stack to single column on mobile

---

## API Integration Pattern

All API calls use this pattern:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Authenticated request helper
async function apiRequest(path: string, options: RequestInit = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
```

### Key API Endpoints:
- `POST /api/auth/signup` — Register
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Current user profile
- `GET /api/candidates` — List candidates (paginated, filterable)
- `POST /api/candidates` — Create candidate
- `GET /api/candidates/:id` — Candidate detail with applications + calls
- `POST /api/candidates/:id/resume` — Upload resume (multipart/form-data)
- `GET /api/jobs` — List jobs
- `POST /api/jobs/sync-ceipal` — Trigger CEIPAL sync
- `GET /api/applications` — List applications
- `POST /api/applications` — Create application
- `PATCH /api/applications/:id` — Update status/notes
- `POST /api/applications/:id/screen` — Trigger AI screening
- `GET /api/agents` — List AI agents
- `POST /api/agents` — Create agent (syncs to Retell AI)
- `GET /api/agents/voices` — List available Retell voices
- `POST /api/calls/outbound` — Initiate outbound call
- `POST /api/calls/schedule` — Schedule future call
- `POST /api/calls/batch` — Schedule batch calls
- `POST /api/calls/:id/retry` — Retry interrupted call
- `POST /api/calls/:id/evaluate` — Submit call evaluation
- `GET /api/companies` — List client companies
- `GET /api/analytics/overview` — Dashboard stats
- `GET /api/analytics/recruiter/:id` — Recruiter stats
- `GET /api/analytics/job/:id` — Job stats

All list endpoints support: `?page=1&limit=20&search=text&status=open&sort_by=created_at&sort_order=desc`

All responses follow: `{ success: boolean, data: T, total?: number, page?: number }`

---

## Important UX Details
- Show toast notifications for all actions (success/error)
- Optimistic updates for status changes on the Kanban board
- Skeleton loading states on every page while data loads
- Empty states with helpful illustrations and CTAs ("No candidates yet — add your first candidate")
- Confirmation dialogs for destructive actions (delete, reject)
- Real-time updates via Supabase Realtime subscriptions for the dashboard activity feed
- Keyboard shortcuts: Cmd+K for command palette, Escape to close modals
- Breadcrumb navigation on detail pages
