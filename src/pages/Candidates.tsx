import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Upload } from 'lucide-react';

const mockCandidates = [
  { id: '1', name: 'Alex Johnson', email: 'alex@example.com', phone: '+1 555-0101', source: 'CEIPAL', applications: 3, created: '2024-03-15' },
  { id: '2', name: 'Maria Garcia', email: 'maria@example.com', phone: '+1 555-0102', source: 'Email', applications: 1, created: '2024-03-14' },
  { id: '3', name: 'James Wilson', email: 'james@example.com', phone: '+1 555-0103', source: 'Manual', applications: 2, created: '2024-03-13' },
  { id: '4', name: 'Lisa Chen', email: 'lisa@example.com', phone: '+1 555-0104', source: 'CEIPAL', applications: 1, created: '2024-03-12' },
  { id: '5', name: 'Robert Davis', email: 'robert@example.com', phone: '+1 555-0105', source: 'Email', applications: 4, created: '2024-03-11' },
  { id: '6', name: 'Emma Thompson', email: 'emma@example.com', phone: '+1 555-0106', source: 'Manual', applications: 2, created: '2024-03-10' },
];

const sourceBadgeVariant = (source: string) => {
  switch (source) {
    case 'CEIPAL': return 'default';
    case 'Email': return 'secondary';
    default: return 'outline';
  }
};

export default function Candidates() {
  const [search, setSearch] = useState('');
  const filtered = mockCandidates.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Candidate</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Candidate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First Name</Label><Input placeholder="John" /></div>
                <div className="space-y-2"><Label>Last Name</Label><Input placeholder="Doe" /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@example.com" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input placeholder="+1 555-0100" /></div>
              <div className="space-y-2"><Label>Source</Label>
                <Select><SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ceipal">CEIPAL</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resume</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT</p>
                </div>
              </div>
              <Button className="w-full">Save Candidate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                  <TableCell><Badge variant={sourceBadgeVariant(c.source) as "default" | "secondary" | "outline"}>{c.source}</Badge></TableCell>
                  <TableCell>{c.applications}</TableCell>
                  <TableCell className="text-muted-foreground">{c.created}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
