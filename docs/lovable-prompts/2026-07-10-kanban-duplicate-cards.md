# Lovable prompt — fix Kanban cards rendering 5× (client-reported "duplicate entries")

Run this prompt in Lovable any time (no backend dependency). Background: the Pipeline page's Kanban view fires five `useApplications({ pipeline_stage: ... })` queries — one per column — but the backend `GET /api/applications` **ignores the `pipeline_stage` parameter entirely** (it's a derived field computed server-side per row, never a filter). All five queries therefore return the identical first page of applications, the page concatenates them, and every card renders five times in its column. The client reported this as "duplicate entries in In Progress" after clicking Send Invite.

---

On the Pipeline page (`src/pages/Applications.tsx`), the Kanban view creates five queries with `useApplications({ pipeline_stage: 'new' })`, `'in_progress'`, `'interviewed'`, `'failed'`, `'shortlisted'`, then concatenates all five results into `kanbanApps`. The backend does not filter by `pipeline_stage` — it returns the same page of applications for all five, so every card appears 5 times. Please fix it, keeping the architecture rules: Page → Hook → Service → API (never skip a layer), import domain hooks only from the domain barrel (`@/domains/applications`), no magic values in components (use `src/lib/constants.ts`), and do not touch anything under `components/ui/`.

1. Replace the five per-stage queries with a **single** query for the Kanban view. Each returned application already carries its server-derived `pipeline_stage`, and `ApplicationsKanban` already groups by it (`columnFor(a.pipeline_stage)`), so no per-stage fetching is needed. `kanbanApps` becomes just that one query's `data`.

2. The Kanban board is not paginated, so give this query a larger page than the table view's default: allow `useApplications` (and `fetchApplications` in the service) to accept an explicit `limit`, add a `PAGE_SIZE.XL = 100` constant to `src/lib/constants.ts` (reuse an existing constant if one at 100 already exists), and pass it for the Kanban query. Do not exceed 100 — the backend caps `limit` at 100.

3. Remove the now-unused `pipeline_stage` param from `useApplications`/`fetchApplications` signatures so nobody reintroduces a filter the API silently ignores. Archived applications need no special handling: `columnFor` already returns null for `archived` and the card is simply not rendered.

4. Update the Kanban branches of `isLoading` / `error` in `Applications.tsx` to use the single query.

5. Sanity check after the change: with one recruiter account, the In Progress column must show each candidate exactly once, and the React key warning for duplicate `key={app.id}` must be gone from the console.
