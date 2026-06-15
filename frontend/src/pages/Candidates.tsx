import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Users } from 'lucide-react';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import CandidateDetailSheet from '@/components/organisms/candidates/CandidateDetailSheet';
import Pagination from '@/components/molecules/Pagination';
import { useCandidates } from '@/domains/candidates';

const sourceBadgeVariant = (source: string | null) => {
  switch (source) {
    case 'CEIPAL': return 'default';
    case 'Email': return 'secondary';
    default: return 'outline';
  }
};

export default function Candidates() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, error } = useCandidates({ page, search });

  const candidates = data?.data ?? [];
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const openDetail = (id: string) => { setSelectedId(id); setSheetOpen(true); };
  const handleSearchChange = (v: string) => { setSearch(v); setPage(1); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." className="pl-8" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <EmptyState icon={Users} title="Failed to load candidates" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : candidates.length === 0 ? (
        <EmptyState icon={Users} title="No candidates yet" description="Candidates appear here automatically as they're imported from email and resume submissions." />
      ) : (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c.id)}>
                    <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                    <TableCell><Badge variant={sourceBadgeVariant(c.source) as "default" | "secondary" | "outline"}>{c.source || 'Unknown'}</Badge></TableCell>
                    <TableCell>{c.applications_count ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data && (
        <Pagination
          page={data.page ?? page}
          limit={data.limit}
          total={data.total}
          totalPages={data.totalPages}
          onPageChange={setPage}
        />
      )}


      <CandidateDetailSheet candidateId={selectedId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
