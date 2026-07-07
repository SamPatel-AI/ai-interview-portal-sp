import { describe, it, expect } from 'vitest';
import { resumeStoragePath } from './resumePath';

describe('resumeStoragePath', () => {
  it('passes bare storage paths through unchanged', () => {
    expect(resumeStoragePath('org-1/cand-2/resume.pdf')).toBe('org-1/cand-2/resume.pdf');
  });

  it('extracts the object path from a legacy public URL', () => {
    expect(
      resumeStoragePath('https://xyz.supabase.co/storage/v1/object/public/resumes/org-1/cand-2/resume.pdf'),
    ).toBe('org-1/cand-2/resume.pdf');
  });

  it('strips a stray resumes/ bucket prefix', () => {
    expect(resumeStoragePath('resumes/org-1/cand-2/resume.pdf')).toBe('org-1/cand-2/resume.pdf');
  });

  it('returns null for URLs that do not point into the resumes bucket', () => {
    expect(resumeStoragePath('https://example.com/some/other/file.pdf')).toBeNull();
  });

  it('returns null for null, undefined, and blank values', () => {
    expect(resumeStoragePath(null)).toBeNull();
    expect(resumeStoragePath(undefined)).toBeNull();
    expect(resumeStoragePath('')).toBeNull();
    expect(resumeStoragePath('   ')).toBeNull();
  });
});
