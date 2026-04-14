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
 * Validate that a string looks like a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
