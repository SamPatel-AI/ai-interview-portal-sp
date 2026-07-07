/**
 * Normalize a candidates.resume_url value to a storage object path inside the
 * 'resumes' bucket. Writers store the bare path (`{org_id}/{candidateId}/{file}`),
 * but legacy rows may hold a full public URL (from the pre-017 public-bucket
 * era) or a stray `resumes/` prefix.
 */
export function resumeStoragePath(resumeUrl: string | null | undefined): string | null {
  if (!resumeUrl) return null;
  let path = resumeUrl.trim();
  if (!path) return null;

  // Legacy full public URL: .../storage/v1/object/public/resumes/<path>
  const marker = '/resumes/';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const idx = path.indexOf(marker);
    if (idx === -1) return null;
    path = path.slice(idx + marker.length);
  }

  if (path.startsWith('resumes/')) path = path.slice('resumes/'.length);

  return path || null;
}
