import { apiRequest, type ApiResponse } from '@/lib/api';
import type { Company, CompanyDetail, CreateCompanyInput } from '../types';

export async function fetchCompanies(params: { search?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  return apiRequest<ApiResponse<Company[]>>(`/api/companies?${qs}`);
}

export async function fetchCompany(id: string) {
  return apiRequest<ApiResponse<CompanyDetail>>(`/api/companies/${id}`);
}

export async function createCompany(input: CreateCompanyInput) {
  return apiRequest<ApiResponse<Company>>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCompany(id: string, input: Partial<CreateCompanyInput>) {
  return apiRequest<ApiResponse<Company>>(`/api/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
