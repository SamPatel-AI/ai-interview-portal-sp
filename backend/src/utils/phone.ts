/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US numbers).
 * Strips non-digit characters, handles common US formats.
 */
export function formatPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Already has country code or international
  if (digits.length > 10) {
    return `+${digits}`;
  }

  throw new Error(`Invalid phone number: "${raw}" — could not normalize to E.164`);
}

/**
 * Strip a phone string down to its last 10 digits for comparison.
 * Works regardless of formatting, country code prefix, etc.
 */
export function normalizeForLookup(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-10);
}

/**
 * Compare two phone numbers by their normalized (last 10 digits) form.
 * Handles any mix of formats: +1 (555) 123-4567 vs 5551234567 etc.
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizeForLookup(a);
  const nb = normalizeForLookup(b);
  return na.length === 10 && nb.length === 10 && na === nb;
}
