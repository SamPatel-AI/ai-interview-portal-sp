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
