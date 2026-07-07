/**
 * PII masking for log output. Logs must never carry a candidate's full email
 * or phone number — enough survives to correlate log lines, no more.
 */

/** `sahil@medtricslab.com` → `s***@medtricslab.com`; anything unparseable → `***`. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '***';
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** `+15625757224` → `+1******7224`; keeps country code + last 4. Unparseable → `***`. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '***';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  const last4 = digits.slice(-4);
  const ccLen = Math.max(digits.length - 10, 1);
  const prefix = phone.startsWith('+') ? `+${digits.slice(0, ccLen)}` : '';
  return `${prefix}${'*'.repeat(6)}${last4}`;
}
