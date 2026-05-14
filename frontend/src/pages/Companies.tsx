import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Building2, Briefcase, Bot } from 'lucide-react';
import { CardGridSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import CompanyDetailSheet from '@/components/organisms/companies/CompanyDetailSheet';
import { useCompanies } from '@/domains/companies';

export default function Companies() {
  const [search, setSearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, error } = useCompanies({ search });
  const companies = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search companies..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : error ? (
        <EmptyState icon={Building2} title="Failed to load companies" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : companies.length === 0 ? (
        <EmptyState icon={Building2} title="No companies yet" description="Add your first client company to start organizing jobs and agents." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Card key={company.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer" onClick={() => { setSelectedCompanyId(company.id); setSheetOpen(true); }}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-primary">{company.name[0]}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{company.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{company.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 pt-3 border-t">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />{(company as any).jobs_count ?? 0} jobs
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Bot className="h-3.5 w-3.5" />{(company as any).agents_count ?? 0} agents
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CompanyDetailSheet companyId={selectedCompanyId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
