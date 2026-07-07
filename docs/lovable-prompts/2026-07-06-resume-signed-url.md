# Lovable prompt — fetch résumés via the new signed-URL endpoint

Run this prompt in Lovable AFTER the backend PR adding `GET /api/candidates/:id/resume` is merged and deployed. Background: the resumes storage bucket is private (service-role only), so the `resume_url` stored on a candidate is a bare storage path — linking to it directly has never worked. The backend now mints short-lived signed URLs.

---

Résumé links are broken because the storage bucket is private. The backend now exposes `GET /api/candidates/:id/resume`, which returns `{ success: true, data: { url, expires_in } }` where `url` is a short-lived signed download link. Please update the frontend:

1. In `src/domains/candidates/services/candidates.service.ts`, add:
   ```ts
   export async function getCandidateResumeUrl(candidateId: string) {
     return apiRequest<ApiResponse<{ url: string; expires_in: number }>>(`/api/candidates/${candidateId}/resume`);
   }
   ```
   (match the file's existing `apiRequest`/`ApiResponse` idioms) and export it through the candidates domain barrel.

2. In `src/components/organisms/candidates/CandidateDetailSheet.tsx` there are two "View Résumé"/"View Resume" anchors currently using `href={c.resume_url}`. Keep them gated on `c.resume_url` (it still signals that a résumé exists), but replace each anchor with a button styled the same way whose click handler calls `getCandidateResumeUrl(c.id)` and opens the returned `url` with `window.open(url, '_blank', 'noopener,noreferrer')`. Show a destructive toast if the request fails.

3. Search the rest of the app for any other element that uses a candidate `resume_url` as a link href (check `ApplicationDetailSheet` — its `candidates` embed includes `resume_url`) and apply the same pattern there. Note: for applications, the candidate **id** is needed to call the endpoint; if a sheet only has the embedded candidate object without its id, add `id` to that embed's type rather than skipping the fix.

4. Do not store or cache the signed URL anywhere (it expires in 5 minutes) — always fetch a fresh one on click.
