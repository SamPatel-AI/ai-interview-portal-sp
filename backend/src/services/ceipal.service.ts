import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface CeipalJob {
  id?: string; // CEIPAL's opaque job-posting id (== a submission's job_id)
  position_title: string;
  public_job_title?: string;
  public_job_desc?: string;
  requisition_description?: string;
  skills: string;
  city?: string;
  state: string;
  country: string;
  postal_code?: string;
  tax_terms: string;
  job_code: string;
  company?: number | string;
  /** Comma-separated encoded CEIPAL user ids the job is assigned to. */
  assigned_recruiter?: string;
  employment_type?: string;
  job_status?: string;
  modified?: string;
  created?: string;
  pay_rates?: Array<{ pay_rate_currency?: string; pay_rate?: string; min_pay_rate?: string; max_pay_rate?: string }>;
}

function mapEmploymentType(v?: string): 'full_time' | 'contract' | 'c2c' | 'w2' {
  const s = (v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.includes('c2c')) return 'c2c';
  if (s.includes('w2')) return 'w2';
  if (s.includes('contract')) return 'contract';
  return 'full_time';
}

function mapJobStatus(v?: string): 'open' | 'closed' | 'on_hold' | 'filled' {
  const s = (v || '').toLowerCase();
  if (s.includes('hold')) return 'on_hold';
  if (s.includes('fill')) return 'filled';
  if (s.includes('clos')) return 'closed';
  return 'open'; // 'Active' / 'Open Until Filled' / default
}

function formatPayRate(rates?: CeipalJob['pay_rates']): string | null {
  if (!rates || !rates.length) return null;
  const r = rates[0];
  const cur = (r.pay_rate_currency || '').trim();
  const ok = (x?: string) => (x || '').trim() && (x || '').trim().toUpperCase() !== 'N/A' ? (x || '').trim() : '';
  const min = ok(r.min_pay_rate), max = ok(r.max_pay_rate), single = ok(r.pay_rate);
  if (min && max) return `${cur} ${min} - ${max}`.trim();
  if (single) return `${cur} ${single}`.trim();
  if (max) return `${cur} ${max}`.trim();
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a CEIPAL endpoint with throttling + exponential backoff on 429.
 * CEIPAL rate-limits aggressively; a small inter-call delay plus backoff keeps
 * the call-heavy client sync from tripping the limiter.
 */
async function ceipalGet(url: string, token: string, maxRetries = 5): Promise<Response> {
  let response: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (response.status !== 429) return response;
    // 429 → wait (1s, 2s, 4s, 8s, 16s, capped) then retry.
    await sleep(Math.min(1000 * 2 ** attempt, 20000));
  }
  return response as Response; // last response (still 429) — caller decides
}

/**
 * Authenticate with CEIPAL API and get an access token.
 */
export async function getCeipalToken(): Promise<string> {
  const response = await fetch('https://api.ceipal.com/v1/createAuthtoken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      email: env.CEIPAL_EMAIL,
      password: env.CEIPAL_PASSWORD,
      api_key: env.CEIPAL_API_KEY,
    }),
  });

  if (!response.ok) throw new Error(`CEIPAL auth failed: ${response.status}`);

  const text = await response.text();

  // CEIPAL returns XML - extract access_token
  const tokenMatch = text.match(/<access_token>([^<]+)<\/access_token>/);
  if (!tokenMatch) throw new Error('Failed to extract CEIPAL access token');

  return tokenMatch[1];
}

/**
 * Fetch jobs from CEIPAL API.
 */
async function fetchCeipalJobs(token: string, searchKey?: string): Promise<CeipalJob[]> {
  const all: CeipalJob[] = [];
  let page = 1;
  let numPages: number;

  // CEIPAL paginates getJobPostingsList (default 20/page). Loop until all pages
  // are fetched so we don't silently miss older jobs.
  do {
    const url = new URL('https://api.ceipal.com/v1/getJobPostingsList');
    if (searchKey) url.searchParams.set('searchkey', searchKey);
    url.searchParams.set('page', String(page));

    const response = await ceipalGet(url.toString(), token);

    if (!response.ok) throw new Error(`CEIPAL jobs fetch failed: ${response.status}`);

    const data = await response.json() as { results?: CeipalJob[]; num_pages?: number };
    all.push(...(data.results || []));
    numPages = data.num_pages || 1;
    page += 1;
  } while (page <= numPages && page <= 100); // hard cap as a runaway guard

  return all;
}

interface CeipalClient {
  id: string; // CEIPAL's encoded client id, used as ?client= filter + our ceipal_company_id
  name: string;
}

/**
 * Normalize a company name for duplicate detection: lowercase, strip
 * punctuation + common legal/structural suffix words, fold "motors"→"motor"
 * (Ford Motors ↔ Ford Motor Company), collapse whitespace. Conservative on
 * purpose — we only want to merge clear variants of the SAME company, never
 * distinct companies.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group|technologies|technology|consulting|services)\b/g, ' ')
    .replace(/\bmotors\b/g, 'motor')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch all clients from CEIPAL (getClientsList, paginated).
 */
async function fetchCeipalClients(token: string): Promise<CeipalClient[]> {
  const all: CeipalClient[] = [];
  let page = 1;
  let numPages: number;
  do {
    const url = new URL('https://api.ceipal.com/v1/getClientsList/');
    url.searchParams.set('page', String(page));
    const response = await ceipalGet(url.toString(), token);
    if (!response.ok) throw new Error(`CEIPAL clients fetch failed: ${response.status}`);
    const data = (await response.json()) as {
      results?: Array<{ id?: string; name?: string }>;
      num_pages?: number;
    };
    for (const c of data.results || []) {
      if (c.id && c.name) all.push({ id: String(c.id), name: String(c.name).trim() });
    }
    numPages = data.num_pages || 1;
    page += 1;
  } while (page <= numPages && page <= 50);
  return all;
}

/**
 * Total number of job postings (unfiltered). Used by the client-filter guard to
 * detect if the `client=` filter is being ignored (returns the full set).
 */
async function fetchTotalJobCount(token: string): Promise<number> {
  const r = await ceipalGet('https://api.ceipal.com/v1/getJobPostingsList?page=1', token);
  if (!r.ok) return 0;
  const data = (await r.json()) as { results?: unknown[]; count?: number };
  return data.count ?? (data.results?.length || 0);
}

/**
 * Fetch the job codes belonging to one client via the `client` filter on
 * getJobPostingsList. This is the only CEIPAL API surface that exposes the
 * job->client link (the job-posting detail itself carries no client field).
 * `client=` is UNDOCUMENTED but verified to filter; the caller guards against
 * it being silently ignored (see syncCeipalClients).
 */
async function fetchClientJobCodes(
  token: string,
  clientId: string,
): Promise<{ codes: string[]; count: number }> {
  const codes: string[] = [];
  let page = 1;
  let numPages: number;
  let count = 0;
  do {
    // `client` must be the raw encoded id; verified that this param actually
    // filters the result set (other param names are silently ignored).
    const url = `https://api.ceipal.com/v1/getJobPostingsList?client=${clientId}&page=${page}`;
    const response = await ceipalGet(url, token);
    if (!response.ok) break; // a single client failing shouldn't abort the whole sync
    const data = (await response.json()) as {
      results?: CeipalJob[];
      num_pages?: number;
      count?: number;
    };
    if (page === 1) count = data.count ?? (data.results?.length || 0);
    for (const j of data.results || []) if (j.job_code) codes.push(j.job_code);
    numPages = data.num_pages || 1;
    page += 1;
  } while (page <= numPages && page <= 50);
  return { codes, count };
}

/**
 * Sync CEIPAL clients into client_companies and build a job_code -> our
 * client_company.id map (so each job can be linked to its real end client).
 * Matches an existing client by ceipal_company_id, else by name (to absorb
 * manually-created clients), else inserts a new one.
 */
async function syncCeipalClients(
  orgId: string,
  token: string,
): Promise<{
  clientCount: number;
  jobCodeToClientId: Map<string, string>;
  filterIgnoredClients: number;
  merged: number;
}> {
  const clients = await fetchCeipalClients(token);
  const jobCodeToClientId = new Map<string, string>();
  let clientCount = 0;
  let merged = 0;

  // Guard baseline: how many jobs exist unfiltered. If a `client=`-filtered
  // request returns this same total, the filter was ignored and we must NOT map
  // (it would mislink every job to one client).
  const totalJobs = await fetchTotalJobCount(token);
  let filterIgnoredClients = 0;

  // Load all existing companies once so we can match by ceipal id OR normalized
  // name (catches pre-existing/manually-created clients) and merge duplicates.
  const { data: existingRows } = await supabaseAdmin
    .from('client_companies')
    .select('id, name, ceipal_company_id')
    .eq('org_id', orgId);
  const existing: Array<{ id: string; name: string; ceipal_company_id: string | null }> =
    existingRows ?? [];

  for (const c of clients) {
    if (!c.name) continue;
    const cNorm = normalizeCompanyName(c.name);

    // Matches: same CEIPAL id, or same normalized name.
    const matches = existing.filter(
      (e) => e.ceipal_company_id === c.id || normalizeCompanyName(e.name) === cNorm,
    );

    let canonicalId: string | undefined;
    if (matches.length === 0) {
      const { data: created } = await supabaseAdmin
        .from('client_companies')
        .insert({ org_id: orgId, name: c.name, ceipal_company_id: c.id })
        .select('id, name, ceipal_company_id')
        .single();
      if (created) {
        existing.push(created);
        canonicalId = created.id;
      }
    } else {
      // Prefer the row already tagged with this CEIPAL id, else keep the first
      // (preserves a user's original company name). Tag it with the CEIPAL id.
      const canonical = matches.find((m) => m.ceipal_company_id === c.id) ?? matches[0];
      canonicalId = canonical.id;
      if (canonical.ceipal_company_id !== c.id) {
        await supabaseAdmin
          .from('client_companies')
          .update({ ceipal_company_id: c.id })
          .eq('id', canonical.id);
        canonical.ceipal_company_id = c.id;
      }
      // Soft-merge any sibling duplicates into the canonical: reassign their
      // jobs + agents, then leave the now-empty sibling in place (the portal
      // hides zero-job companies). No deletes → no unique company is lost.
      for (const sib of matches) {
        if (sib.id === canonical.id) continue;
        await supabaseAdmin
          .from('jobs')
          .update({ client_company_id: canonical.id })
          .eq('org_id', orgId)
          .eq('client_company_id', sib.id);
        await supabaseAdmin
          .from('ai_agents')
          .update({ client_company_id: canonical.id })
          .eq('org_id', orgId)
          .eq('client_company_id', sib.id);
        merged++;
      }
    }
    if (!canonicalId) continue;
    clientCount++;

    const { codes, count } = await fetchClientJobCodes(token, c.id);
    // Filter-ignored guard: a real client returns a subset; if it returns the
    // entire job set, the `client=` param was dropped — skip to avoid mislinking.
    if (totalJobs > 0 && count >= totalJobs) {
      filterIgnoredClients++;
      continue;
    }
    for (const code of codes) jobCodeToClientId.set(code, canonicalId);

    await sleep(250); // be polite to CEIPAL's rate limiter between clients
  }

  return { clientCount, jobCodeToClientId, filterIgnoredClients, merged };
}

/**
 * Clean HTML from CEIPAL job descriptions.
 */
function cleanHtmlDescription(html: string): string {
  let text = html;
  text = text.replace(/<\/h[1-3]>/gi, '\n\n');
  text = text.replace(/<h[1-3][^>]*>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&ndash;/g, '-');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&quot;/g, '"');
  return text.split('\n').map(l => l.trimEnd()).filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

/**
 * Sync all open jobs from CEIPAL into our database for a given org.
 */
export async function syncCeipalJobs(orgId: string, clientCompanyId?: string): Promise<{
  synced: number;
  created: number;
  updated: number;
  clients: number;
  linked: number;
  skipped: number;
}> {
  logger.info(`Starting CEIPAL sync for org ${orgId}`);

  const token = await getCeipalToken();

  // Sync clients first and build job_code -> our client_company.id. CEIPAL only
  // exposes the job->client link via the `client` filter on the job list, so we
  // resolve it here once for every client and look it up per job below.
  const { clientCount, jobCodeToClientId, filterIgnoredClients, merged } = await syncCeipalClients(
    orgId,
    token,
  );
  if (merged > 0) logger.info(`CEIPAL sync merged ${merged} duplicate client row(s)`);
  if (filterIgnoredClients > 0) {
    logger.warn(
      `CEIPAL client= filter appears unreliable: ${filterIgnoredClients} client(s) returned the full job set. Those jobs are left unassigned rather than mislinked.`,
    );
  }

  const ceipalJobs = await fetchCeipalJobs(token);

  let created = 0;
  let updated = 0;
  let linked = 0;
  let skipped = 0;

  for (const cJob of ceipalJobs) {
    const jobCode = cJob.job_code || '';
    const status = mapJobStatus(cJob.job_status);
    const isOpen = status === 'open';
    // Store CEIPAL's modified date so the portal can filter the recency window
    // (30/60/90 days) at query time. CEIPAL leaves old reqs flagged Active, so
    // this date — not status — is what tells live work from history.
    const modifiedRaw = cJob.modified || cJob.created;
    const modifiedAt = modifiedRaw && !Number.isNaN(new Date(modifiedRaw).getTime())
      ? new Date(modifiedRaw).toISOString()
      : null;
    const description = cleanHtmlDescription(cJob.public_job_desc || cJob.requisition_description || '');
    const skills = cJob.skills ? cJob.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    // Explicit override (clientCompanyId arg) wins; otherwise use the resolved
    // CEIPAL client. Falls back to null (unassigned) when the job has no client.
    const resolvedClientId = clientCompanyId || jobCodeToClientId.get(jobCode) || null;

    const fields = {
      title: cJob.public_job_title || cJob.position_title,
      description,
      skills,
      location: cJob.city || null,
      state: cJob.state || null,
      country: cJob.country || null,
      tax_terms: cJob.tax_terms || null,
      employment_type: mapEmploymentType(cJob.employment_type),
      status,
      pay_rate: formatPayRate(cJob.pay_rates),
      // Keep the Business Unit id for reference; client linkage is client_company_id.
      ceipal_company_id: cJob.company != null ? String(cJob.company) : null,
      // Opaque CEIPAL posting id — lets a submission's job_id map directly to this job.
      ceipal_job_uuid: cJob.id || null,
      // Assigned-recruiter ids — the mail-intake gate checks our recruiter is on the job.
      ceipal_assigned_recruiters: cJob.assigned_recruiter || null,
      client_company_id: resolvedClientId,
      ceipal_modified_at: modifiedAt,
      synced_at: new Date().toISOString(),
    };

    // Check if job already exists
    const { data: existing } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('org_id', orgId)
      .eq('ceipal_job_id', jobCode)
      .single();

    if (existing) {
      // Always keep existing rows current (a job that closed gets status=closed
      // and is then hidden by the open-only views).
      await supabaseAdmin.from('jobs').update(fields).eq('id', existing.id);
      updated++;
      if (isOpen && resolvedClientId) linked++;
    } else if (isOpen) {
      // Only ingest OPEN postings — skip closed/filled/on-hold history so the
      // pipeline tracks live reqs, not CEIPAL's full archive.
      await supabaseAdmin.from('jobs').insert({
        org_id: orgId,
        ceipal_job_id: jobCode,
        ...fields,
      });
      created++;
      if (resolvedClientId) linked++;
    } else {
      skipped++;
    }
  }

  logger.info(
    `CEIPAL sync complete: ${clientCount} clients, ${ceipalJobs.length} found, ${created} created, ${updated} updated, ${skipped} non-open skipped, ${linked} open jobs linked to a client`,
  );

  return { synced: ceipalJobs.length, created, updated, clients: clientCount, linked, skipped };
}

// (The former getSubmissionsList/getApplicantDetails intake helpers were
// removed with the retired ceipalSubmissionsPoll job: that API surface is a
// frozen data set with no job code or candidate identity. Candidate intake now
// reads CEIPAL notification emails via Graph — see jobs/ceipalMailPoll.job.ts.)
