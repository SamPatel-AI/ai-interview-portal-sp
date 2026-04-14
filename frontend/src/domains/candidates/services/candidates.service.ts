import { apiRequest, apiUpload, type ApiResponse } from '@/lib/api';
import type { Candidate, CandidateDetail, CreateCandidateInput } from '../types';

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

export async function createCandidate(input: CreateCandidateInput) {
  return apiRequest<ApiResponse<Candidate>>('/api/candidates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCandidate(id: string, input: Partial<CreateCandidateInput>) {
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

export async function checkDuplicates(input: { email?: string; first_name?: string; last_name?: string; phone?: string }) {
  return apiRequest<ApiResponse<{ duplicates_found: number; matches: unknown[] }>>('/api/candidates/check-duplicates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
