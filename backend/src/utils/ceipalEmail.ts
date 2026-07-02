/**
 * Parser for CEIPAL "Pipeline Submission" notification emails — the only
 * current source that carries candidate identity + JPC job code + résumé
 * together (verified: no CEIPAL API endpoint provides this combination).
 *
 * Subject shape:
 *   "<Source> applicant for <Client> : JPC - <num> : <Job Title> : <Candidate Name>"
 * Body shape (under a "Candidate Details" heading): "Label - Value" lines,
 * e.g. "Candidate Name - Shahi Yella", "Email ID - a@b.com".
 */

export interface ParsedCeipalNotification {
  /** Normalized to CEIPAL's job-code format, e.g. "JPC - 2352" (== jobs.ceipal_job_id). */
  jpcCode: string;
  /** Job board the candidate applied through, e.g. "ZipRecruiter". */
  source: string | null;
  clientName: string | null;
  jobTitle: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  workAuthorization: string | null;
}

/** Minimal HTML→text fallback for when Graph returns an HTML body anyway. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Extract a "Label - Value" body line; N/A and empty values become null. */
function bodyField(body: string, label: string): string | null {
  const re = new RegExp(`^[ \\t]*${label}[ \\t]*[-–—:][ \\t]*(.+)$`, 'im');
  const value = body.match(re)?.[1].trim();
  if (!value || /^n\/?a\.?$/i.test(value)) return null;
  return value;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const tokens = full.trim().split(/\s+/);
  return { firstName: tokens[0] || '', lastName: tokens.slice(1).join(' ') };
}

/**
 * Parse a CEIPAL notification email. Returns null when the email is from
 * CEIPAL but is NOT a job-board application (account notices, note-created,
 * job-reassignment, ... share the same sender).
 */
export function parseCeipalNotificationEmail(
  subject: string,
  body: string,
): ParsedCeipalNotification | null {
  const text = /<[a-z][^>]*>/i.test(body) ? htmlToText(body) : body;

  const jpcMatch = subject.match(/JPC\s*-\s*(\d+)/i);
  if (!jpcMatch) return null;
  if (!/applicant\s+for/i.test(subject)) return null;
  if (!/candidate\s+details/i.test(text)) return null;

  // "<Source> applicant for <Client> : JPC - ..." — both before the JPC segment.
  const head = subject.match(/^\s*(.+?)\s+applicant\s+for\s+(.+?)\s*:\s*JPC/i);
  const source = head?.[1].trim() || null;
  const clientName = head?.[2].trim() || null;

  // After "JPC - <num> :" comes "<Job Title> : <Candidate Name>". Titles may
  // themselves contain colons, so the LAST segment is the name.
  const tail = subject.slice(subject.indexOf(jpcMatch[0]) + jpcMatch[0].length);
  const tailParts = tail.split(':').map((p) => p.trim()).filter(Boolean);
  const subjectName = tailParts.length > 1 ? tailParts[tailParts.length - 1] : null;
  const jobTitle = tailParts.length > 1 ? tailParts.slice(0, -1).join(' : ') : tailParts[0] || null;

  const name = bodyField(text, 'Candidate Name') || subjectName || '';
  const emailRaw = bodyField(text, 'Email ID');
  const email = emailRaw?.match(/[^\s<>]+@[^\s<>]+\.[^\s<>]+/)?.[0].toLowerCase() || null;

  return {
    jpcCode: `JPC - ${jpcMatch[1]}`,
    source,
    clientName,
    jobTitle,
    ...splitName(name),
    email,
    phone: bodyField(text, 'Contact Number'),
    location: bodyField(text, 'Applicant Location'),
    workAuthorization: bodyField(text, 'Applicant Work Authorization'),
  };
}
