# Final Feature Completion — Fix All Missing Functionality

The API integration is working great. Now we need to complete the missing features. The backend supports all these endpoints already — we just need the frontend UI.

---

## 1. CRITICAL: Calls Page — Add Call Detail View with Audio, Transcript & Evaluation

The Calls page currently only shows a list. This is the recruiter's SECOND most important screen (where they review AI interview results and make decisions). We need a call detail view.

### Add a Call Detail Dialog/Sheet
When a recruiter clicks on any call row, open a **Sheet (slide-over panel from the right, full height)** with:

**Fetch data from:** `GET /api/calls/{callId}`

The response includes: `transcript`, `recording_url`, `call_analysis`, `candidates`, `call_evaluations[]`, `resumption_calls[]`, `parent_call`

**Layout of the Call Detail Sheet:**

**Header:**
- Candidate name + job title
- Direction badge (inbound/outbound)
- Status badge (color-coded)
- Duration + date/time
- If status is "interrupted" or "failed": show a **"Retry Call"** button that calls `POST /api/calls/{id}/retry`

**Audio Player Section:**
- Full-width HTML5 audio player using the `recording_url` field as src
- The URL is a direct WAV link (e.g., `https://dxc03zgurdly9.cloudfront.net/.../recording.wav`)
- Add playback speed buttons: 1x, 1.5x, 2x
- Simple implementation:
```tsx
<audio controls src={call.recording_url} className="w-full" />
```

**Transcript Section:**
- Parse the `transcript` string (format: "Agent: text\nUser: text\n")
- Display as chat bubbles:
  - Agent messages: left-aligned, blue/indigo background
  - User messages: right-aligned, gray background
- If `transcript_object` exists (array of objects with `role` and `content`), use that for better parsing
- Make the transcript section scrollable with max height

**AI Analysis Section** (if `call_analysis` exists):
- Call Summary text
- Candidate Sentiment badge (Positive/Neutral/Negative with green/gray/red colors)
- Call Successful: green checkmark or red X
- Callback Requested: if true, show "Callback requested" with time

**Evaluation Section:**
- If `call_evaluations[]` is empty, show the **evaluation form**:
  - 4 large decision buttons in a row:
    - ✅ Advance (green)
    - ❌ Reject (red)
    - 🔄 Callback (yellow)
    - ⏸️ Hold (gray)
  - Star rating (1-5 stars, clickable)
  - Notes textarea
  - Submit button → `POST /api/calls/{id}/evaluate` with body:
    ```json
    { "application_id": "from the call data", "decision": "advance", "rating": 4, "notes": "Good candidate" }
    ```
  - On success: show toast "Evaluation submitted", close sheet, refresh calls list

- If `call_evaluations[]` has data, show it **read-only**:
  - Decision badge
  - Star rating display
  - Notes text
  - "Evaluated by [name] on [date]"

**Call Chain Section** (if `is_resumption` is true or `resumption_calls[]` has items):
- Show a simple timeline: "Original Call (interrupted) → Resumed Call (completed)"
- Link to parent/child calls

### Also add to the Calls list:
- **"Call Now"** button next to the search bar that opens a dialog:
  - Application selector (search candidates with active applications)
  - "Call Now" button → `POST /api/calls/outbound` with body `{ application_id }`
  - On success: show toast "Call initiated", refresh list

- **"Schedule Call"** button:
  - Application selector
  - Date/time picker
  - Submit → `POST /api/calls/schedule` with body `{ application_id, scheduled_at }`

---

## 2. CRITICAL: AI Agent Builder — Full Create/Edit Form

### Replace the "Create New Agent" button with a working flow

When "Create New Agent" is clicked, navigate to a **new page** or open a **large dialog** with the full agent builder form:

**Section 1: Basic Info**
- Agent name (text input, required)
- Client company (dropdown, fetch from `GET /api/companies`)
- Interview style (3 radio cards: Formal / Conversational / Technical)
- Active toggle (default: on)

**Section 2: Voice Selection**
- Fetch voices from `GET /api/agents/voices`
- Display as a grid of selectable cards
- Each card shows: voice name, gender icon, accent/language
- Clicking a card selects it (highlighted border)
- Store the selected `voice_id`

**Section 3: Prompt Configuration**
- Large textarea (min 10 rows) for the system prompt
- Above the textarea, show clickable chips for template variables:
  `{{candidate_name}}` `{{job_title}}` `{{company_name}}` `{{mandate_questions}}` `{{interview_questions}}` `{{call_context}}`
  Clicking a chip inserts it at the cursor position in the textarea
- "Reset to Default" button that fills in this default prompt:
```
You are a professional AI screening interviewer working on behalf of {{company_name}}. You are conducting a first-round screening interview for the {{job_title}} position.

Candidate: {{candidate_name}}

Instructions:
1. Greet the candidate warmly and confirm their identity
2. Explain this is a 15-20 minute screening interview
3. Ask the mandatory screening questions first
4. Then proceed with role-specific interview questions
5. Allow the candidate to ask questions at the end
6. Thank them and explain next steps

Mandatory Questions:
{{mandate_questions}}

Interview Questions:
{{interview_questions}}

{{call_context}}

Guidelines:
- Be professional but conversational
- Listen actively and ask follow-ups when answers are vague
- Keep track of time - aim to finish within 20 minutes
```
- Greeting template textarea (optional)
- Closing template textarea (optional)

**Section 4: Call Settings**
- Max call duration: Slider from 5 to 60 minutes (default 20), show current value
- Language: Dropdown with options: English (US), English (UK), English (IN), Hindi, Spanish, French, German, etc.

**Section 5: Evaluation Criteria**
- List of criteria, each with:
  - Name (text input)
  - Description (text input)
  - Weight (slider 0 to 1, step 0.05)
- Default 5 criteria pre-filled:
  - Technical Fit (0.30)
  - Communication (0.20)
  - Experience Relevance (0.25)
  - Cultural Fit (0.15)
  - Enthusiasm (0.10)
- "Add Criteria" button to add more rows
- "Remove" button on each row

**Save Button:**
- Calls `POST /api/agents` with body:
```json
{
  "name": "...",
  "client_company_id": "uuid or null",
  "system_prompt": "...",
  "voice_id": "...",
  "language": "en-US",
  "interview_style": "conversational",
  "max_call_duration_sec": 1200,
  "evaluation_criteria": { "categories": [...] },
  "greeting_template": "...",
  "closing_template": "..."
}
```
- On success: toast "Agent created successfully", navigate back to agents list

### "Configure" button on existing agent cards
- Opens the same form but pre-filled with agent data from `GET /api/agents/{id}`
- Save calls `PATCH /api/agents/{id}` instead of POST
- Add a "Delete Agent" button (red, with confirmation dialog) → `DELETE /api/agents/{id}`

---

## 3. IMPORTANT: Add Job Creation Form

When "Add Job" is clicked on the Jobs page, open a dialog with:
- Title (required)
- Description (textarea)
- Client company (dropdown from `GET /api/companies`)
- Skills (tag input — type and press Enter to add chips)
- Location, State, Country (text inputs)
- Employment type (dropdown: Full Time, Contract, C2C, W2)
- Tax terms (text input)
- AI Agent (dropdown from `GET /api/agents?active_only=true`)
- Submit → `POST /api/jobs`

---

## 4. IMPORTANT: Add Company Creation Form

When "Add Company" is clicked on the Companies page, open a dialog with:
- Company name (required)
- Description (textarea)
- Logo URL (text input, optional)
- Submit → `POST /api/companies`

---

## 5. IMPORTANT: Add Candidate Detail View

When a candidate row is clicked on the Candidates page, open a **Sheet** showing:
- Fetch from `GET /api/candidates/{id}`
- Header: Full name, email, phone, location, source badge
- Resume section: if resume_url exists, show "View Resume" link
- Resume text preview (if resume_text exists, show first 500 chars in a collapsible)
- Applications list: show all applications with job title, status badge, screening score
- Call history: list of calls with status, duration, date

---

## 6. IMPORTANT: Add AI Screening Trigger on Applications

On the Application Detail (when clicking an application card on the Kanban/table):
- If `ai_screening_score` is null, show a prominent **"Screen with AI"** button
- Clicking it calls `POST /api/applications/{id}/screen`
- Show a loading spinner ("Analyzing resume...")
- On success: display the screening results inline:
  - Large score number (0-10, color-coded)
  - Strengths list (green bullets)
  - Weaknesses list (red bullets)
  - Risk factor badge + explanation
  - Reward factor badge + explanation
  - Justification text

---

## 7. NICE TO HAVE: Analytics Tabs

### Recruiter Performance tab:
- Dropdown to select a recruiter (fetch from users in the org via GET /api/auth/me for now, or hardcode current user)
- Fetch `GET /api/analytics/recruiter/{id}`
- Show: total applications, completed calls, avg call duration, evaluations list

### Agent Performance tab:
- Dropdown to select an agent (fetch from `GET /api/agents`)
- Fetch `GET /api/analytics/job/{id}` (closest available)
- Show: total calls, success rate, avg duration

---

## General Notes
- All new forms should include proper validation (required fields, email format, etc.)
- All mutations should show success/error toasts
- All new dialogs/sheets should have proper close/cancel buttons
- Invalidate relevant React Query caches after mutations (queryClient.invalidateQueries)
- Use the existing shadcn/ui components (Sheet, Dialog, Tabs, Badge, etc.)
