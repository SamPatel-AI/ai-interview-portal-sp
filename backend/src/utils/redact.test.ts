import { describe, it, expect } from 'vitest';
import { maskEmail, maskPhone } from './redact';

describe('maskEmail', () => {
  it('keeps first char and domain only', () => {
    expect(maskEmail('sam.patel@gmail.com')).toBe('s***@gmail.com');
  });

  it('masks single-char local parts without leaking them twice', () => {
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
  });

  it('collapses garbage, empty, and null to ***', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@nodomain.com')).toBe('***');
    expect(maskEmail('')).toBe('***');
    expect(maskEmail(null)).toBe('***');
    expect(maskEmail(undefined)).toBe('***');
  });
});

describe('maskPhone', () => {
  it('keeps country code and last 4 for E.164 numbers', () => {
    expect(maskPhone('+15625757224')).toBe('+1******7224');
  });

  it('keeps multi-digit country codes', () => {
    expect(maskPhone('+442071234567')).toBe('+44******4567');
  });

  it('handles bare 10-digit numbers without a plus', () => {
    expect(maskPhone('5625757224')).toBe('******7224');
  });

  it('collapses short, empty, and null values to ***', () => {
    expect(maskPhone('12345')).toBe('***');
    expect(maskPhone('')).toBe('***');
    expect(maskPhone(null)).toBe('***');
    expect(maskPhone(undefined)).toBe('***');
  });
});
