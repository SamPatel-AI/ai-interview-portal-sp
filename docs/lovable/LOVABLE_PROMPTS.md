# Lovable Cleanup Prompts

Copy-paste each prompt into Lovable **one at a time**, in order. Each is scoped to a single
concern — Lovable produces better results with focused tasks than with one big request.

Every prompt restates the project's architecture rules so Lovable doesn't violate them:
- **Data flow:** Page → Hook → Service → API. Never call `fetch`/`axios`/`supabase` from a page or component.
- **Barrel imports only:** import from `@/domains/{name}`, never from `@/domains/{name}/services` or `/hooks`.
- **Atomic Design sizes:** pages < 150 LOC, organisms 150–500 LOC, molecules 50–150, atoms < 50.
- **Constants** live in `src/lib/constants.ts` — no magic values in components.
- **Never edit** `src/components/ui/` (shadcn primitives).

---

## Prompt 1 — Move the analytics CSV export into the domain layer (data-flow fix)

> In `src/pages/Analytics.tsx`, the `handleExport` function calls `fetch()` directly and reaches
> into `@/lib/supabase` for the auth token. This violates our Page → Hook → Service → API rule.
>
> Refactor it:
> 1. In `src/domains/analytics/services/analytics.service.ts`, add an `exportReport(type: string): Promise<Blob>`
>    function that uses our shared `api` client from `@/lib/api` (which already attaches the JWT) to
>    GET `/api/reports/export?type=${type}` with `responseType: 'blob'`. Do not build the auth header by hand.
> 2. In `src/domains/analytics/hooks/useAnalytics.ts`, add a `useExportReport()` mutation hook wrapping
>    that service call. Export it from the analytics barrel (`src/domains/analytics/index.ts`).
> 3. In `Analytics.tsx`, replace the inline `fetch` logic with the new hook. Keep the
>    blob → object URL → download-link click behaviour, but trigger it from the mutation's `onSuccess`.
>
> Do not change any other behaviour. Import the hook only from `@/domains/analytics`.

---

## Prompt 2 — Break up ApplicationDetailSheet (674 LOC → under 500)

> `src/components/organisms/applications/ApplicationDetailSheet.tsx` is ~674 lines, over our 500-line
> organism limit. Decompose it without changing behaviour or the public props of `ApplicationDetailSheet`.
>
> 1. Move all the local interfaces at the top of the file (`ScreeningResult`, `CallEvaluation`,
>    `CallDetail`, `EmailLog`, `AppDetail`) into `src/domains/applications/types.ts` and export them
>    from the applications barrel. Import them back via `@/domains/applications`.
> 2. Split the body into focused sub-components in the same folder
>    (`src/components/organisms/applications/`), e.g.:
>    - `ApplicationScreeningPanel.tsx` (AI screening result section)
>    - `ApplicationCallsPanel.tsx` (calls + evaluations section)
>    - `ApplicationEmailsPanel.tsx` (email log section)
>    `ApplicationDetailSheet` should compose these. Each sub-component takes typed props — no `any`.
> 3. Keep all data fetching in the existing hook (`@/domains/applications`); sub-components receive
>    data via props, they must not fetch on their own.
>
> Result: `ApplicationDetailSheet.tsx` under 500 lines, each new sub-component 50–500 lines.

---

## Prompt 3 — Slim down the oversized pages (target < 150 LOC each)

> These pages exceed our 150-line page limit because rendering logic lives inline instead of in
> organisms: `Applications.tsx` (~351), `Analytics.tsx` (~335), `Reengagement.tsx` (~218),
> `Calls.tsx` (~202), `Emails.tsx` (~194), `Dashboard.tsx` (~185).
>
> For each page, extract the large inline JSX blocks (tables, filter bars, chart groups, stat-card
> grids) into data-aware organisms under `src/components/organisms/{domain}/`. The page should keep
> only: hook calls for data, top-level layout, and composition of those organisms. Pass data and
> callbacks to organisms via typed props.
>
> Rules: keep importing hooks only from `@/domains/{name}`; organisms receive data via props (don't
> move hooks into them unless the organism is genuinely self-contained); don't change behaviour or
> styling. Do them one page at a time, starting with `Applications.tsx`.

---

## Prompt 4 — Replace `any` types with real types

> Several pages/components use `any`, which defeats our type safety. Fix these by using or adding
> proper types (put shared shapes in the relevant `src/domains/{name}/types.ts` and import from the barrel):
> - `Dashboard.tsx` — `recentActivity.map((item: any) ...)`, `pipeline.map((p: any) ...)`
> - `Analytics.tsx` — `catch (e: any)`, `callOutcomes.map((entry: any, i) ...)`, the local `RecruiterWorkload` interface (move it to `src/domains/analytics/types.ts`)
> - `Reengagement.tsx` — `jobs.map((j: any) ...)` and the other `any` casts
> - `Jobs.tsx`, `Settings.tsx` — the remaining `any` casts
>
> Define accurate interfaces based on what the API returns and what each `.map` accesses. Don't use
> `any` or `unknown`-without-narrowing. Don't change runtime behaviour.

---

## Prompt 5 — Delete dead components

> These two components are never imported or mounted anywhere — delete them:
> - `src/components/organisms/jobs/CreateJobDialog.tsx`
> - `src/components/organisms/companies/CreateCompanyDialog.tsx`
>
> Before deleting, double-check there are no imports of them anywhere in `src/`. If you find any, stop
> and tell me instead of deleting. Remove any now-unused exports that referenced them.

---

## After Lovable finishes (Prompts 1–5)
Pull the Lovable changes and run `make validate` locally — it should still pass with 0 errors.
The 53 pre-existing `any` warnings should drop substantially after Prompt 4.

---

# Re-add features lost in the merge (Prompts 6–7)

> **Context:** Prompts 1–5 were built on an older snapshot that was missing two
> small features from the backend branch. The backend endpoints for both already
> exist — these prompts only rebuild the frontend, the right way (through the
> domain layer, not inline `fetch`/`apiRequest` in the page/component).

## Prompt 6 — Re-add the "Recruiter Workload" analytics tab

> Add a new **"Recruiter Workload"** tab to `src/pages/Analytics.tsx`, between the
> "Overview" and "My Performance" tabs. It must follow our Page → Hook → Service → API rule.
>
> 1. In `src/domains/analytics/services/analytics.service.ts`, add
>    `getRecruiterWorkload()` that uses the shared `api` client from `@/lib/api` to
>    GET `/api/analytics/recruiters` and returns the `data` array. Each item has:
>    `{ id, full_name, email, role, avatar_url, open_applications, total_calls, pending_evaluations }`.
>    Add a `RecruiterWorkload` interface to `src/domains/analytics/types.ts` for this shape.
> 2. In `src/domains/analytics/hooks/useAnalytics.ts`, add a `useRecruiterWorkload()`
>    query hook wrapping it, and export both the hook and the type from the analytics
>    barrel (`src/domains/analytics/index.ts`).
> 3. In `Analytics.tsx`, add the tab. Import only from `@/domains/analytics`. Render:
>    - a horizontal `BarChart` (recharts) of all recruiters with three series —
>      `open_applications` ("Open Applications"), `total_calls` ("Total Calls"),
>      `pending_evaluations` ("Pending Reviews");
>    - below it, a responsive grid of per-recruiter cards showing `full_name`, `email`,
>      and the three counts with small icons (Briefcase / PhoneCall / ClipboardList).
>    - an empty state ("No recruiter data available") when the list is empty.
>
> Keep it under our sizing limits — if the tab's JSX is large, extract it into a
> data-aware organism `src/components/organisms/analytics/RecruiterWorkloadTab.tsx`
> that receives the data via typed props (no `any`), and have the page call the hook
> and pass the data in. Don't call `apiRequest`/`fetch` from the page or organism.

## Prompt 7 — Re-add the "Assigned Recruiter" reassignment control

> In the application detail view (`src/components/organisms/applications/ApplicationDetailSheet.tsx`
> and its sub-panels), add an **"Assigned Recruiter"** section so a user can reassign
> the application to another recruiter. Follow Page/Sheet → Hook → Service → API.
>
> 1. The application detail object has an `assigned_recruiter_id: string | null` field —
>    add it to the `AppDetail` type in `src/domains/applications/types.ts` if missing.
> 2. Recruiter list: add a service+hook to fetch org recruiters — GET `/api/users`
>    returns `{ id, full_name, email, role }`; filter to `role === 'admin' || role === 'recruiter'`.
>    If a team/users domain hook already exists for this, reuse it; otherwise add
>    `useTeamRecruiters()` in the most appropriate existing domain and export it from its barrel.
> 3. Reassign mutation: in `src/domains/applications/services/applications.service.ts` add
>    `assignRecruiter(applicationId, recruiterId)` → POST `/api/applications/${id}/assign`
>    with body `{ recruiter_id }`. Wrap it in a `useAssignRecruiter()` mutation hook in the
>    applications domain that invalidates the application detail query on success and shows a
>    toast. Export from the applications barrel.
> 4. UI: add an "Assigned Recruiter" section (a labelled `Select` of recruiters, value bound to
>    `assigned_recruiter_id`, placeholder "Unassigned") near the "Recruiter Notes" section of the
>    detail sheet. Use the shadcn `Select`. On change, call the mutation. Use a `UserCheck` icon
>    for the heading. No `any`, no inline `apiRequest`.
>
> Don't change other behaviour or the public props of `ApplicationDetailSheet`.

## After Prompts 6–7
Pull and run `make validate` again — still 0 errors expected. The two features should be
back, now routed through the domain layer instead of inline calls.

---

# Remove manual "Add Candidate" (Prompt 8)

> **Context:** Candidates should only enter the system through the automated intake
> (email/resume webhooks), never created by hand. Remove the manual "Add Candidate"
> UI entirely.

## Prompt 8 — Remove the "Add Candidate" feature

> Remove the ability to manually add a candidate from the UI. Candidates now come only
> from the automated intake pipeline, so there should be no "Add Candidate" form anywhere.
>
> 1. In `src/pages/Candidates.tsx`:
>    - Delete the entire `Dialog` containing the "Add Candidate" button and the "Add New
>      Candidate" form (the `<Dialog open={dialogOpen} ...>` block, including its trigger button).
>    - Delete the related state and handler: `dialogOpen`, `firstName`, `lastName`, `email`,
>      `phone`, `source`, `resumeFile`, the `handleCreate` function, and the
>      `createMutation` / `uploadMutation` declarations.
>    - In the "No candidates yet" `EmptyState`, remove the `actionLabel` and `onAction` props
>      and change the description to something like "Candidates appear here automatically as
>      they're imported from email and resume submissions."
>    - Remove now-unused imports: `Dialog*`, `Label`, `Select*` (only if not used elsewhere in
>      the file), `Plus`, `Upload`, `useCreateCandidate`, `useUploadResume`, and the
>      `CreateCandidateInput` type import. Keep `Search`, `Users`, the table, and
>      `CandidateDetailSheet`. The page header should keep just the search box.
> 2. In `src/components/templates/DashboardLayout.tsx`: remove the `<DropdownMenuItem>New
>    Candidate</DropdownMenuItem>` from the "New" dropdown. Leave "New Job" and "New Agent".
> 3. In the candidates domain, remove the now-dead manual-create code:
>    - `useCreateCandidate` (in `src/domains/candidates/hooks/useCandidates.ts`) and its export
>      from the barrel `src/domains/candidates/index.ts`.
>    - `createCandidate` and any `checkDuplicates` function in
>      `src/domains/candidates/services/candidates.service.ts`.
>    - The `CreateCandidateInput` type in `src/domains/candidates/types.ts` and its barrel export.
>    - Keep `updateCandidate`, `useUploadResume`, and all read hooks/types — those are still used.
>    - If removing `CreateCandidateInput` breaks `updateCandidate`'s param type, give
>      `updateCandidate` its own inline `Partial<>` type instead.
>
> Don't change the candidates table, detail sheet, or the intake/webhook behaviour.
> After this, there must be no way to create a candidate from the UI.

## After Prompt 8
Pull and run `make validate` — 0 errors expected. Then tell me, and I'll remove the matching
backend endpoints (`POST /api/candidates` and `POST /api/candidates/check-duplicates`) so manual
creation is fully gone server-side too. The webhook intake stays untouched.
