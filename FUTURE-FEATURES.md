# Future Features - Implementation Plan

> Saanvi Interview Portal - Feature Roadmap
> Created: 2026-03-26
> Recommended implementation order: 3 → 2 → 1 → 6 → 8 → 7 → 4 → 5 (quickest wins first)

---

## Table of Contents

1. [Smart Interview Scheduling with Priority Queuing](#1-smart-interview-scheduling-with-priority-queuing)
2. [AI Post-Interview Client-Ready Reports](#2-ai-post-interview-client-ready-reports)
3. [AI-Powered Candidate Auto-Matching & Ranking](#3-ai-powered-candidate-auto-matching--ranking)
4. [AI Duplicate & Fraud Detection](#4-ai-duplicate--fraud-detection)
5. [Conversation Intelligence & Training Insights](#5-conversation-intelligence--training-insights)
6. [Client Dashboard & Collaboration Portal](#6-client-dashboard--collaboration-portal)
7. [Candidate Self-Service Portal](#7-candidate-self-service-portal)
8. [Multi-Stage Interview Pipeline](#8-multi-stage-interview-pipeline)

---

## 1. Smart Interview Scheduling with Priority Queuing

**Effort:** 1-2 days | **Complexity:** Low | **Architectural Changes:** None

### Problem

Calls are scheduled FIFO or in simple batches. If Ford needs 5 hires by Friday and another client has no deadline, both get equal scheduling priority. High-scoring candidates wait just as long as low-scoring ones.

### What Exists Today

- `callScheduler.job.ts` — polls scheduled calls every minute
- `POST /api/calls/batch` — schedules multiple calls with fixed intervals
- `ai_screening_score` on applications (0-10)
- `status` on jobs (open/closed/on_hold/filled)

### Implementation Plan

#### Step 1: Database Changes

```sql
-- Add priority and deadline columns to jobs table
ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 0; -- 0=normal, 1=high, 2=urgent
ALTER TABLE jobs ADD COLUMN client_deadline TIMESTAMPTZ;

-- Add priority_score to calls table (computed at scheduling time)
ALTER TABLE calls ADD COLUMN priority_score NUMERIC DEFAULT 0;
```

#### Step 2: Backend — Priority Calculation Service

Create `backend/src/services/scheduler.service.ts`:

```
Inputs for priority score calculation:
- Job priority (0/1/2) — weight: 40%
- Client deadline proximity (days remaining) — weight: 30%
- Candidate AI screening score (0-10) — weight: 20%
- Time waiting in queue (hours since application created) — weight: 10%

Formula: priority_score = (job_priority * 40) + (deadline_urgency * 30) + (screening_score * 20) + (wait_time_score * 10)

Where:
- deadline_urgency = max(0, 10 - days_until_deadline) / 10
- wait_time_score = min(hours_waiting / 72, 1) -- caps at 3 days
```

#### Step 3: Backend — Modify Call Scheduler

Update `backend/src/jobs/callScheduler.job.ts`:

- Change the query that fetches scheduled calls to ORDER BY `priority_score DESC` instead of `scheduled_at ASC`
- When creating a call via batch endpoint, calculate and store `priority_score`
- Add rate limiting per job: max N calls per job per hour to avoid one urgent job consuming all slots

#### Step 4: Backend — Modify Batch Endpoint

Update `backend/src/routes/calls.routes.ts` — `POST /api/calls/batch`:

- Accept optional `auto_prioritize: boolean` param
- When true, sort `application_ids` by screening score descending before scheduling
- Calculate `priority_score` for each call record

#### Step 5: Frontend — Job Creation/Edit

Update `CreateJobDialog.tsx` and `JobDetailSheet.tsx`:

- Add "Priority" dropdown: Normal / High / Urgent
- Add "Client Deadline" date picker
- Display priority badge on jobs table and cards

#### Step 6: Frontend — Calls Page Enhancement

Update `Calls.tsx`:

- Show `priority_score` as a column (or color indicator)
- Add "Auto-Schedule by Priority" button that triggers batch scheduling sorted by priority

### Files to Modify

```
backend/src/jobs/callScheduler.job.ts    — Priority-based polling
backend/src/routes/calls.routes.ts       — Batch endpoint enhancement
backend/src/routes/jobs.routes.ts        — Accept priority/deadline fields
frontend/src/components/CreateJobDialog.tsx — Priority + deadline fields
frontend/src/components/JobDetailSheet.tsx  — Display priority/deadline
frontend/src/pages/Calls.tsx              — Priority indicator column
```

### New Files

```
backend/src/services/scheduler.service.ts — Priority score calculation
```

---

## 2. AI Post-Interview Client-Ready Reports

**Effort:** 2-3 days | **Complexity:** Low | **Architectural Changes:** None

### Problem

After an AI call completes, recruiters get raw transcript + sentiment analysis. To share results with clients (Ford, etc.), they manually write up evaluation summaries in emails. This is time-consuming and inconsistent.

### What Exists Today

- `calls.transcript` — full conversation text
- `calls.call_analysis` — JSON with summary, sentiment, success flag
- `applications.ai_screening_result` — strengths, weaknesses, risk/reward, fit rating
- `call_evaluations` — recruiter decision + rating + notes
- OpenRouter integration for LLM calls

### Implementation Plan

#### Step 1: Database Changes

```sql
CREATE TABLE client_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  application_id UUID NOT NULL REFERENCES applications(id),
  call_id UUID REFERENCES calls(id),
  client_company_id UUID REFERENCES client_companies(id),

  -- Report content (generated by LLM)
  executive_summary TEXT,           -- 2-3 sentence overview
  candidate_assessment JSONB,       -- { technical_fit, communication, experience, cultural_fit, overall }
  strengths TEXT[],                  -- Top 3-5 strengths
  concerns TEXT[],                   -- Red flags or concerns
  recommendation TEXT,              -- "Strong Hire" / "Hire" / "No Hire" / "Needs Further Evaluation"
  recommendation_reasoning TEXT,    -- Why this recommendation
  interview_highlights JSONB,       -- Key Q&A moments from transcript
  skill_ratings JSONB,              -- { skill: rating } based on interview

  -- Metadata
  report_version INTEGER DEFAULT 1,
  generated_by UUID REFERENCES users(id),
  pdf_url TEXT,                     -- Supabase Storage path
  shared_with_client BOOLEAN DEFAULT false,
  shared_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Step 2: Backend — Report Generation Service

Create `backend/src/services/reportGenerator.service.ts`:

```
Function: generateClientReport(applicationId, callId, orgId)

1. Fetch application + candidate + job + call + call_evaluation
2. Build LLM prompt:
   - System: "You are a professional recruitment consultant. Generate a structured
     candidate evaluation report for a client."
   - Input data:
     - Job: title, description, required skills
     - Candidate: name, experience summary (from resume_text)
     - AI Screening: strengths, weaknesses, risk/reward, fit rating
     - Interview Transcript: full transcript
     - Call Analysis: summary, sentiment, success
     - Recruiter Notes: decision, rating, notes (if available)
   - Required output (JSON):
     - executive_summary
     - candidate_assessment (5 categories, each rated 1-5 with explanation)
     - strengths (top 5)
     - concerns (any red flags)
     - recommendation ("Strong Hire" / "Hire" / "No Hire" / "Needs Further Evaluation")
     - recommendation_reasoning
     - interview_highlights (3-5 key Q&A moments)
     - skill_ratings (each required skill rated 1-5)
3. Call OpenRouter API (use gpt-4o for better quality, not gpt-4o-mini)
4. Parse JSON response
5. Store in client_reports table
6. Return report data
```

#### Step 3: Backend — PDF Generation Service

Create `backend/src/services/pdfGenerator.service.ts`:

```
Install: npm install pdfkit

Function: generateReportPDF(reportId)

1. Fetch report + candidate + job + company
2. Build PDF with sections:
   - Header: Company logo, report date, confidentiality notice
   - Candidate Info: Name, position applied, interview date
   - Executive Summary
   - Assessment Radar/Table (5 categories with ratings)
   - Strengths & Concerns (bullet lists)
   - Interview Highlights (Q&A format)
   - Skill Ratings (table)
   - Recommendation (highlighted box)
3. Upload PDF to Supabase Storage: /org_id/reports/report_id.pdf
4. Update client_reports.pdf_url
5. Return public URL
```

#### Step 4: Backend — API Routes

Add to `backend/src/routes/reports.routes.ts`:

```
POST   /api/reports/generate          — Generate report for an application/call
GET    /api/reports/:id               — Get report details
GET    /api/reports/:id/pdf           — Download PDF
GET    /api/reports?application_id=   — List reports for an application
PATCH  /api/reports/:id/share         — Mark as shared with client
DELETE /api/reports/:id               — Delete report
```

#### Step 5: Frontend — Generate Report Button

Update `CallDetailSheet.tsx`:

- Add "Generate Client Report" button (visible after call is completed)
- Loading state while LLM generates report
- Display report preview in a new section/tab within the sheet

Update `ApplicationDetailSheet.tsx`:

- Show list of generated reports
- "Generate Report" button if call exists but no report yet
- "Download PDF" and "Share with Client" buttons

#### Step 6: Frontend — Reports Page (Optional)

Create `frontend/src/pages/Reports.tsx`:

- Table of all generated reports
- Filters: company, job, date range, recommendation
- Bulk PDF download
- Status: Draft / Shared

### Files to Modify

```
backend/src/index.ts                           — Mount reports routes
backend/src/routes/calls.routes.ts             — Link to report generation
frontend/src/components/CallDetailSheet.tsx     — Generate report button
frontend/src/components/ApplicationDetailSheet.tsx — Report list + actions
frontend/src/App.tsx                           — Add reports route
frontend/src/components/AppSidebar.tsx          — Add Reports nav item
```

### New Files

```
backend/src/services/reportGenerator.service.ts — LLM report generation
backend/src/services/pdfGenerator.service.ts    — PDF creation + upload
backend/src/routes/reports.routes.ts            — Report CRUD endpoints
frontend/src/pages/Reports.tsx                  — Reports listing page
frontend/src/components/ReportPreview.tsx        — Report preview component
```

### New Dependencies

```
backend: pdfkit (or @react-pdf/renderer if using React-based PDF)
```

---

## 3. AI-Powered Candidate Auto-Matching & Ranking

**Effort:** 2-3 days | **Complexity:** Low-Medium | **Architectural Changes:** None

### Problem

When a new job comes in from a client, recruiters manually search through candidates. With hundreds of candidates in the database, finding the best matches is slow and subjective.

### What Exists Today

- `candidates.resume_text` — extracted text from resumes
- `screening.service.ts` — AI scoring of resume vs job description
- BullMQ job infrastructure
- `ai_screening_score` on applications

### Implementation Plan

#### Step 1: Database Changes

```sql
CREATE TABLE job_candidate_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  candidate_id UUID NOT NULL REFERENCES candidates(id),

  match_score NUMERIC NOT NULL,          -- 0-10 overall match
  match_reasoning TEXT,                   -- Why this candidate matches
  skill_overlap TEXT[],                   -- Skills that match job requirements
  skill_gaps TEXT[],                      -- Required skills candidate lacks
  location_match BOOLEAN,                -- Does candidate location work?
  experience_match TEXT,                 -- "overqualified" / "match" / "underqualified"

  already_applied BOOLEAN DEFAULT false, -- Is there an existing application?
  application_id UUID REFERENCES applications(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, candidate_id)           -- One match per job-candidate pair
);

CREATE INDEX idx_matches_job_score ON job_candidate_matches(job_id, match_score DESC);
```

#### Step 2: Backend — Matching Service

Create `backend/src/services/matching.service.ts`:

```
Function: matchCandidatesForJob(jobId, orgId, options?)

1. Fetch job details (title, description, skills, location, employment_type)
2. Fetch all candidates in org who:
   - Have resume_text (non-null, non-empty)
   - Are not already applied to this job (unless include_applied=true)
   - Optionally filter by location, work_authorization
3. For each candidate (batch of 5-10 at a time to manage API costs):
   - Send to OpenRouter: resume_text + job description
   - Prompt: "Rate this candidate's fit for this job. Return JSON with:
     match_score (0-10), match_reasoning, skill_overlap[], skill_gaps[],
     location_match, experience_match"
   - Use gpt-4o-mini for cost efficiency (screening quality is sufficient)
4. Store results in job_candidate_matches table (upsert)
5. Return top N matches sorted by match_score DESC

Optimization: Skip candidates with very short resume_text (<100 chars)
Cost control: Process max 50 candidates per run, configurable
```

#### Step 3: Backend — Background Job

Create `backend/src/jobs/candidateMatcher.job.ts`:

```
Trigger conditions:
1. Manual: Recruiter clicks "Find Matching Candidates" on a job
2. Automatic: When a new job is created or synced from CEIPAL
3. Periodic: Re-run weekly for open jobs (candidates pool may have grown)

Queue: candidateMatcherQueue (BullMQ)
- Concurrency: 1 (to avoid API rate limits)
- Rate limit: Max 100 OpenRouter calls per run
```

#### Step 4: Backend — API Routes

Add to `backend/src/routes/jobs.routes.ts`:

```
POST /api/jobs/:id/match-candidates     — Trigger matching for a job
GET  /api/jobs/:id/matches              — Get ranked candidate matches
                                           Query params: ?limit=20&min_score=5
POST /api/jobs/:id/matches/:candidateId/apply — Create application from match
```

#### Step 5: Frontend — Job Detail Enhancement

Update `JobDetailSheet.tsx`:

- New tab: "Recommended Candidates"
- "Find Matching Candidates" button (triggers matching job)
- Loading state while AI processes
- Results: Ranked list showing:
  - Candidate name, match score (color-coded), key matching skills
  - "Already Applied" badge if application exists
  - "Create Application" button to fast-track a match into the pipeline
- Filters: Min score, skill overlap, location match

#### Step 6: Auto-Trigger on Job Creation

Update `backend/src/routes/jobs.routes.ts` — POST handler:

- After job is created, add to candidateMatcherQueue
- Same for CEIPAL sync: after syncing new jobs, queue matching

### Files to Modify

```
backend/src/routes/jobs.routes.ts              — New endpoints + auto-trigger
backend/src/index.ts                           — Register matcher worker
frontend/src/components/JobDetailSheet.tsx      — Recommended candidates tab
```

### New Files

```
backend/src/services/matching.service.ts       — AI matching logic
backend/src/jobs/candidateMatcher.job.ts       — Background job worker
```

---

## 4. AI Duplicate & Fraud Detection

**Effort:** 4-5 days | **Complexity:** Medium | **Architectural Changes:** Minor

### Problem

Same candidate applies through CEIPAL, n8n webhook, and manual entry — creating 3 records. AI call credits and recruiter time are wasted on duplicates. Some candidates submit AI-generated or embellished resumes.

### What Exists Today

- `candidates` table with email, phone, first_name, last_name, resume_text
- Webhook intake from multiple sources (CEIPAL, n8n, Zapier)
- OpenRouter integration for LLM analysis
- Unique constraint only on (email, org_id) — not phone or name

### Implementation Plan

#### Step 1: Database Changes

```sql
-- Duplicate detection
CREATE TABLE duplicate_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  primary_candidate_id UUID REFERENCES candidates(id),  -- The "main" record
  status TEXT DEFAULT 'pending',  -- pending | merged | dismissed
  confidence NUMERIC,             -- 0-1 how confident the match is
  match_reasons TEXT[],           -- ["same_phone", "similar_name", "resume_overlap"]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
);

CREATE TABLE duplicate_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES duplicate_groups(id),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  UNIQUE(group_id, candidate_id)
);

-- Fraud detection
ALTER TABLE candidates ADD COLUMN fraud_flags JSONB DEFAULT '[]';
-- Example: [{"type": "ai_generated", "confidence": 0.85, "details": "..."}]
ALTER TABLE candidates ADD COLUMN fraud_score NUMERIC DEFAULT 0; -- 0-1
```

#### Step 2: Backend — Duplicate Detection Service

Create `backend/src/services/duplicateDetection.service.ts`:

```
Function: checkForDuplicates(candidateId, orgId)

Matching strategies (run all, combine scores):

1. Exact email match (different candidate records with same email — shouldn't happen
   due to unique constraint, but check for typos like gmail vs googlemail)
   - Score: 1.0 if match

2. Phone number match (normalize to E.164 first)
   - Score: 0.9 if match
   - Use existing phone.ts utility for normalization

3. Name similarity (Levenshtein distance)
   - Normalize: lowercase, trim, remove middle initials
   - Score: 0.7 if distance < 2 for both first + last name
   - Score: 0.5 if last name exact match + first name distance < 3

4. Resume text similarity (cosine similarity on TF-IDF or simple Jaccard)
   - Extract key phrases from resume_text
   - Score: 0.8 if similarity > 0.85
   - Score: 0.6 if similarity > 0.70

Combined confidence = weighted average of matching strategies that fired
Threshold: Create duplicate group if confidence > 0.6

Function: mergeCandidates(primaryId, secondaryIds, orgId)

1. Move all applications from secondary candidates to primary
2. Move all calls from secondary to primary
3. Merge contact info (keep non-null values from primary, fill gaps from secondary)
4. Concatenate resume_text if different
5. Soft-delete secondary candidates (add merged_into_id field)
6. Log activity
```

#### Step 3: Backend — Fraud Detection Service

Create `backend/src/services/fraudDetection.service.ts`:

```
Function: analyzeResumeAuthenticity(candidateId, orgId)

1. Fetch candidate.resume_text
2. Send to OpenRouter with prompt:
   "Analyze this resume for potential red flags. Check for:
   - AI-generated content patterns (repetitive structure, generic phrasing)
   - Inconsistent timelines (overlapping dates, impossible experience)
   - Embellished claims (vague metrics, buzzword overload without substance)
   - Copy-paste from job descriptions (candidate mirrors JD language exactly)

   Return JSON:
   {
     fraud_score: 0-1 (0 = legitimate, 1 = highly suspicious),
     flags: [
       { type: 'ai_generated' | 'timeline_inconsistent' | 'embellished' | 'jd_mirrored',
         confidence: 0-1,
         details: 'explanation',
         evidence: 'quoted text from resume' }
     ],
     overall_assessment: 'clean' | 'minor_concerns' | 'suspicious' | 'likely_fraudulent'
   }"
3. Store results in candidates.fraud_flags and candidates.fraud_score
4. If fraud_score > 0.7, flag for recruiter review
```

#### Step 4: Backend — Auto-Trigger on Candidate Creation

Update `backend/src/routes/candidates.routes.ts` and `backend/src/routes/webhooks.routes.ts`:

- After candidate is created (manual or webhook intake):
  - Queue duplicate check job
  - Queue fraud detection job (if resume_text exists)

#### Step 5: Backend — API Routes

Create `backend/src/routes/duplicates.routes.ts`:

```
GET    /api/duplicates                    — List duplicate groups (pending/resolved)
GET    /api/duplicates/:groupId           — Get group details + member candidates
POST   /api/duplicates/:groupId/merge     — Merge candidates (pick primary)
POST   /api/duplicates/:groupId/dismiss   — Mark as not duplicate
GET    /api/candidates/:id/fraud-report   — Get fraud analysis for a candidate
POST   /api/candidates/:id/check-fraud    — Trigger fraud check
```

#### Step 6: Frontend — Duplicate Management

Create `frontend/src/pages/Duplicates.tsx`:

- List of duplicate groups with confidence scores
- Each group shows candidate cards side-by-side for comparison
- "Merge" button: pick primary record, merge others into it
- "Not a Duplicate" button: dismiss the group

Update `CandidateDetailSheet.tsx`:

- Warning banner if candidate is in a duplicate group
- Fraud score indicator (green/yellow/red)
- "View Fraud Report" expandable section showing flags

Update `Candidates.tsx`:

- Badge on candidate row if flagged for duplicates or fraud
- Filter: "Show flagged candidates"

### Files to Modify

```
backend/src/routes/candidates.routes.ts        — Auto-trigger checks
backend/src/routes/webhooks.routes.ts          — Auto-trigger on intake
backend/src/index.ts                           — Mount duplicates routes, register workers
frontend/src/components/CandidateDetailSheet.tsx — Fraud + duplicate warnings
frontend/src/pages/Candidates.tsx              — Flag badges + filters
frontend/src/App.tsx                           — Add duplicates route
frontend/src/components/AppSidebar.tsx          — Add nav item
```

### New Files

```
backend/src/services/duplicateDetection.service.ts — Duplicate matching logic
backend/src/services/fraudDetection.service.ts     — Resume fraud analysis
backend/src/jobs/duplicateChecker.job.ts           — Background duplicate check
backend/src/routes/duplicates.routes.ts            — Duplicate management API
frontend/src/pages/Duplicates.tsx                  — Duplicate resolution UI
```

---

## 5. Conversation Intelligence & Training Insights

**Effort:** 4-5 days | **Complexity:** Medium | **Architectural Changes:** None

### Problem

Valuable patterns are hidden in call data. Which interview questions predict successful hires? Which AI agents perform best? What do top candidates say differently? Currently, this data sits unused in transcripts.

### What Exists Today

- `calls.transcript` — full conversation text for every call
- `calls.call_analysis` — sentiment, success, summary
- `call_evaluations` — recruiter decisions (advance/reject) + ratings
- `applications.status` — final outcome (hired/rejected)
- `ai_agents` with different configurations
- Analytics endpoints (overview, recruiter, agent stats)

### Implementation Plan

#### Step 1: Database Changes

```sql
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),

  category TEXT NOT NULL,
  -- Categories: "question_effectiveness", "agent_comparison", "candidate_patterns",
  --             "skill_indicators", "red_flag_patterns", "process_optimization"

  title TEXT NOT NULL,              -- Short insight title
  description TEXT NOT NULL,        -- Detailed insight
  evidence JSONB,                   -- Supporting data points
  confidence NUMERIC,               -- 0-1
  impact TEXT,                      -- "high" | "medium" | "low"
  actionable_recommendation TEXT,   -- What to do about it

  data_range_start TIMESTAMPTZ,    -- What time period was analyzed
  data_range_end TIMESTAMPTZ,
  sample_size INTEGER,             -- How many calls/transcripts analyzed

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store extracted Q&A pairs for analysis
CREATE TABLE interview_qa_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  call_id UUID NOT NULL REFERENCES calls(id),
  application_id UUID REFERENCES applications(id),
  job_id UUID REFERENCES jobs(id),

  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  question_category TEXT,          -- "technical", "behavioral", "situational", "mandate"
  answer_quality_score NUMERIC,    -- 0-10 rated by LLM
  candidate_outcome TEXT,          -- "hired" | "rejected" | "pending" (denormalized for analysis)

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Step 2: Backend — Transcript Processor

Create `backend/src/services/transcriptAnalyzer.service.ts`:

```
Function: extractQAPairs(callId)

1. Fetch call transcript
2. Send to OpenRouter:
   "Extract all question-answer pairs from this interview transcript.
    For each pair, categorize the question and rate the answer quality (0-10).
    Return JSON array:
    [{ question, answer, question_category, answer_quality_score }]"
3. Store in interview_qa_pairs table
4. Link to application outcome (if available)

Trigger: Run after call completion (add to retell post-call webhook handler)
```

#### Step 3: Backend — Insights Generator

Create `backend/src/services/insightsGenerator.service.ts`:

```
Function: generateInsights(orgId, dateRange?)

Run these analyses:

1. Question Effectiveness Analysis
   - Group QA pairs by question (fuzzy match similar questions)
   - For each question cluster:
     - Count: how many times asked
     - Correlation: avg answer quality score for hired vs rejected candidates
     - Insight: "Candidates who scored 8+ on 'describe a challenging project'
       were hired 73% of the time vs 12% for those scoring <5"

2. Agent Comparison
   - Group calls by ai_agent_id
   - Compare: completion rate, avg duration, sentiment, hire rate
   - Insight: "Agent 'Technical Screener' has 85% call completion vs
     'General Screener' at 62%. Key difference: shorter greeting, direct questions."

3. Candidate Success Patterns
   - Analyze transcripts of hired candidates vs rejected
   - Look for: keywords, answer length, sentiment patterns
   - Insight: "Hired candidates mention specific metrics 3x more often
     than rejected candidates"

4. Red Flag Detection
   - Analyze transcripts of rejected/failed candidates
   - Common patterns: vague answers, topic avoidance, inconsistencies
   - Insight: "Candidates who say 'I'm not sure' more than 3 times
     are rejected 89% of the time"

5. Process Optimization
   - Analyze: time-to-hire, drop-off stages, scheduling patterns
   - Insight: "Calls scheduled before 10am have 40% higher completion rate"

Each insight stored with evidence, confidence, impact, and recommendation.
```

#### Step 4: Backend — Background Job

Create `backend/src/jobs/insightsGenerator.job.ts`:

```
Schedule: Weekly (every Sunday at midnight)
Also triggerable manually via API

1. Run extractQAPairs for any calls that haven't been processed
2. Run generateInsights for the past 30 days
3. Compare with previous insights — flag changes
4. Store new insights, deactivate stale ones
```

#### Step 5: Backend — API Routes

Add to `backend/src/routes/analytics.routes.ts`:

```
GET  /api/analytics/insights             — List insights (filter by category, impact)
POST /api/analytics/insights/generate    — Trigger insight generation
GET  /api/analytics/questions             — Question effectiveness breakdown
GET  /api/analytics/agent-comparison      — Agent-vs-agent performance
```

#### Step 6: Frontend — Intelligence Dashboard

Add new tab to `frontend/src/pages/Analytics.tsx`:

**"Intelligence" Tab:**
- Insight cards sorted by impact (high → low)
- Each card shows: title, description, confidence badge, recommendation
- Category filters
- "Refresh Insights" button
- Date range selector

**"Question Analysis" Sub-section:**
- Table: Question text | Times Asked | Avg Quality Score | Hire Correlation
- Sortable columns
- Click to expand: see sample answers from hired vs rejected

**"Agent Benchmarks" Sub-section:**
- Side-by-side agent comparison
- Metrics: Completion rate, avg duration, hire rate, sentiment
- Recommendation: which agent config works best

### Files to Modify

```
backend/src/routes/webhooks.routes.ts     — Add QA extraction after call completion
backend/src/routes/analytics.routes.ts    — New insight endpoints
backend/src/index.ts                      — Register insight worker
frontend/src/pages/Analytics.tsx          — New Intelligence tab
```

### New Files

```
backend/src/services/transcriptAnalyzer.service.ts — Extract Q&A pairs
backend/src/services/insightsGenerator.service.ts  — Generate insights
backend/src/jobs/insightsGenerator.job.ts          — Weekly background job
```

### Cost Consideration

Processing transcripts through LLM can be expensive at scale. Mitigations:
- Use gpt-4o-mini for QA extraction (high volume, simpler task)
- Use gpt-4o for insight generation (low volume, needs reasoning)
- Process incrementally (only new calls since last run)
- Cap at 200 transcripts per weekly run
- Store extracted QA pairs so transcripts don't need re-processing

---

## 6. Client Dashboard & Collaboration Portal

**Effort:** 4-6 days | **Complexity:** Medium | **Architectural Changes:** New auth role + RLS policies

### Problem

Clients (Ford, IT companies) ask "how many candidates do you have for my Java role?" via email/phone. Recruiters spend time compiling updates. Clients can't directly approve/reject candidates, slowing the pipeline.

### What Exists Today

- `client_companies` table with org_id scoping
- All job, application, call data linked via `client_company_id`
- Role-based auth: admin | recruiter | viewer
- Supabase RLS policies

### Implementation Plan

#### Step 1: Database Changes

```sql
-- Add client role support
ALTER TABLE users ADD COLUMN client_company_id UUID REFERENCES client_companies(id);
-- Non-null only for users with role = 'client'

-- Add client role to enum (if using enum, otherwise just allow the string)
-- role: 'admin' | 'recruiter' | 'viewer' | 'client'

-- Client invitations
CREATE TABLE client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  client_company_id UUID NOT NULL REFERENCES client_companies(id),
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',  -- pending | accepted | expired
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client feedback on candidates
CREATE TABLE client_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  application_id UUID NOT NULL REFERENCES applications(id),
  client_user_id UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,          -- "approve" | "reject" | "hold" | "interview_request"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Step 2: Backend — Supabase RLS Policies

```sql
-- Client users can only see their company's data
CREATE POLICY "client_see_own_jobs" ON jobs
  FOR SELECT TO authenticated
  USING (
    client_company_id = (SELECT client_company_id FROM users WHERE id = auth.uid())
    OR org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "client_see_own_applications" ON applications
  FOR SELECT TO authenticated
  USING (
    job_id IN (SELECT id FROM jobs WHERE client_company_id =
      (SELECT client_company_id FROM users WHERE id = auth.uid()))
    OR org_id = (SELECT org_id FROM users WHERE id = auth.uid())
  );

-- Similar policies for calls, call_evaluations, client_reports
```

#### Step 3: Backend — Client Auth & Middleware

Update `backend/src/middleware/auth.ts`:

```
- Add 'client' to allowed roles
- New middleware: requireClientAccess(req, res, next)
  - If user.role === 'client':
    - Attach user.client_company_id to request
    - All subsequent queries MUST filter by client_company_id
  - If user.role !== 'client': pass through (existing behavior)
```

#### Step 4: Backend — Client-Specific Routes

Create `backend/src/routes/clientPortal.routes.ts`:

```
-- All routes require role = 'client'

GET  /api/client/dashboard            — Overview for client's company
  Response: { open_jobs, total_candidates, pipeline_summary, recent_activity }

GET  /api/client/jobs                 — Client's jobs only
GET  /api/client/jobs/:id             — Job detail + applications
GET  /api/client/applications         — All applications for client's jobs
GET  /api/client/applications/:id     — Application detail (candidate info + screening + call)

POST /api/client/applications/:id/feedback — Submit approve/reject/hold decision
GET  /api/client/calls/:id            — Call recording + transcript (read-only)
GET  /api/client/reports              — Generated client reports
```

#### Step 5: Backend — Invitation Flow

Add to `backend/src/routes/companies.routes.ts`:

```
POST /api/companies/:id/invite-client   — Send invitation email
  Input: { email }
  1. Generate unique token
  2. Create client_invitations record (expires in 7 days)
  3. Send email with link: {FRONTEND_URL}/client-signup?token=xxx
  4. Log activity

POST /api/auth/client-signup            — Accept invitation
  Input: { token, password, full_name }
  1. Validate token (exists, not expired, pending)
  2. Create Supabase Auth user
  3. Create users record with role='client', client_company_id from invitation
  4. Mark invitation as accepted
```

#### Step 6: Frontend — Client Dashboard

Create `frontend/src/pages/ClientDashboard.tsx`:

- Simplified dashboard showing only their data
- KPIs: Open positions, candidates in pipeline, interviews scheduled, offers extended
- Pipeline view per job (how many candidates at each stage)
- Candidate cards: name, AI score, interview status, call recording link
- Action buttons: Approve / Reject / Request More Info
- Reports section: downloadable PDFs

Create `frontend/src/components/ClientLayout.tsx`:

- Simplified sidebar (no agent management, no candidate creation, no settings)
- Company branding if logo_url exists
- Navigation: Dashboard | Jobs | Candidates | Reports

#### Step 7: Frontend — Invitation UI

Update `Companies.tsx` or `CompanyDetailSheet`:

- "Invite Client User" button on company detail
- Email input + send invitation
- List of invited users (pending/accepted)

### Files to Modify

```
backend/src/middleware/auth.ts              — Add client role + scoping
backend/src/routes/auth.routes.ts           — Client signup endpoint
backend/src/routes/companies.routes.ts      — Invitation endpoint
backend/src/services/email.service.ts       — Invitation email template
backend/src/index.ts                        — Mount client portal routes
backend/src/types/index.ts                  — Add client role to types
frontend/src/App.tsx                        — Client routes + layout switch
frontend/src/contexts/AuthContext.tsx        — Handle client role routing
frontend/src/components/AppSidebar.tsx       — Conditional nav for client role
```

### New Files

```
backend/src/routes/clientPortal.routes.ts   — Client-specific endpoints
frontend/src/pages/ClientDashboard.tsx      — Client dashboard
frontend/src/components/ClientLayout.tsx    — Client navigation layout
frontend/src/pages/ClientSignup.tsx         — Invitation acceptance page
```

### Security Considerations

- Client users must NEVER see other clients' data
- Client users must NOT see internal recruiter notes or evaluations (only client_reports)
- Candidate personal info (phone, email) may need redaction until client approves
- Rate limit client API access separately
- Audit log all client actions

---

## 7. Candidate Self-Service Portal

**Effort:** 5-7 days | **Complexity:** Medium | **Architectural Changes:** New auth flow

### Problem

Recruiters spend time chasing candidates for updated info, fielding "what's my status?" questions, and manually collecting pre-screening answers. Candidates have no visibility into where they stand.

### What Exists Today

- `candidates` table with contact info
- `applications` with status tracking
- Email service (sends invitation emails)
- Cal.com integration for interview booking
- Supabase Auth (currently only for internal users)

### Implementation Plan

#### Step 1: Database Changes

```sql
-- Candidate authentication (separate from internal users)
CREATE TABLE candidate_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,              -- "magic_link" | "session"
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-screening questionnaire responses
CREATE TABLE pre_screening_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  org_id UUID NOT NULL REFERENCES organizations(id),

  responses JSONB NOT NULL,
  -- Example: [
  --   { question: "Are you authorized to work in the US?", answer: "Yes, H1B" },
  --   { question: "Expected salary range?", answer: "$120k-$140k" },
  --   { question: "Available start date?", answer: "2 weeks notice" }
  -- ]

  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-screening questionnaire templates (per job or company)
CREATE TABLE questionnaire_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  client_company_id UUID REFERENCES client_companies(id),
  job_id UUID REFERENCES jobs(id),   -- null = default for company/org
  name TEXT NOT NULL,
  questions JSONB NOT NULL,
  -- Example: [
  --   { id: "q1", text: "Are you authorized...", type: "select",
  --     options: ["US Citizen", "Green Card", "H1B", "Other"] },
  --   { id: "q2", text: "Expected salary?", type: "text" },
  --   { id: "q3", text: "Years of experience with Java?", type: "number" }
  -- ]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Step 2: Backend — Magic Link Auth

Create `backend/src/services/candidateAuth.service.ts`:

```
Function: sendMagicLink(candidateId, orgId)

1. Generate cryptographically random token (32 bytes, hex)
2. Store in candidate_auth_tokens (type: "magic_link", expires: 24h)
3. Build URL: {FRONTEND_URL}/candidate-portal?token=xxx
4. Send email to candidate with magic link
5. Log activity

Function: validateMagicLink(token)

1. Find token in candidate_auth_tokens
2. Check: not expired, not used
3. Mark token as used
4. Create session token (type: "session", expires: 7 days)
5. Return: { session_token, candidate_id, org_id }

Function: validateSession(sessionToken)

1. Find token (type: "session")
2. Check: not expired
3. Return: { candidate_id, org_id }
```

#### Step 3: Backend — Candidate Portal Middleware

Create `backend/src/middleware/candidateAuth.ts`:

```
Middleware: authenticateCandidate(req, res, next)

1. Extract token from Authorization header or cookie
2. Call validateSession(token)
3. Attach req.candidate = { id, org_id }
4. next()
```

#### Step 4: Backend — Portal API Routes

Create `backend/src/routes/candidatePortal.routes.ts`:

```
-- Auth
POST /api/candidate-portal/request-access   — Send magic link (input: email)
POST /api/candidate-portal/verify           — Validate magic link token
GET  /api/candidate-portal/me               — Get candidate profile

-- Profile
PATCH /api/candidate-portal/profile         — Update name, phone, location, work_auth
POST  /api/candidate-portal/resume          — Upload new resume

-- Applications
GET  /api/candidate-portal/applications     — List candidate's applications
  Response per application:
  - Job title, company name
  - Status (user-friendly labels: "Applied", "Under Review", "Interview Scheduled",
    "Interview Completed", "Shortlisted", "Not Selected")
  - Next steps text
  - Interview date (if scheduled)

-- Pre-Screening
GET  /api/candidate-portal/applications/:id/questionnaire — Get questionnaire for this job
POST /api/candidate-portal/applications/:id/questionnaire — Submit responses

-- Interview
GET  /api/candidate-portal/applications/:id/interview     — Get interview details
  Response: { scheduled_at, duration_estimate, what_to_expect_text, reschedule_url }
POST /api/candidate-portal/applications/:id/reschedule    — Request reschedule
```

#### Step 5: Frontend — Candidate Portal Pages

Create `frontend/src/pages/candidate-portal/`:

```
CandidateLogin.tsx        — Email input → magic link sent
CandidatePortalLayout.tsx — Simple, clean layout (no sidebar, minimal nav)
CandidateHome.tsx         — Welcome + application cards with status
CandidateProfile.tsx      — Edit personal info + upload resume
ApplicationStatus.tsx     — Detailed status for one application
PreScreening.tsx          — Questionnaire form
InterviewPrep.tsx         — Interview details + reschedule option
```

**Design considerations:**
- Mobile-first (candidates will access on phones)
- Minimal, reassuring UI (not the complex recruiter dashboard)
- Progress indicator showing where they are in the pipeline
- Friendly status labels (not internal jargon)
- Clear next-step instructions at every stage

#### Step 6: Integration with Existing Email Flow

Update `backend/src/services/email.service.ts`:

- Invitation email now includes: "Track your application status: {magic_link_url}"
- Add portal link to all candidate-facing emails
- New email template: "Complete your pre-screening questionnaire"

#### Step 7: Pre-Screening → AI Call Integration

Update `backend/src/services/call.service.ts` and `utils/retellPromptBuilder.ts`:

- When building dynamic variables for AI call, include pre-screening responses
- New variable: `{{pre_screening_answers}}` — formatted pre-screening Q&A
- AI agent can reference these during the call: "I see you mentioned your expected salary is $130k..."
- Reduces call duration by eliminating redundant mandate questions

### Files to Modify

```
backend/src/index.ts                          — Mount candidate portal routes
backend/src/services/email.service.ts         — Add portal links to emails
backend/src/services/call.service.ts          — Include pre-screening in call context
backend/src/utils/retellPromptBuilder.ts      — Add pre_screening_answers variable
frontend/src/App.tsx                          — Add candidate portal routes
```

### New Files

```
backend/src/services/candidateAuth.service.ts       — Magic link auth
backend/src/middleware/candidateAuth.ts              — Portal auth middleware
backend/src/routes/candidatePortal.routes.ts         — Portal API
frontend/src/pages/candidate-portal/CandidateLogin.tsx
frontend/src/pages/candidate-portal/CandidatePortalLayout.tsx
frontend/src/pages/candidate-portal/CandidateHome.tsx
frontend/src/pages/candidate-portal/CandidateProfile.tsx
frontend/src/pages/candidate-portal/ApplicationStatus.tsx
frontend/src/pages/candidate-portal/PreScreening.tsx
frontend/src/pages/candidate-portal/InterviewPrep.tsx
```

---

## 8. Multi-Stage Interview Pipeline

**Effort:** 7-10 days | **Complexity:** High | **Architectural Changes:** Core schema refactor

### Problem

Current pipeline is flat: `new → screening → interviewed → shortlisted → rejected → hired`. Real recruitment has multiple rounds. A client like Ford might need: Phone Screen → Technical → Behavioral → Client Interview. Currently, you can only run one AI call per application with one agent.

### What Exists Today

- `applications.status` — flat enum used across entire codebase
- `jobs.ai_agent_id` — single agent per job
- `calls` linked to applications — no stage context
- Kanban board with 6 fixed columns
- Webhook handlers that set status based on call completion

### Implementation Plan

> **WARNING:** This is the most invasive feature. It touches the core data model and affects
> routes, webhooks, frontend Kanban, and email triggers. Implement as opt-in per job to
> avoid breaking existing pipeline.

#### Step 1: Database Changes

```sql
-- Interview stage definitions (per job)
CREATE TABLE interview_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  stage_number INTEGER NOT NULL,       -- 1, 2, 3...
  name TEXT NOT NULL,                   -- "Phone Screen", "Technical", "Behavioral"
  type TEXT NOT NULL,                   -- "ai_call" | "human_interview" | "assessment" | "client_review"
  ai_agent_id UUID REFERENCES ai_agents(id),  -- Only for type = "ai_call"

  -- Pass/fail criteria
  auto_advance BOOLEAN DEFAULT false,   -- Auto-advance if criteria met?
  pass_criteria JSONB,
  -- Example: { min_screening_score: 7, required_sentiment: "Positive",
  --            min_call_duration_seconds: 120 }

  -- Configuration
  instructions TEXT,                    -- Instructions for this stage
  duration_estimate_minutes INTEGER,
  is_eliminatory BOOLEAN DEFAULT true,  -- Must pass to continue?

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, stage_number)
);

-- Track candidate progress through stages
CREATE TABLE application_stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id),
  stage_id UUID NOT NULL REFERENCES interview_stages(id),

  status TEXT NOT NULL DEFAULT 'pending',
  -- "pending" | "in_progress" | "passed" | "failed" | "skipped"

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_id UUID REFERENCES calls(id),       -- If stage involved a call
  evaluation_notes TEXT,
  evaluated_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id, stage_id)
);

-- Add stage context to jobs
ALTER TABLE jobs ADD COLUMN has_stages BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN total_stages INTEGER DEFAULT 0;

-- Add stage context to applications
ALTER TABLE applications ADD COLUMN current_stage_id UUID REFERENCES interview_stages(id);
ALTER TABLE applications ADD COLUMN current_stage_number INTEGER DEFAULT 0;

-- Add stage context to calls
ALTER TABLE calls ADD COLUMN stage_id UUID REFERENCES interview_stages(id);
```

#### Step 2: Backend — Stage Management Service

Create `backend/src/services/stageManager.service.ts`:

```
Function: createStagesForJob(jobId, stages[])
  - Validate stage order
  - Create interview_stages records
  - Update job: has_stages = true, total_stages = stages.length

Function: advanceCandidateToNextStage(applicationId)
  1. Get current stage progress
  2. Mark current stage as "passed"
  3. Find next stage (current_stage_number + 1)
  4. If next stage exists:
     a. Create application_stage_progress record (status: "pending")
     b. Update application.current_stage_id and current_stage_number
     c. If next stage type = "ai_call" and auto_advance = true:
        - Auto-schedule call with that stage's agent
     d. If next stage type = "client_review":
        - Notify client (if client portal exists)
     e. If next stage type = "human_interview":
        - Send scheduling email
  5. If no next stage:
     - All stages passed → application.status = "shortlisted"
     - Ready for final hire decision

Function: failCandidateAtStage(applicationId, stageId, notes)
  1. Mark stage as "failed"
  2. If stage is eliminatory: application.status = "rejected"
  3. If not eliminatory: skip to next stage

Function: evaluateAutoAdvance(callId, stageId)
  - Called after call completion webhook
  - Check call results against stage.pass_criteria
  - If all criteria met and auto_advance = true: advanceCandidateToNextStage()
  - Otherwise: mark as "in_progress", await recruiter decision
```

#### Step 3: Backend — Modify Existing Routes

Update `backend/src/routes/jobs.routes.ts`:

```
POST /api/jobs/:id/stages              — Create/update stages for a job
GET  /api/jobs/:id/stages              — Get stages with candidate counts per stage
DELETE /api/jobs/:id/stages/:stageId   — Remove a stage

-- Existing POST /api/jobs — accept optional stages[] in creation body
```

Update `backend/src/routes/applications.routes.ts`:

```
GET /api/applications/:id — Include stage progress in response
POST /api/applications/:id/advance-stage    — Manually advance to next stage
POST /api/applications/:id/fail-stage       — Manually fail at current stage

-- PATCH /api/applications/:id — Keep working for non-staged jobs (backward compat)
```

Update `backend/src/routes/calls.routes.ts`:

```
POST /api/calls/outbound — Accept optional stage_id param
-- When calling for a staged job, use that stage's agent (not job's default agent)
```

#### Step 4: Backend — Modify Webhook Handler

Update `backend/src/routes/webhooks.routes.ts` — retell/post-call:

```
After call completion:
1. Check if call.stage_id exists
2. If yes (staged job):
   - Update application_stage_progress (status based on call result)
   - Run evaluateAutoAdvance(callId, stageId)
   - Do NOT directly set application.status = "interviewed"
3. If no (legacy flat pipeline):
   - Keep existing behavior unchanged
```

#### Step 5: Frontend — Stage-Aware Kanban

Update `frontend/src/pages/Applications.tsx`:

```
Two modes:

1. "All Applications" view (default):
   - Existing Kanban with flat status columns
   - Non-staged jobs work exactly as before

2. "Job Pipeline" view (when viewing a specific staged job):
   - Columns = stage names (Stage 1: Phone Screen | Stage 2: Technical | ...)
   - Plus: "Not Started" and "Hired/Rejected" columns
   - Cards show: candidate name, stage status, AI score
   - Drag-and-drop to advance/fail (calls advanceCandidateToNextStage)
```

#### Step 6: Frontend — Stage Configuration UI

Update `CreateJobDialog.tsx` or create `StageConfigurator.tsx`:

```
"Interview Stages" section (optional, togglable):
- Add stage button
- Each stage: Name input, Type dropdown, Agent selector (if AI), Pass criteria
- Drag to reorder
- Preview: visual pipeline diagram
```

Update `JobDetailSheet.tsx`:

```
New "Pipeline" tab:
- Visual stage diagram (Stage 1 → Stage 2 → Stage 3 → Hired)
- Count of candidates at each stage
- Click stage to see candidates in that stage
```

#### Step 7: Backward Compatibility

**Critical:** Existing jobs without stages must continue working exactly as before.

```
All logic should check: job.has_stages === true
- If false: use existing flat pipeline (no changes)
- If true: use stage-based pipeline

This ensures zero breaking changes for existing data and workflows.
```

### Stage Templates (Pre-built)

Provide templates that recruiters can apply to jobs with one click:

```
Template: "Standard IT Screening"
  Stage 1: AI Phone Screen (conversational agent, 10 min)
  Stage 2: AI Technical Deep-Dive (technical agent, 20 min)
  Stage 3: Client Review (client approves/rejects)

Template: "Executive Hiring"
  Stage 1: AI Initial Screen (formal agent, 15 min)
  Stage 2: Human Panel Interview (manual scheduling)
  Stage 3: Client Interview (manual scheduling)
  Stage 4: Reference Check (assessment type)

Template: "High-Volume Hiring"
  Stage 1: AI Screen (conversational, 5 min, auto-advance if score > 7)
  Stage 2: Client Review (bulk approve/reject)
```

### Files to Modify

```
backend/src/routes/jobs.routes.ts              — Stage CRUD
backend/src/routes/applications.routes.ts      — Stage advancement
backend/src/routes/calls.routes.ts             — Stage-aware call initiation
backend/src/routes/webhooks.routes.ts          — Stage-aware post-call handling
backend/src/services/call.service.ts           — Use stage agent instead of job agent
backend/src/utils/retellPromptBuilder.ts       — Include stage context in prompt
backend/src/index.ts                           — Mount new routes
backend/src/types/index.ts                     — New types

frontend/src/pages/Applications.tsx            — Dual-mode Kanban
frontend/src/components/CreateJobDialog.tsx     — Stage configuration
frontend/src/components/JobDetailSheet.tsx      — Pipeline visualization
frontend/src/components/ApplicationDetailSheet.tsx — Stage progress view
```

### New Files

```
backend/src/services/stageManager.service.ts   — Stage advancement logic
backend/src/routes/stages.routes.ts            — Stage management API (optional, can be under jobs)
frontend/src/components/StageConfigurator.tsx   — Stage setup UI
frontend/src/components/StagePipeline.tsx       — Visual pipeline diagram
```

---

## Appendix: Shared Infrastructure Needs

### New npm Dependencies

| Feature | Package | Purpose |
|---------|---------|---------|
| #2 Client Reports | `pdfkit` or `@react-pdf/renderer` | PDF generation |
| #4 Duplicate Detection | `string-similarity` | Fuzzy name matching |
| #7 Candidate Portal | `crypto` (built-in) | Magic link token generation |

### Database Migration Order

Run in this order to avoid FK conflicts:

1. Feature #1: ALTER jobs (add priority, deadline), ALTER calls (add priority_score)
2. Feature #2: CREATE client_reports
3. Feature #3: CREATE job_candidate_matches
4. Feature #4: CREATE duplicate_groups, duplicate_group_members, ALTER candidates
5. Feature #5: CREATE insights, interview_qa_pairs
6. Feature #6: ALTER users, CREATE client_invitations, client_feedback
7. Feature #7: CREATE candidate_auth_tokens, pre_screening_responses, questionnaire_templates
8. Feature #8: CREATE interview_stages, application_stage_progress, ALTER jobs, applications, calls

### Environment Variables to Add

```
# Feature #2 - Reports (optional, for branded PDFs)
COMPANY_LOGO_URL=

# Feature #7 - Candidate Portal
CANDIDATE_PORTAL_URL=        # If hosted separately from recruiter dashboard
MAGIC_LINK_EXPIRY_HOURS=24

# Feature #5 - Insights
OPENROUTER_INSIGHTS_MODEL=openai/gpt-4o   # Better model for analysis
INSIGHTS_MAX_TRANSCRIPTS=200               # Cap per weekly run
```

---

## Implementation Checklist

Use this checklist when you're ready to implement each feature:

- [ ] **Feature 1: Smart Scheduling** (1-2 days)
  - [ ] Add priority + deadline columns to jobs
  - [ ] Add priority_score to calls
  - [ ] Create scheduler.service.ts
  - [ ] Modify callScheduler.job.ts for priority ordering
  - [ ] Update batch endpoint
  - [ ] Add priority/deadline to job creation UI
  - [ ] Add priority indicator to calls page

- [ ] **Feature 2: Client Reports** (2-3 days)
  - [ ] Create client_reports table
  - [ ] Create reportGenerator.service.ts
  - [ ] Create pdfGenerator.service.ts
  - [ ] Create reports.routes.ts
  - [ ] Add "Generate Report" button to CallDetailSheet
  - [ ] Add report list to ApplicationDetailSheet
  - [ ] Create Reports page (optional)

- [ ] **Feature 3: Auto-Matching** (2-3 days)
  - [ ] Create job_candidate_matches table
  - [ ] Create matching.service.ts
  - [ ] Create candidateMatcher.job.ts
  - [ ] Add match endpoints to jobs routes
  - [ ] Add "Recommended Candidates" tab to JobDetailSheet
  - [ ] Auto-trigger on job creation/sync

- [ ] **Feature 4: Duplicate & Fraud Detection** (4-5 days)
  - [ ] Create duplicate_groups + member tables
  - [ ] Add fraud_flags + fraud_score to candidates
  - [ ] Create duplicateDetection.service.ts
  - [ ] Create fraudDetection.service.ts
  - [ ] Create duplicateChecker.job.ts
  - [ ] Create duplicates.routes.ts
  - [ ] Auto-trigger on candidate creation
  - [ ] Create Duplicates page with merge UI
  - [ ] Add warning badges to CandidateDetailSheet

- [ ] **Feature 5: Conversation Intelligence** (4-5 days)
  - [ ] Create insights + interview_qa_pairs tables
  - [ ] Create transcriptAnalyzer.service.ts
  - [ ] Create insightsGenerator.service.ts
  - [ ] Create insightsGenerator.job.ts (weekly)
  - [ ] Add insight endpoints to analytics routes
  - [ ] Add Intelligence tab to Analytics page
  - [ ] Hook QA extraction into post-call webhook

- [ ] **Feature 6: Client Dashboard** (4-6 days)
  - [ ] Add client_company_id to users + client role
  - [ ] Create client_invitations + client_feedback tables
  - [ ] Add Supabase RLS policies for client access
  - [ ] Update auth middleware for client role
  - [ ] Create clientPortal.routes.ts
  - [ ] Create invitation flow (backend + email)
  - [ ] Create ClientDashboard page
  - [ ] Create ClientLayout component
  - [ ] Add invitation UI to company management

- [ ] **Feature 7: Candidate Self-Service Portal** (5-7 days)
  - [ ] Create candidate_auth_tokens table
  - [ ] Create pre_screening_responses + questionnaire_templates tables
  - [ ] Create candidateAuth.service.ts
  - [ ] Create candidateAuth middleware
  - [ ] Create candidatePortal.routes.ts
  - [ ] Create all portal frontend pages (7 pages)
  - [ ] Update email templates with portal links
  - [ ] Integrate pre-screening into AI call context

- [ ] **Feature 8: Multi-Stage Pipeline** (7-10 days)
  - [ ] Create interview_stages + application_stage_progress tables
  - [ ] Add has_stages, total_stages to jobs
  - [ ] Add current_stage_id, current_stage_number to applications
  - [ ] Add stage_id to calls
  - [ ] Create stageManager.service.ts
  - [ ] Add stage CRUD to jobs routes
  - [ ] Add advance/fail to applications routes
  - [ ] Modify call initiation for stage-aware agent selection
  - [ ] Modify post-call webhook for auto-advancement
  - [ ] Create StageConfigurator component
  - [ ] Create StagePipeline visualization
  - [ ] Add dual-mode Kanban (flat vs staged)
  - [ ] Ensure backward compatibility for non-staged jobs
  - [ ] Create stage templates

---

> **Total estimated effort: 30-40 days for all 8 features**
>
> Recommended approach: Implement one feature at a time, deploy, gather feedback,
> then move to the next. Don't try to build all 8 in parallel.
