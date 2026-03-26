import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Phone, PhoneIncoming, PhoneOutgoing, Search, Plus, Calendar } from 'lucide-react';

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: 'bg-success/10 text-success', label: 'Completed' },
  scheduled: { color: 'bg-info/10 text-info', label: 'Scheduled' },
  in_progress: { color: 'bg-warning/10 text-warning', label: 'In Progress' },
  failed: { color: 'bg-destructive/10 text-destructive', label: 'Failed' },
  no_answer: { color: 'bg-muted text-muted-foreground', label: 'No Answer' },
  voicemail: { color: 'bg-accent/10 text-accent', label: 'Voicemail' },
};

const mockCalls = [
  { id: '1', candidate: 'Alex Johnson', job: 'Sr. React Developer', agent: 'TechBot', direction: 'outbound', status: 'completed', duration: '12:34', date: 'Mar 15, 2:00 PM', source: null },
  { id: '2', candidate: 'Maria Garcia', job: 'Full-Stack Engineer', agent: 'GenBot', direction: 'outbound', status: 'completed', duration: '18:22', date: 'Mar 15, 1:30 PM', source: null },
  { id: '3', candidate: 'James Wilson', job: 'DevOps Engineer', agent: 'TechBot', direction: 'inbound', status: 'no_answer', duration: '-', date: 'Mar 15, 12:00 PM', source: null },
  { id: '4', candidate: 'Lisa Chen', job: 'Product Designer', agent: 'DesignBot', direction: 'outbound', status: 'scheduled', duration: '-', date: 'Mar 16, 2:00 PM', source: 'cal.com' },
  { id: '5', candidate: 'Robert Davis', job: 'Sr. React Developer', agent: 'TechBot', direction: 'outbound', status: 'failed', duration: '0:45', date: 'Mar 14, 3:00 PM', source: null },
  { id: '6', candidate: 'Emma Thompson', job: 'Full-Stack Engineer', agent: 'GenBot', direction: 'inbound', status: 'voicemail', duration: '1:02', date: 'Mar 14, 11:00 AM', source: null },
  { id: '7', candidate: 'David Kim', job: 'Data Analyst', agent: 'TechBot', direction: 'outbound', status: 'scheduled', duration: '-', date: 'Mar 17, 10:00 AM', source: 'cal.com' },
  { id: '8', candidate: 'Sarah Miller', job: 'Backend Engineer', agent: 'GenBot', direction: 'outbound', status: 'scheduled', duration: '-', date: 'Mar 17, 11:30 AM', source: 'cal.com' },
];

export default function Calls() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search calls..." className="pl-8" />
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Schedule Call</Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCalls.map((call) => (
                <TableRow key={call.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{call.candidate}</TableCell>
                  <TableCell className="text-muted-foreground">{call.job}</TableCell>
                  <TableCell className="text-muted-foreground">{call.agent}</TableCell>
                  <TableCell>
                    {call.direction === 'outbound' ? (
                      <PhoneOutgoing className="h-4 w-4 text-primary" />
                    ) : (
                      <PhoneIncoming className="h-4 w-4 text-success" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[call.status]?.color}`}>
                      {statusConfig[call.status]?.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    {call.source === 'cal.com' ? (
                      <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
                        <Calendar className="h-3 w-3 mr-1" />Cal.com
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{call.duration}</TableCell>
                  <TableCell className="text-muted-foreground">{call.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
