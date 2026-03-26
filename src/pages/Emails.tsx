import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Mail } from 'lucide-react';

const typeColors: Record<string, string> = {
  Invitation: 'bg-primary/10 text-primary',
  'Follow-up': 'bg-info/10 text-info',
  Rejection: 'bg-destructive/10 text-destructive',
};

const statusColors: Record<string, string> = {
  Sent: 'bg-success/10 text-success',
  Failed: 'bg-destructive/10 text-destructive',
  Bounced: 'bg-warning/10 text-warning',
};

const mockEmails = [
  { id: '1', candidate: 'Alex Johnson', type: 'Invitation', subject: 'Interview Invitation - Sr. React Developer', status: 'Sent', date: 'Mar 15, 2:30 PM' },
  { id: '2', candidate: 'Maria Garcia', type: 'Invitation', subject: 'Interview Invitation - Full-Stack Engineer', status: 'Sent', date: 'Mar 14, 3:00 PM' },
  { id: '3', candidate: 'James Wilson', type: 'Follow-up', subject: 'Following up on your application', status: 'Sent', date: 'Mar 13, 10:00 AM' },
  { id: '4', candidate: 'Robert Davis', type: 'Rejection', subject: 'Update on your application', status: 'Bounced', date: 'Mar 12, 4:00 PM' },
  { id: '5', candidate: 'Lisa Chen', type: 'Invitation', subject: 'Interview Invitation - Product Designer', status: 'Failed', date: 'Mar 11, 1:00 PM' },
];

export default function Emails() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search emails..." className="pl-8" />
        </div>
        <Button><Mail className="h-4 w-4 mr-2" />Compose Email</Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockEmails.map((email) => (
                <TableRow key={email.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{email.candidate}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[email.type]}`}>{email.type}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{email.subject}</TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[email.status]}`}>{email.status}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{email.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
