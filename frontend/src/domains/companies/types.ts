export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  jobs_count?: number;
  agents_count?: number;
}


export interface CompanyDetail extends Company {
  jobs: Array<{ id: string; title: string; status: string }>;
  agents: Array<{ id: string; name: string; is_active: boolean }>;
}

export interface CreateCompanyInput {
  name: string;
  description?: string;
  logo_url?: string;
}
