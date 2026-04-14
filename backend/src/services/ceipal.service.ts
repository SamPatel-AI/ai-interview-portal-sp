import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface CeipalJob {
  position_title: string;
  public_job_desc?: string;
  requisition_description?: string;
  skills: string;
  state: string;
  country: string;
  tax_terms: string;
  job_code: string;
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
  const url = new URL('https://api.ceipal.com/v1/getJobPostingsList');
  if (searchKey) url.searchParams.set('searchkey', searchKey);

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error(`CEIPAL jobs fetch failed: ${response.status}`);

  const data = await response.json() as { results: CeipalJob[] };
  return data.results || [];
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

    // Check if job already exists
    const { data: existing } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('org_id', orgId)
      .eq('ceipal_job_id', jobCode)
      .single();

    if (existing) {
      // Update existing
      await supabaseAdmin
        .from('jobs')
        .update({
          title: cJob.position_title,
          description,
          skills,
          state: cJob.state || null,
          country: cJob.country || null,
          tax_terms: cJob.tax_terms || null,
          synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      updated++;
    } else {
      // Create new
      await supabaseAdmin
        .from('jobs')
        .insert({
          org_id: orgId,
          client_company_id: clientCompanyId || null,
          ceipal_job_id: jobCode,
          title: cJob.position_title,
          description,
          skills,
          state: cJob.state || null,
          country: cJob.country || null,
          tax_terms: cJob.tax_terms || null,
          synced_at: new Date().toISOString(),
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
