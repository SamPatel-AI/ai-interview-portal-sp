# Runbook — credential rotation

Rotate every credential here (a) at ownership handoff, (b) on any suspected
leak, (c) on staff departure, or (d) on your normal rotation cadence. Each
section says where to regenerate, where the value lives, and how to verify.

**General rules**

- Rotate one credential at a time and verify before the next — parallel
  rotations make failures ambiguous.
- Railway redeploys the backend automatically when a variable changes; wait for
  the deploy to go green, then verify with
  `GET https://<backend-domain>/health/ready` (expects `{"status":"ok"}` with
  `database` and `redis` both `ok`).
- Store new values only in your secrets vault and the env stores below — never
  in the repo, docs, tickets, or chat.
- Env vars live in **Railway** (service `ai-interview-portal-sp`, environment
  `production`) unless noted. The full variable reference is
  `backend/.env.example`.

---

## 1. Supabase service-role key (`SUPABASE_SERVICE_ROLE_KEY`)

The highest-value secret: full DB + storage access, bypasses RLS.

1. Supabase Dashboard → Project Settings → API keys.
   - On the legacy JWT-based keys, "regenerate" rotates the project **JWT
     secret**, which invalidates the **anon key too** — plan for step 3.
     If the project has been migrated to publishable/secret API keys, rotate
     just the secret key and skip step 3.
2. Update Railway `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_ANON_KEY` /
   `SUPABASE_JWT_SECRET` if those are set and the JWT secret changed).
3. If the anon key changed: update the frontend's `VITE_SUPABASE_ANON_KEY`
   (Lovable project env) and republish the frontend.
4. Verify: `/health/ready` green; log in to the portal (login exercises the
   anon key + JWT validation); open any candidate (exercises service-role
   reads).

## 2. Retell — API key (`RETELL_API_KEY`) and webhook signing key (`RETELL_WEBHOOK_KEY`)

Retell holds two keys with distinct roles: the key named **"Interview Portal"**
is used for API calls; the key **tagged "Webhook"** in the Retell dashboard is
what Retell signs webhooks with. They rotate independently.

1. Retell Dashboard → API Keys → create the replacement key, then delete the
   old one (Retell keys don't expire on their own).
2. Update Railway: `RETELL_API_KEY` (API key) and/or `RETELL_WEBHOOK_KEY`
   (whichever key is tagged Webhook after rotation). If a stale
   `RETELL_WEBHOOK_SECRET` variable still exists in Railway, delete it — the
   backend reads `RETELL_WEBHOOK_KEY` (falls back to `RETELL_API_KEY` when
   unset).
3. Verify API key: open Agents in the portal (lists live Retell agents), or
   place a test call from the agent builder.
4. Verify webhook key: place a test call and confirm in Railway logs that
   `/api/webhooks/retell/post-call` returns 200 (a signature mismatch logs a
   verification failure and the transcript never lands).

## 3. Webhook shared secret (`WEBHOOK_SHARED_SECRET`)

Protects `/api/webhooks/candidate-intake` and `/api/webhooks/cal-booking`.
Self-issued — generate with `openssl rand -hex 32`.

1. Update Railway `WEBHOOK_SHARED_SECRET`.
2. Update every sender to pass the new value in the `x-webhook-secret` header:
   the Cal.com webhook config (Cal.com → Settings → Developer → Webhooks) and
   any intake automations (n8n/Zapier) if in use.
3. Verify: make a test Cal.com booking; confirm 200 in Railway logs (auth
   failures reject with 401 — webhooks fail closed in production).

## 4. OpenRouter (`OPENROUTER_API_KEY`)

1. openrouter.ai → Keys → create new, delete old.
2. Update Railway `OPENROUTER_API_KEY`.
3. Verify: run "Screen" on any application; a screening result should land
   (failures log `Auto-screening failed`).

## 5. Microsoft Graph client secret (`MS_GRAPH_CLIENT_SECRET`)

Sends all outbound email and polls the CEIPAL intake inbox.

1. Azure Portal → Microsoft Entra ID → App registrations → the portal's app
   (client id = Railway `MS_GRAPH_CLIENT_ID`) → Certificates & secrets → new
   client secret. Note: Azure secrets have expiry dates — record it; this
   rotation recurs.
2. Update Railway `MS_GRAPH_CLIENT_SECRET`. Delete the old secret in Azure
   after verification.
3. Verify: send any portal email (e.g. re-send an invitation) and confirm
   `Email delivered via Microsoft Graph` in Railway logs; the CEIPAL mail
   poller logs `CEIPAL mail intake: polling …` at startup without Graph auth
   errors.

## 6. Cal.com API key (`CAL_API_KEY`)

1. Cal.com → Settings → Developer → API keys → create new, revoke old.
2. Update Railway `CAL_API_KEY`.
3. Verify: startup checks log no `CAL_API_KEY` warning; a booking moved past a
   job's interview deadline gets cancelled upstream (or simply confirm a
   test booking round-trips).

## 7. CEIPAL credentials (`CEIPAL_API_KEY`, `CEIPAL_EMAIL`, `CEIPAL_PASSWORD`)

1. Rotate the API key / account password in CEIPAL admin.
2. Update the Railway variables.
3. Verify: run a CEIPAL job sync from the portal and confirm jobs refresh.

## 8. Portal superadmin password

1. Log in to the portal → change password (or Supabase Dashboard →
   Authentication → Users → reset).
2. Store only in the owning team's vault.
3. Verify: fresh login works; old password rejected.

## 9. Redis (`REDIS_URL`)

Managed inside Railway; rotates only if you re-provision the Redis service.
After re-provisioning, update `REDIS_URL` and verify `/health/ready` reports
`redis: ok` and queued work (calls page, email sends) still drains.

---

## Post-rotation checklist

- [ ] `/health/ready` green
- [ ] Portal login works (new superadmin password)
- [ ] Test call: created, webhook accepted, transcript stored
- [ ] Test email delivered via Graph
- [ ] Screening runs (OpenRouter)
- [ ] CEIPAL sync runs
- [ ] Old keys deleted/revoked at each provider (not just replaced)
- [ ] No secret committed anywhere (`git status`, vault updated)
