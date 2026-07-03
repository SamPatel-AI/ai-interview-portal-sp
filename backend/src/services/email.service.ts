import nodemailer from 'nodemailer';
import { supabaseAdmin } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Candidate, EmailType } from '../types';
import { optOutUrl } from '../utils/optOut';

// ─── SMTP Transporter (created lazily) ────────────────────

let smtpTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (env.EMAIL_TRANSPORT !== 'smtp') return null;
  if (smtpTransporter) return smtpTransporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    logger.warn('SMTP configured but missing SMTP_HOST/USER/PASS — falling back to log');
    return null;
  }

  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: parseInt(env.SMTP_PORT || '587', 10),
    secure: parseInt(env.SMTP_PORT || '587', 10) === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return smtpTransporter;
}

// ─── Microsoft Graph sender (client-credentials / app-only) ─

let graphToken: { value: string; expiresAt: number } | null = null;

/** Fetch (and cache) an app-only Graph access token via client credentials. */
export async function getGraphToken(): Promise<string> {
  if (graphToken && graphToken.expiresAt > Date.now() + 60_000) {
    return graphToken.value;
  }

  const tenant = env.MS_GRAPH_TENANT_ID;
  const clientId = env.MS_GRAPH_CLIENT_ID;
  const clientSecret = env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Microsoft Graph not configured (MS_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET)');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = (await resp.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!resp.ok || !data.access_token) {
    throw new Error(`Graph token request failed (${resp.status}): ${data.error_description || 'unknown error'}`);
  }

  graphToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return graphToken.value;
}

/** Send an HTML email via Microsoft Graph sendMail. Throws on failure. */
async function sendViaGraph(toEmail: string, subject: string, html: string): Promise<void> {
  const sender = env.MS_GRAPH_SENDER || env.SMTP_FROM;
  if (!sender) {
    throw new Error('MS_GRAPH_SENDER (sending mailbox) is not configured');
  }

  const token = await getGraphToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: toEmail } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (resp.status !== 202) {
    const detail = await resp.text();
    throw new Error(`Graph sendMail failed (${resp.status}): ${detail.slice(0, 400)}`);
  }
}

// ─── Email Templates ───────────────────────────────────────

interface CalLinkParams {
  deadline?: Date | null;
  email?: string;
  name?: string;
  applicationId?: string;
  jobId?: string;
}

/**
 * Build the Cal.com booking URL, carrying the candidate's identity through the
 * link so the booking can be matched back to the EXACT application — not by a
 * fragile email lookup. Prefills name/email and attaches application_id/job_id
 * as Cal.com booking metadata (surfaced on the BOOKING_CREATED webhook payload).
 */
function buildCalUrl(params: CalLinkParams = {}): string {
  const base = env.CAL_BASE_URL;
  const qs = new URLSearchParams();

  if (params.name) qs.set('name', params.name);
  if (params.email) qs.set('email', params.email);
  if (params.applicationId) qs.set('metadata[application_id]', params.applicationId);
  if (params.jobId) qs.set('metadata[job_id]', params.jobId);
  // ?endDate caps the visible window to the deadline (soft hint; the authoritative
  // enforcement is the webhook backstop + per-job availability).
  if (params.deadline) qs.set('endDate', params.deadline.toISOString().split('T')[0]);

  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function invitationTemplate(
  candidateName: string,
  jobTitle: string,
  deadline?: Date | null,
  link?: Omit<CalLinkParams, 'deadline'>,
): { subject: string; body: string } {
  const calUrl = buildCalUrl({ deadline, ...link });
  const deadlineNote = deadline
    ? `<p style="color:#c0392b; font-weight:bold;">⚠️ Booking Deadline: ${deadline.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Please book your slot before this date — slots after this deadline will not be available.</p>`
    : '';

  return {
    subject: `Interview Scheduling - Job: ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>Thank you for your interest in the <strong>${jobTitle}</strong> role at Saanvi Technology. After reviewing your profile, we are pleased to invite you to the next step in our hiring process.</p>

  ${deadlineNote}

  <p><strong>Schedule Your Screening Interview</strong><br>
  Please use the link below to book a 15-20 minute slot at a time that works best for you:<br>
  <a href="${calUrl}">${calUrl}</a></p>

  <p><strong>Important - Please Read Before Booking</strong><br>
  This screening interview is conducted by an AI-powered voice agent on behalf of Saanvi Technology's recruitment team. By booking a time slot through the link above, you acknowledge and consent to the following:</p>

  <ul>
    <li>Your first-round screening interview will be conducted by an automated AI calling agent</li>
    <li>The call will be recorded and transcribed for evaluation purposes</li>
    <li>Your responses will be reviewed by the Saanvi Technology hiring team</li>
    <li>You may withdraw your application at any time by replying to this email</li>
  </ul>

  <p>If you have any questions before scheduling, feel free to reach out by replying directly to this email.</p>

  <p>We look forward to connecting with you.</p>

  <p>Best regards,<br>
  <strong>Saanvi AI,</strong><br>
  Saanvi Technology.</p>
</div>`,
  };
}

function rejectionTemplate(candidateName: string, jobTitle: string): { subject: string; body: string } {
  return {
    subject: `Update on Your Application - ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>Thank you for your interest in the <strong>${jobTitle}</strong> position and for taking the time to go through our screening process.</p>

  <p>After careful review, we have decided to move forward with other candidates whose profiles more closely match the current requirements for this role.</p>

  <p>We encourage you to apply for future openings that match your skills and experience. We will keep your profile on file for consideration.</p>

  <p>We wish you all the best in your career search.</p>

  <p>Best regards,<br>
  <strong>Saanvi Technology Recruitment Team</strong></p>
</div>`,
  };
}

function followUpTemplate(
  candidateName: string,
  jobTitle: string,
  link?: Omit<CalLinkParams, 'deadline'>,
): { subject: string; body: string } {
  const calUrl = buildCalUrl({ ...link });
  return {
    subject: `Follow Up - Interview Scheduling for ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>We noticed you haven't scheduled your screening interview for the <strong>${jobTitle}</strong> role yet.</p>

  <p>If you're still interested, please book a slot using the link below:<br>
  <a href="${calUrl}">Schedule Interview</a></p>

  <p>If you have any questions or would like to withdraw your application, simply reply to this email.</p>

  <p>Best regards,<br>
  <strong>Saanvi AI,</strong><br>
  Saanvi Technology.</p>
</div>`,
  };
}

// ─── Send Email ────────────────────────────────────────────

/**
 * Send an email and log it. Uses Microsoft Graph API when configured,
 * falls back to logging for development.
 */
export async function sendEmail(params: {
  candidateId: string;
  applicationId?: string;
  toEmail: string;
  type: EmailType;
  subject: string;
  body: string;
}): Promise<void> {
  logger.info(`Sending ${params.type} email to ${params.toEmail}: ${params.subject}`);

  let status: 'sent' | 'failed' = 'sent';

  if (env.EMAIL_TRANSPORT === 'graph') {
    try {
      await sendViaGraph(params.toEmail, params.subject, params.body);
      logger.info(`Email delivered via Microsoft Graph to ${params.toEmail}`);
    } catch (err) {
      logger.error(`Graph delivery failed for ${params.toEmail}:`, err);
      status = 'failed';
    }
  } else {
    // Try SMTP delivery if configured
    const transporter = getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: env.SMTP_FROM || env.SMTP_USER,
          to: params.toEmail,
          subject: params.subject,
          html: params.body,
        });
        logger.info(`Email delivered via SMTP to ${params.toEmail}`);
      } catch (err) {
        logger.error(`SMTP delivery failed for ${params.toEmail}:`, err);
        status = 'failed';
      }
    } else {
      logger.info(`[LOG MODE] Would send ${params.type} email to ${params.toEmail}`);
    }
  }

  await supabaseAdmin.from('email_logs').insert({
    candidate_id: params.candidateId,
    application_id: params.applicationId || null,
    type: params.type,
    subject: params.subject,
    body: params.body,
    status,
  });
}

/**
 * Send an interview invitation email to a candidate.
 */
export async function sendInvitationEmail(
  candidate: Pick<Candidate, 'id' | 'first_name' | 'last_name' | 'email'>,
  jobTitle: string,
  applicationId: string,
  deadline?: Date | null,
  jobId?: string
): Promise<void> {
  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = invitationTemplate(candidateName, jobTitle, deadline, {
    email: candidate.email,
    name: candidateName,
    applicationId,
    jobId,
  });

  await sendEmail({
    candidateId: candidate.id,
    applicationId,
    toEmail: candidate.email,
    type: 'invitation',
    subject: template.subject,
    body: template.body,
  });
}

/**
 * Send a rejection email to a candidate.
 */
export async function sendRejectionEmail(
  candidate: Pick<Candidate, 'id' | 'first_name' | 'last_name' | 'email'>,
  jobTitle: string,
  applicationId: string
): Promise<void> {
  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = rejectionTemplate(candidateName, jobTitle);

  await sendEmail({
    candidateId: candidate.id,
    applicationId,
    toEmail: candidate.email,
    type: 'rejection',
    subject: template.subject,
    body: template.body,
  });
}

/**
 * Send a follow-up email nudging a candidate who hasn't scheduled yet.
 */
export async function sendFollowUpEmail(
  candidate: Pick<Candidate, 'id' | 'first_name' | 'last_name' | 'email'>,
  jobTitle: string,
  applicationId: string,
  jobId?: string
): Promise<void> {
  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = followUpTemplate(candidateName, jobTitle, {
    email: candidate.email,
    name: candidateName,
    applicationId,
    jobId,
  });

  await sendEmail({
    candidateId: candidate.id,
    applicationId,
    toEmail: candidate.email,
    type: 'follow_up',
    subject: template.subject,
    body: template.body,
  });
}

function missedCallTemplate(
  candidateName: string,
  jobTitle: string,
  callbackNumber: string | null,
  link?: Omit<CalLinkParams, 'deadline'>,
): { subject: string; body: string } {
  const calUrl = buildCalUrl({ ...link });
  const callbackOption = callbackNumber
    ? `<p><strong>Option 1 — Call us back</strong><br>
  Call <a href="tel:${callbackNumber}">${callbackNumber}</a> — our AI interviewer will recognize your number and can run the interview right away.</p>

  <p><strong>Option 2 — Pick a new time</strong><br>`
    : `<p><strong>Pick a new time</strong><br>`;

  return {
    subject: `We Missed You - Interview Call for ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>We just tried to reach you for your screening interview for the <strong>${jobTitle}</strong> role at Saanvi Technology, but couldn't get through.</p>

  ${callbackOption}
  Book a new slot using this link:<br>
  <a href="${calUrl}">${calUrl}</a></p>

  <p>If you have any questions or would like to withdraw your application, simply reply to this email.</p>

  <p>Best regards,<br>
  <strong>Saanvi AI,</strong><br>
  Saanvi Technology.</p>
</div>`,
  };
}

/**
 * Notify a candidate that we tried to call them and couldn't get through
 * (voicemail / no answer / failed dial). Looks up everything it needs so the
 * webhook handler can fire-and-forget it. The callback number is the org's
 * active inbound line; calling it back routes through the inbound webhook,
 * which recognizes the candidate and resumes the interview flow.
 */
export async function sendMissedCallEmail(params: {
  candidateId: string;
  applicationId: string | null;
  orgId: string;
}): Promise<void> {
  const { data: candidate } = await supabaseAdmin
    .from('candidates')
    .select('id, first_name, last_name, email')
    .eq('id', params.candidateId)
    .single();
  if (!candidate?.email) {
    logger.warn(`Missed-call email skipped: candidate ${params.candidateId} not found or has no email`);
    return;
  }

  let jobTitle = 'your interview';
  let jobId: string | undefined;
  if (params.applicationId) {
    const { data: app } = await supabaseAdmin
      .from('applications')
      .select('job_id, jobs (id, title)')
      .eq('id', params.applicationId)
      .single();
    const job = app?.jobs as { id?: string; title?: string } | null;
    if (job?.title) jobTitle = job.title;
    jobId = job?.id;
  }

  const { data: phone } = await supabaseAdmin
    .from('phone_numbers')
    .select('number')
    .eq('org_id', params.orgId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = missedCallTemplate(candidateName, jobTitle, phone?.number || null, {
    email: candidate.email,
    name: candidateName,
    applicationId: params.applicationId || undefined,
    jobId,
  });

  await sendEmail({
    candidateId: candidate.id,
    applicationId: params.applicationId || undefined,
    toEmail: candidate.email,
    type: 'custom',
    subject: template.subject,
    body: template.body,
  });
}

/**
 * Send a re-engagement email to a past candidate for a new matching job.
 */
export async function sendReEngagementEmail(
  candidate: Pick<Candidate, 'id' | 'first_name' | 'last_name' | 'email'>,
  jobTitle: string,
  jobDescription: string,
  companyName: string
): Promise<void> {
  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = reEngagementTemplate(candidateName, jobTitle, jobDescription, companyName, optOutUrl(candidate.id));

  await sendEmail({
    candidateId: candidate.id,
    toEmail: candidate.email,
    type: 're_engagement',
    subject: template.subject,
    body: template.body,
  });
}

function reEngagementTemplate(
  candidateName: string,
  jobTitle: string,
  jobDescription: string,
  companyName: string,
  unsubscribeUrl: string | null = null
): { subject: string; body: string } {
  const briefDescription = jobDescription.length > 200
    ? jobDescription.substring(0, 200) + '...'
    : jobDescription;

  // Unsolicited outreach must carry a working one-click opt-out (CAN-SPAM /
  // TCPA hygiene). Null only when PUBLIC_API_URL is unset (local dev).
  const unsubscribeFooter = unsubscribeUrl
    ? `\n\n  <p style="font-size: 12px; color: #888; margin-top: 24px;">Don't want these emails? <a href="${unsubscribeUrl}" style="color: #888;">Unsubscribe</a> and we won't contact you about future openings.</p>`
    : '';

  return {
    subject: `New Opportunity: ${jobTitle} at ${companyName}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>We hope this message finds you well. We have a new opening for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> that matches your experience and skills.</p>

  <p><strong>About the Role:</strong><br>${briefDescription}</p>

  <p>If you're interested in learning more, we'd love to set up a quick screening conversation. Simply reply to this email to express your interest, and our team will reach out to you.</p>

  <p>If you're not looking for new opportunities at this time, no worries — you can let us know and we won't contact you for future openings.</p>

  <p>We look forward to hearing from you.</p>

  <p>Best regards,<br>
  <strong>Saanvi Technology Recruitment Team</strong></p>${unsubscribeFooter}
</div>`,
  };
}

export { invitationTemplate, rejectionTemplate, followUpTemplate, reEngagementTemplate };
