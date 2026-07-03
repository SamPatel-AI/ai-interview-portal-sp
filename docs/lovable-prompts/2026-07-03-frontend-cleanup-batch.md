# Lovable prompt batch — pre-handoff frontend cleanup (2026-07-03)

Run these one at a time, in order. Each restates the architecture rules so
Lovable doesn't violate them. Verify the build is green in Lovable after each
prompt before running the next.

Architecture rules to include with every prompt:
- Data flow: Page → Hook → Service → API. Never call `fetch`/`apiRequest`/`supabase` directly from a page or component.
- Import only from domain barrels (`@/domains/{name}`), never from `/hooks` or `/services` subpaths.
- Constants (status colors, labels) live in `src/lib/constants.ts` — no local copies.
- Never edit `src/components/ui/` (shadcn primitives).

---

## Prompt 1 — Application detail sheet must render pipeline_stage (consistency bug)

> The Applications list and kanban render each application's stage from the
> backend-computed `pipeline_stage` + `sub_status` fields
> (see `applicationListHelpers.ts` and `ApplicationsKanban.tsx`), but
> `components/organisms/applications/ApplicationDetailSheet.tsx` still renders
> its progress tracker from the legacy `status` field with a hardcoded
> `new → screening → interviewed → shortlisted` sequence. The same application
> can show a different stage in the drawer than on the board.
>
> Rework the detail sheet's stage/progress display to use `pipeline_stage`
> (new / in_progress / interviewed / failed / shortlisted / archived) and show
> `sub_status` as a small badge when present. Reuse the same stage→label and
> stage→color mappings the list/kanban use — move them into
> `src/lib/constants.ts` if they aren't there already, and import from there in
> both places. Do not re-derive stages on the client; render exactly what the
> API returns.

## Prompt 2 — Sanitize the email HTML render (XSS)

> `src/pages/Emails.tsx` renders `selectedEmail.body` with
> `dangerouslySetInnerHTML` and no sanitization. Email bodies can contain
> candidate-influenced content, so this is an XSS vector.
>
> Add `dompurify` and sanitize the HTML before rendering
> (`DOMPurify.sanitize(selectedEmail.body)`); keep the existing styling.

## Prompt 3 — Collapse detail-sheet organisms onto the existing domain hooks

> Six organisms bypass our Page → Hook → Service → API rule by calling
> `apiRequest` inline with their own `useQuery`/`useMutation`, duplicating
> hooks that already exist in the domains:
> - `organisms/jobs/JobDetailSheet.tsx` → use `useJob` from `@/domains/jobs`
> - `organisms/candidates/CandidateDetailSheet.tsx` → use `useCandidate`
> - `organisms/companies/CompanyDetailSheet.tsx` → use `useCompany`
> - `organisms/calls/CallDetailSheet.tsx` → use `useCall`
> - `organisms/applications/ApplicationDetailSheet.tsx` → replace its four
>   inline mutations with `useScreenApplication`, `useApproveInterview`,
>   `useUpdateApplication` from `@/domains/applications`
> - `organisms/agents/AgentBuilder.tsx` → use `useCompanies` for its company list
>
> Also de-duplicate: `getScore()` is reimplemented in JobDetailSheet and
> CandidateDetailSheet — import the canonical one from the applications domain
> helpers. Local status/color maps in JobDetailSheet, CompanyDetailSheet,
> CallDetailSheet, Calls.tsx, and Dashboard.tsx should import from
> `src/lib/constants.ts` instead. Keep behavior identical; this is a
> refactor, not a redesign.

## Prompt 4 — Settings page: remove the placeholders

> In `src/pages/Settings.tsx`: the Profile "Save Changes", "Change Avatar",
> and Organization "Save" buttons have no handlers, and the entire
> Integrations tab is hardcoded (static "Connected" badges, inert buttons).
> A client will click these and file bugs.
>
> 1. Remove the Integrations tab entirely.
> 2. Wire Profile save: PATCH the user's `full_name` via the existing users
>    domain (add the hook/service if missing, following the domain pattern).
>    Remove "Change Avatar" (no backend support).
> 3. Organization tab: make it read-only display of the org name (no backend
>    endpoint for renaming yet) and remove its Save button.

## Prompt 5 — Delete dead frontend code

> Remove code that is verified unused:
> - `src/pages/Index.tsx` (not routed; `App.tsx` handles `/` with a redirect)
> - In `domains/settings/hooks/useSettings.ts`: `useSchedulingSettings` and
>   `useUpdateSchedulingSettings` (aliases; components use
>   `useSchedulingConfig`/`useUpdateSchedulingConfig`)
> - In the analytics domain barrel: `useRecruiterWorkloads` (plural — unused;
>   the singular `useRecruiterWorkload` is the one in use)
> - In `domains/agents/hooks/useAgents.ts`: the `/409/.test(err.message)`
>   branch (the API layer rewrites error messages, so it never fires) — keep
>   the plain error toast.
> Do NOT remove hooks that Prompt 3 just started using (useJob, useCandidate,
> useCompany, useCall, useScreenApplication).

## After the batch

Run through: open an application in both kanban and drawer (stages match),
view an email (renders safely), Settings has no dead buttons, `/signup` is
gone, app builds green.
