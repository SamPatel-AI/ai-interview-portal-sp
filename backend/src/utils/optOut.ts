import crypto from 'crypto';
import { env } from '../config/env';

// Stateless unsubscribe tokens: hmac(secret, candidateId). The link in a
// re-engagement email must work with NO login, but candidate ids must not be
// guessable into someone else's opt-out (or an enumeration probe) — the HMAC
// binds the link to the id without needing a token table.
function signingSecret(): string {
  // WEBHOOK_SHARED_SECRET is the designated server-side shared secret; the
  // service-role key is a boot-required fallback so dev links still verify.
  return env.WEBHOOK_SHARED_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
}

export function optOutToken(candidateId: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(`optout:${candidateId}`).digest('hex');
}

export function verifyOptOutToken(candidateId: string, token: string): boolean {
  const expected = optOutToken(candidateId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Absolute unsubscribe URL for a candidate, or null when no public base URL is configured. */
export function optOutUrl(candidateId: string): string | null {
  if (!env.PUBLIC_API_URL) return null;
  const base = env.PUBLIC_API_URL.replace(/\/$/, '');
  return `${base}/api/reengagement/opt-out?c=${candidateId}&t=${optOutToken(candidateId)}`;
}
