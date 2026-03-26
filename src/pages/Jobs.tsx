import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, RefreshCw } from 'lucide-react';

const statusColors: Record<string, string> = {
  Open: 'bg-success text-success-foreground',
  Closed: 'bg-destructive text-destructive-foreground',
  'On Hold': 'bg-warning text-warning-foreground',
  Filled: 'bg-info text-info-foreground',
};

const mockJobs = [
  { id: '1', code: 'JOB-001', title: 'Senior React Developer', company: 'TechCorp', status: 'Open', agent: 'TechBot', recruiter: 'Sarah K.', apps: 45, created: '2024-03-10' },
  { id: '2', code: 'JOB-002', title: 'Full-Stack Engineer', company: 'Innovate Inc', status: 'Open', agent: 'GenBot', recruiter: 'John D.', apps: 38, created: '2024-03-09' },
  { id: '3', code: 'JOB-003', title: 'DevOps Engineer', company: 'CloudScale', status: 'On Hold', agent: 'None', recruiter: 'Emily R.', apps: 31, created: '2024-03-08' },
  { id: '4', code: 'JOB-004', title: 'Product Designer', company: 'DesignLab', status: 'Open', agent: 'DesignBot', recruiter: 'Sarah K.', apps: 27, created: '2024-03-07' },
  { id: '5', code: 'JOB-005', title: 'Data Analyst', company: 'DataDriven', status: 'Closed', agent: 'None', recruiter: 'John D.', apps: 22, created: '2024-03-05' },
  { id: '6', code: 'JOB-006', title: 'Backend Engineer', company: 'TechCorp', status: 'Filled', agent: 'TechBot', recruiter: 'Emily R.', apps: 19, created: '2024-03-01' },
];

export default function Jobs() {
  const [search, setSearch] = useState('');
  const filtered = mockJobs.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) || j.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Sync from CEIPAL</Button>
          <Button><Plus className="h-4 w-4 mr-2" />Add Job</Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Agent</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((j) => (
                <TableRow key={j.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-mono text-sm text-muted-foreground">{j.code}</TableCell>
                  <TableCell className="font-medium">{j.title}</TableCell>
                  <TableCell className="text-muted-foreground">{j.company}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[j.status]}`}>
                      {j.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{j.agent}</TableCell>
                  <TableCell className="text-muted-foreground">{j.recruiter}</TableCell>
                  <TableCell>{j.apps}</TableCell>
                  <TableCell className="text-muted-foreground">{j.created}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
