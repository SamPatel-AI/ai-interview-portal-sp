import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, History, Filter } from 'lucide-react';
import EmptyState from '@/components/molecules/EmptyState';
import { useActivity, useActivityFilters } from '@/domains/activity';
import type { ActivityEntry } from '@/domains/activity';

const entityColors: Record<string, string> = {
  application: 'bg-blue-500/10 text-blue-600',
  candidate: 'bg-green-500/10 text-green-600',
  job: 'bg-purple-500/10 text-purple-600',
  call: 'bg-orange-500/10 text-orange-600',
  user: 'bg-pink-500/10 text-pink-600',
  agent: 'bg-cyan-500/10 text-cyan-600',
  company: 'bg-yellow-500/10 text-yellow-600',
};

const actionLabels: Record<string, string> = {
  created: 'Created', updated: 'Updated', deleted: 'Deleted',
  approved_for_interview: 'Approved for Interview', screened: 'AI Screened',
  invited: 'Invited', status_changed: 'Status Changed',
};

function formatAction(action: string): string {
  return actionLabels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDetails(details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '';
  const parts: string[] = [];
  if (details.status) parts.push(`Status: ${details.status}`);
  if (details.email) parts.push(`Email: ${details.email}`);
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.job_title) parts.push(details.job_title as string);
  if (details.candidate_email) parts.push(details.candidate_email as string);
  return parts.join(' | ');
}

export default function ActivityLog() {
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: filtersRes } = useActivityFilters();
  const filters = filtersRes?.data as any;

  const { data: response, isLoading } = useActivity({
    page,
    entity_type: entityTypeFilter !== 'all' ? entityTypeFilter : undefined,
    user_id: userFilter !== 'all' ? userFilter : undefined,
    from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : undefined,
  });

  const activities = (response as any)?.data || [];
  const total = (response as any)?.total || 0;
  const totalPages = (response as any)?.totalPages || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Entity Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {(filters?.entity_types || []).map((t: string) => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="User" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {(filters?.users || []).map((u: any) => (
              <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[150px]" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
        <Input type="date" className="w-[150px]" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
        <div className="ml-auto text-sm text-muted-foreground">{total} activit{total !== 1 ? 'ies' : 'y'}</div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Loading activity...</CardContent></Card>
      ) : activities.length === 0 ? (
        <EmptyState icon={History} title="No activity found" description="Activity is recorded automatically as your team works. Try adjusting your filters." />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((entry: ActivityEntry) => {
                  const u = (entry as any).users;
                  const initials = u?.full_name ? u.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : '?';
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{u?.full_name || 'System'}</span>
                        </div>
                      </TableCell>
                      <TableCell><span className="font-medium text-sm">{formatAction(entry.action)}</span></TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={entityColors[entry.entity_type] || 'bg-muted text-muted-foreground'}>{entry.entity_type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate text-sm text-muted-foreground">{formatDetails(entry.details as Record<string, unknown>)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
