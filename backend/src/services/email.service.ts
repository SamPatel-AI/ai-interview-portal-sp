import { supabaseAdmin } from '../config/database';
import { logger } from '../utils/logger';
import { Candidate, EmailType } from '../types';

// ─── Email Templates ───────────────────────────────────────

function invitationTemplate(candidateName: string, jobTitle: string): { subject: string; body: string } {
  return {
    subject: `Interview Scheduling - Job: ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>Thank you for your interest in the <strong>${jobTitle}</strong> role at Saanvi Technology. After reviewing your profile, we are pleased to invite you to the next step in our hiring process.</p>

  <p><strong>Schedule Your Screening Interview</strong><br>
  Please use the link below to book a 15-20 minute slot at a time that works best for you:<br>
  <a href="https://cal.com/saanvitech/screen-interview-x-saanvi-tech">https://cal.com/saanvitech/screen-interview-x-saanvi-tech</a></p>

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

function followUpTemplate(candidateName: string, jobTitle: string): { subject: string; body: string } {
  return {
    subject: `Follow Up - Interview Scheduling for ${jobTitle}`,
    body: `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">
  <p>Hello ${candidateName},</p>

  <p>We noticed you haven't scheduled your screening interview for the <strong>${jobTitle}</strong> role yet.</p>

  <p>If you're still interested, please book a slot using the link below:<br>
  <a href="https://cal.com/saanvitech/screen-interview-x-saanvi-tech">Schedule Interview</a></p>

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
  // TODO: Integrate Microsoft Graph API for production
  // For now, log the email and store in DB
  logger.info(`Sending ${params.type} email to ${params.toEmail}: ${params.subject}`);

  await supabaseAdmin.from('email_logs').insert({
    candidate_id: params.candidateId,
    application_id: params.applicationId || null,
    type: params.type,
    subject: params.subject,
    body: params.body,
    status: 'sent',
  });
}

/**
 * Send an interview invitation email to a candidate.
 */
export async function sendInvitationEmail(
  candidate: Pick<Candidate, 'id' | 'first_name' | 'last_name' | 'email'>,
  jobTitle: string,
  applicationId: string
): Promise<void> {
  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const template = invitationTemplate(candidateName, jobTitle);

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

export { invitationTemplate, rejectionTemplate, followUpTemplate };
