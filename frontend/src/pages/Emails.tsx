import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, Mail, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import EmptyState from '@/components/molecules/EmptyState';
import { useEmails } from '@/domains/emails';
import type { EmailLog } from '@/domains/emails';
import { EMAIL_TYPE_COLORS, EMAIL_STATUS_COLORS, EMAIL_TYPE_LABELS } from '@/lib/constants';

export default function Emails() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  const { data: response, isLoading } = useEmails({
    page,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
  });

  const emails = (response as any)?.data || [];
  const total = (response as any)?.total || 0;
  const totalPages = (response as any)?.totalPages || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by candidate or subject..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="invitation">Invitation</SelectItem>
            <SelectItem value="follow_up">Follow-up</SelectItem>
            <SelectItem value="rejection">Rejection</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {total} email{total !== 1 ? 's' : ''}
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Loading emails...</CardContent></Card>
      ) : emails.length === 0 ? (
        <EmptyState icon={Mail} title="No emails found" description="Emails are sent automatically when candidates are approved for interviews. They will appear here." />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email: EmailLog) => (
                  <TableRow key={email.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmail(email)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{(email as any).candidates?.first_name} {(email as any).candidates?.last_name}</p>
                        <p className="text-xs text-muted-foreground">{(email as any).candidates?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate">{email.subject}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(email as any).applications?.jobs?.title || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={EMAIL_TYPE_COLORS[email.type] || ''}>
                        {EMAIL_TYPE_LABELS[email.type] || email.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={EMAIL_STATUS_COLORS[email.status] || ''}>
                        {email.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(email.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
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

      <Sheet open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedEmail && (
            <>
              <SheetHeader><SheetTitle className="text-left">Email Details</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">To</p>
                    <p className="font-medium">{(selectedEmail as any).candidates?.first_name} {(selectedEmail as any).candidates?.last_name}</p>
                    <p className="text-xs text-muted-foreground">{(selectedEmail as any).candidates?.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Job</p>
                    <p className="font-medium">{(selectedEmail as any).applications?.jobs?.title || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Type</p>
                    <Badge variant="secondary" className={EMAIL_TYPE_COLORS[selectedEmail.type] || ''}>
                      {EMAIL_TYPE_LABELS[selectedEmail.type] || selectedEmail.type}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="secondary" className={EMAIL_STATUS_COLORS[selectedEmail.status] || ''}>
                      {selectedEmail.status}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Sent</p>
                    <p className="font-medium">{new Date(selectedEmail.sent_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Subject</p>
                  <p className="font-medium">{selectedEmail.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Body</p>
                  <Card>
                    <CardContent className="p-4">
                      <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: selectedEmail.body }} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
