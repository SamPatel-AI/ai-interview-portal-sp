import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface CeipalJob {
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
  employment_type?: string;
  job_status?: string;
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

/**
 * Authenticate with CEIPAL API and get an access token.
 */
async function getCeipalToken(): Promise<string> {
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
  let numPages = 1;

  // CEIPAL paginates getJobPostingsList (default 20/page). Loop until all pages
  // are fetched so we don't silently miss older jobs.
  do {
    const url = new URL('https://api.ceipal.com/v1/getJobPostingsList');
    if (searchKey) url.searchParams.set('searchkey', searchKey);
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

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
 * Fetch all clients from CEIPAL (getClientsList, paginated).
 */
async function fetchCeipalClients(token: string): Promise<CeipalClient[]> {
  const all: CeipalClient[] = [];
  let page = 1;
  let numPages = 1;
  do {
    const url = new URL('https://api.ceipal.com/v1/getClientsList/');
    url.searchParams.set('page', String(page));
    const response = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
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
 * Fetch the job codes belonging to one client via the `client` filter on
 * getJobPostingsList. This is the only CEIPAL API surface that exposes the
 * job->client link (the job-posting detail itself carries no client field).
 */
async function fetchClientJobCodes(token: string, clientId: string): Promise<string[]> {
  const codes: string[] = [];
  let page = 1;
  let numPages = 1;
  do {
    // `client` must be the raw encoded id; verified that this param actually
    // filters the result set (other param names are silently ignored).
    const url = `https://api.ceipal.com/v1/getJobPostingsList?client=${clientId}&page=${page}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!response.ok) break; // a single client failing shouldn't abort the whole sync
    const data = (await response.json()) as { results?: CeipalJob[]; num_pages?: number };
    for (const j of data.results || []) if (j.job_code) codes.push(j.job_code);
    numPages = data.num_pages || 1;
    page += 1;
  } while (page <= numPages && page <= 50);
  return codes;
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
): Promise<{ clientCount: number; jobCodeToClientId: Map<string, string> }> {
  const clients = await fetchCeipalClients(token);
  const jobCodeToClientId = new Map<string, string>();
  let clientCount = 0;

  for (const c of clients) {
    if (!c.name) continue;

    const { data: byCeipal } = await supabaseAdmin
      .from('client_companies')
      .select('id')
      .eq('org_id', orgId)
      .eq('ceipal_company_id', c.id)
      .maybeSingle();
    let ourId = byCeipal?.id as string | undefined;

    if (!ourId) {
      const { data: byName } = await supabaseAdmin
        .from('client_companies')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', c.name)
        .maybeSingle();
      if (byName?.id) {
        ourId = byName.id;
        await supabaseAdmin
          .from('client_companies')
          .update({ ceipal_company_id: c.id })
          .eq('id', ourId);
      } else {
        const { data: created } = await supabaseAdmin
          .from('client_companies')
          .insert({ org_id: orgId, name: c.name, ceipal_company_id: c.id })
          .select('id')
          .single();
        ourId = created?.id;
      }
    }
    if (!ourId) continue;
    clientCount++;

    for (const code of await fetchClientJobCodes(token, c.id)) {
      jobCodeToClientId.set(code, ourId);
    }
  }

  return { clientCount, jobCodeToClientId };
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
}> {
  logger.info(`Starting CEIPAL sync for org ${orgId}`);

  const token = await getCeipalToken();

  // Sync clients first and build job_code -> our client_company.id. CEIPAL only
  // exposes the job->client link via the `client` filter on the job list, so we
  // resolve it here once for every client and look it up per job below.
  const { clientCount, jobCodeToClientId } = await syncCeipalClients(orgId, token);

  const ceipalJobs = await fetchCeipalJobs(token);

  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const cJob of ceipalJobs) {
    const jobCode = cJob.job_code || '';
    const description = cleanHtmlDescription(cJob.public_job_desc || cJob.requisition_description || '');
    const skills = cJob.skills ? cJob.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    // Explicit override (clientCompanyId arg) wins; otherwise use the resolved
    // CEIPAL client. Falls back to null (unassigned) when the job has no client.
    const resolvedClientId = clientCompanyId || jobCodeToClientId.get(jobCode) || null;
    if (resolvedClientId) linked++;

    const fields = {
      title: cJob.public_job_title || cJob.position_title,
      description,
      skills,
      location: cJob.city || null,
      state: cJob.state || null,
      country: cJob.country || null,
      tax_terms: cJob.tax_terms || null,
      employment_type: mapEmploymentType(cJob.employment_type),
      status: mapJobStatus(cJob.job_status),
      pay_rate: formatPayRate(cJob.pay_rates),
      // Keep the Business Unit id for reference; client linkage is client_company_id.
      ceipal_company_id: cJob.company != null ? String(cJob.company) : null,
      client_company_id: resolvedClientId,
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
      await supabaseAdmin.from('jobs').update(fields).eq('id', existing.id);
      updated++;
    } else {
      await supabaseAdmin.from('jobs').insert({
        org_id: orgId,
        ceipal_job_id: jobCode,
        ...fields,
      });
      created++;
    }
  }

  logger.info(
    `CEIPAL sync complete: ${clientCount} clients, ${ceipalJobs.length} jobs found, ${created} created, ${updated} updated, ${linked} linked to a client`,
  );

  return { synced: ceipalJobs.length, created, updated, clients: clientCount, linked };
}

/**
 * Fetch a single job from CEIPAL by job code.
 */
export async function fetchCeipalJob(jobCode: string): Promise<CeipalJob | null> {
  const token = await getCeipalToken();
  const jobs = await fetchCeipalJobs(token, `JPC - ${jobCode}`);
  return jobs.length > 0 ? jobs[0] : null;
}
