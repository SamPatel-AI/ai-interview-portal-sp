# Lovable prompt — assign an AI agent to a job from the job detail sheet

Run this prompt in Lovable any time (backend already supports it — `PATCH /api/jobs/:id` accepts `ai_agent_id`, nullable, and the call service uses the job's agent, falling back to the org default). Background: client asked how to link one of the three AI agents to a specific job; today the Jobs UI only displays the agent read-only, so every job silently uses the org's default agent.

---

Recruiters need to assign an AI interview agent to a specific job. The backend fully supports it: `PATCH /api/jobs/:id` with `{ ai_agent_id: "<uuid>" }` (or `null` to fall back to the org's default agent), and the jobs API already returns the current agent in `ai_agents`. Please add the UI, keeping the architecture rules: Page → Hook → Service → API, import hooks only from domain barrels (`@/domains/jobs`, `@/domains/agents`), no magic values in components, don't touch `components/ui/`.

1. In `src/components/organisms/jobs/JobDetailSheet.tsx`, the AI agent is currently displayed read-only. Replace that display with a shadcn `Select`:
   - Options come from `useAgents()` (from `@/domains/agents`) — show each agent's name; include a first option "Default agent" that maps to `null`.
   - Current value is `job.ai_agents?.id ?? null`.
   - On change, call the existing `useUpdateJob()` mutation (from `@/domains/jobs`) with `{ id: job.id, ai_agent_id: <selected id or null> }`. The mutation already invalidates job queries and toasts on success/failure — don't duplicate that.
   - Disable the Select while the mutation is pending.

2. In `src/pages/Jobs.tsx`, keep the agent column read-only as is (it shows `j.ai_agents?.name ?? 'None'`); change the fallback label from "None" to "Default" so it reflects what actually happens on a call (the org default agent runs the interview when no agent is assigned).

3. Do not add agent assignment to job creation for now — assignment from the detail sheet is enough.
