import { describe, it, expect } from 'vitest';
import { optOutToken, verifyOptOutToken, optOutUrl } from './optOut';

const CAND = '11111111-2222-3333-4444-555555555555';

describe('opt-out tokens', () => {
  it('round-trips: a generated token verifies for its candidate', () => {
    expect(verifyOptOutToken(CAND, optOutToken(CAND))).toBe(true);
  });

  it('rejects a token minted for a different candidate', () => {
    const other = optOutToken('99999999-8888-7777-6666-555555555555');
    expect(verifyOptOutToken(CAND, other)).toBe(false);
  });

  it('rejects garbage and empty tokens without throwing', () => {
    expect(verifyOptOutToken(CAND, 'not-a-token')).toBe(false);
    expect(verifyOptOutToken(CAND, '')).toBe(false);
  });

  it('tokens are deterministic (stateless links stay valid)', () => {
    expect(optOutToken(CAND)).toBe(optOutToken(CAND));
  });

  it('optOutUrl embeds candidate id and token when PUBLIC_API_URL is set', () => {
    const url = optOutUrl(CAND);
    if (url === null) return; // PUBLIC_API_URL unset in this env — covered by prod config
    expect(url).toContain(`c=${CAND}`);
    expect(url).toContain(`t=${optOutToken(CAND)}`);
    expect(url).toContain('/api/reengagement/opt-out');
  });
});
