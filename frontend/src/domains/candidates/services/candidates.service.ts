import { apiRequest, apiUpload, type ApiResponse } from '@/lib/api';
import type { Candidate, CandidateDetail } from '../types';

export async function fetchCandidates(params: {
  page?: number;
  limit?: number;
  search?: string;
  source?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.source) qs.set('source', params.source);
  return apiRequest<ApiResponse<Candidate[]>>(`/api/candidates?${qs}`);
}

export async function fetchCandidate(id: string) {
  return apiRequest<ApiResponse<CandidateDetail>>(`/api/candidates/${id}`);
}

export async function updateCandidate(
  id: string,
  input: Partial<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    location: string;
    work_authorization: string;
    source: string;
  }>,
) {
  return apiRequest<ApiResponse<Candidate>>(`/api/candidates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function uploadResume(candidateId: string, file: File) {
  const formData = new FormData();
  formData.append('resume', file);
  return apiUpload<ApiResponse<{ resume_url: string }>>(`/api/candidates/${candidateId}/resume`, formData);
}

export async function getCandidateResumeUrl(candidateId: string) {
  return apiRequest<ApiResponse<{ url: string; expires_in: number }>>(`/api/candidates/${candidateId}/resume`);
}
