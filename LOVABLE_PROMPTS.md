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

## After Lovable finishes
Pull the Lovable changes and run `make validate` locally — it should still pass with 0 errors.
The 53 pre-existing `any` warnings should drop substantially after Prompt 4.
