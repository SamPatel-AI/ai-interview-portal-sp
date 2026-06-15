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
}> {
  logger.info(`Starting CEIPAL sync for org ${orgId}`);

  const token = await getCeipalToken();
  const ceipalJobs = await fetchCeipalJobs(token);

  // Map CEIPAL company id -> our client_company id, so jobs auto-link to the
  // right client when that client has been tagged with its ceipal_company_id.
  const { data: clients } = await supabaseAdmin
    .from('client_companies')
    .select('id, ceipal_company_id')
    .eq('org_id', orgId)
    .not('ceipal_company_id', 'is', null);
  const clientByCeipalId = new Map<string, string>();
  for (const c of clients ?? []) {
    if (c.ceipal_company_id) clientByCeipalId.set(String(c.ceipal_company_id), c.id);
  }

  let created = 0;
  let updated = 0;

  for (const cJob of ceipalJobs) {
    const jobCode = cJob.job_code || '';
    const description = cleanHtmlDescription(cJob.public_job_desc || cJob.requisition_description || '');
    const skills = cJob.skills ? cJob.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

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
      ceipal_company_id: cJob.company != null ? String(cJob.company) : null,
      // Auto-link to the client whose ceipal_company_id matches this job's company.
      ...(cJob.company != null && clientByCeipalId.has(String(cJob.company))
        ? { client_company_id: clientByCeipalId.get(String(cJob.company)) }
        : {}),
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
        client_company_id: clientCompanyId || null,
        ceipal_job_id: jobCode,
        ...fields,
      });
      created++;
    }
  }

  logger.info(`CEIPAL sync complete: ${ceipalJobs.length} found, ${created} created, ${updated} updated`);

  return { synced: ceipalJobs.length, created, updated };
}

/**
 * Fetch a single job from CEIPAL by job code.
 */
export async function fetchCeipalJob(jobCode: string): Promise<CeipalJob | null> {
  const token = await getCeipalToken();
  const jobs = await fetchCeipalJobs(token, `JPC - ${jobCode}`);
  return jobs.length > 0 ? jobs[0] : null;
}

/**
 * TEMPORARY discovery helper — runs only from the Railway backend (CEIPAL
 * rate-limits other IPs). It answers two unknowns needed to auto-link jobs to
 * their END client (not the Business Unit `company` id, which is identical for
 * every job):
 *   1. Which field in the list response holds the internal posting id.
 *   2. Which param `getJobPostingDetails` expects, and which field in its
 *      response holds the client / end-customer name.
 * It is READ-ONLY (no DB writes) and will be removed once the field names are
 * confirmed. Hit it once on Railway and paste the JSON back.
 */
export async function discoverCeipalClientField(): Promise<unknown> {
  const token = await getCeipalToken();

  // Raw list (untyped) so we can see every key CEIPAL actually returns.
  const listRes = await fetch('https://api.ceipal.com/v1/getJobPostingsList?page=1', {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const listJson = (await listRes.json()) as { results?: Record<string, unknown>[] };
  const first = listJson.results?.[0] ?? {};

  // Candidate id fields on the list item that might key the detail call.
  const idFieldCandidates = ['id', 'job_id', 'job_posting_id', 'posting_id', 'jpid'];
  const idSources = idFieldCandidates
    .filter((f) => first[f] != null)
    .map((f) => ({ field: f, value: first[f] }));

  // Candidate param names for getJobPostingDetails. Try each id source against
  // each param name until one returns a non-error object.
  const paramCandidates = ['job_id', 'posting_id', 'id'];
  const attempts: Array<Record<string, unknown>> = [];
  let detailKeys: string[] | null = null;
  let detailSample: Record<string, unknown> | null = null;

  outer: for (const src of idSources) {
    for (const param of paramCandidates) {
      const url = new URL('https://api.ceipal.com/v1/getJobPostingDetails/');
      url.searchParams.set(param, String(src.value));
      let status = 0;
      let keys: string[] = [];
      let body: unknown = null;
      try {
        const r = await fetch(url.toString(), {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        status = r.status;
        body = await r.json();
        if (body && typeof body === 'object') keys = Object.keys(body as object);
      } catch (e) {
        body = { error: e instanceof Error ? e.message : String(e) };
      }
      attempts.push({ param, idField: src.field, idValue: src.value, status, keys });
      // A successful detail object has many keys; an error payload has few.
      if (status === 200 && keys.length > 3) {
        detailKeys = keys;
        detailSample = body as Record<string, unknown>;
        break outer;
      }
    }
  }

  // Surface the fields most likely to hold the client name for quick eyeballing.
  const clientHintFields = detailSample
    ? Object.fromEntries(
        Object.entries(detailSample).filter(([k]) =>
          /client|customer|account|company|end_?client/i.test(k),
        ),
      )
    : null;

  // The job-posting API exposes NO client field (only business_unit_id), yet
  // the CEIPAL UI shows a real "Client" (e.g. "Ford Motors", internal id 2).
  // It must live in a separate client API. Probe candidate endpoints + a few
  // job-detail param variants to find (a) a client list (id->name) and (b) any
  // job->client linkage. Report status + shape for each.
  const probe = async (url: string): Promise<Record<string, unknown>> => {
    try {
      const r = await fetch(url, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      let body: unknown = null;
      try {
        body = await r.json();
      } catch {
        body = '[non-json response]';
      }
      const results = (body as { results?: unknown[] })?.results;
      const sample = Array.isArray(results) ? results[0] : body;
      return {
        url,
        status: r.status,
        topKeys: body && typeof body === 'object' ? Object.keys(body as object).slice(0, 30) : null,
        sampleKeys:
          sample && typeof sample === 'object' ? Object.keys(sample as object).slice(0, 40) : null,
        sample: sample && typeof sample === 'object' ? sample : body,
      };
    } catch (e) {
      return { url, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const base = 'https://api.ceipal.com/v1/';
  const clientEndpointProbes = [];
  for (const ep of [
    'getClientList',
    'getClientsList',
    'getClients',
    'getClientDetails',
    'getCompanyList',
    'getBusinessUnitList',
  ]) {
    clientEndpointProbes.push(await probe(`${base}${ep}/?page=1`));
  }

  // Re-probe job detail with param variants that might unlock a client field.
  const firstId = idSources[0]?.value;
  const jobDetailVariants = firstId
    ? await Promise.all(
        [`${base}getJobPostingDetails/?job_id=${firstId}&fields=all`].map((u) => probe(u)),
      )
    : [];

  // getClientsList works — pull the FULL client roster (id, name, business units)
  // so we can see whether business_unit_id maps a job to a client (1:1) or BUs
  // are shared. Then probe getClientDetails (param unknown) using a real client
  // id, in case it returns the client's associated jobs (reverse link).
  let clientRoster: Array<Record<string, unknown>> = [];
  let clientPages = 0;
  let firstClientId: string | undefined;
  try {
    const r = await fetch(`${base}getClientsList/?page=1`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as { results?: Record<string, unknown>[]; num_pages?: number };
    clientPages = j.num_pages || 1;
    clientRoster = (j.results || []).map((c) => ({
      id: c.id,
      name: c.name,
      primary_business_unit: c.primary_business_unit,
      accessible_business_units: c.accessible_business_units,
      status: c.status,
    }));
    firstClientId = j.results?.[0]?.id ? String(j.results[0].id) : undefined;
  } catch (e) {
    clientRoster = [{ error: e instanceof Error ? e.message : String(e) }];
  }

  // getClientDetails param discovery (it 400'd with no param).
  const clientDetailVariants = firstClientId
    ? await Promise.all(
        [
          `${base}getClientDetails/?client_id=${firstClientId}`,
          `${base}getClientDetails/?id=${firstClientId}`,
        ].map((u) => probe(u)),
      )
    : [];

  // Distribution of business_unit_id across the first page of jobs — if every
  // job shares one BU, BU cannot discriminate the client.
  const jobBuDistribution: Record<string, number> = {};
  for (const j of (listJson.results || []).slice(0, 20)) {
    const bu = String((j as Record<string, unknown>).company ?? 'none');
    jobBuDistribution[bu] = (jobBuDistribution[bu] || 0) + 1;
  }

  // DECISIVE TEST: does getJobPostingsList accept a client filter? If a filtered
  // request returns FEWER jobs than unfiltered, we can iterate clients to build
  // a job->client map. Compare counts + first job_code per candidate param.
  const countJobs = async (url: string): Promise<Record<string, unknown>> => {
    try {
      const r = await fetch(url, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { results?: Record<string, unknown>[]; count?: number };
      const results = j.results || [];
      return {
        url: url.split('/v1/')[1],
        status: r.status,
        count: j.count ?? results.length,
        firstJobCodes: results.slice(0, 5).map((x) => x.job_code),
      };
    } catch (e) {
      return { url, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const unfiltered = await countJobs(`${base}getJobPostingsList?page=1`);
  const clientFilterTests = firstClientId
    ? await Promise.all(
        ['client_id', 'client', 'clientid', 'end_client', 'customer'].map((param) =>
          countJobs(`${base}getJobPostingsList?page=1&${param}=${firstClientId}`),
        ),
      )
    : [];

  // The keys showed NO client field, so dump full VALUES of the first job's
  // list item + detail so we can locate where the end-client name actually
  // lives (likely embedded in title / description / department / address text).
  // Truncate long HTML blobs so the payload stays readable.
  const truncate = (o: Record<string, unknown> | null) =>
    o
      ? Object.fromEntries(
          Object.entries(o).map(([k, v]) => [
            k,
            typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…[truncated]' : v,
          ]),
        )
      : null;

  return {
    listFirstJobKeys: Object.keys(first),
    listFirstJobClientHints: Object.fromEntries(
      Object.entries(first).filter(([k]) => /client|customer|account|company/i.test(k)),
    ),
    idSourcesFound: idSources,
    detailAttempts: attempts,
    detailResponseKeys: detailKeys,
    detailClientHintFields: clientHintFields,
    listFirstJobFull: truncate(first),
    detailFull: truncate(detailSample),
    clientEndpointProbes,
    jobDetailVariants,
    clientRoster,
    clientPages,
    clientDetailVariants,
    jobBuDistribution,
    unfiltered,
    clientFilterTests,
  };
}
