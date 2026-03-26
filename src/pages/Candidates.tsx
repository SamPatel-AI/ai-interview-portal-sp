import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUpload, ApiResponse } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Upload, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  source: string;
  applications_count?: number;
  created_at: string;
}

const sourceBadgeVariant = (source: string) => {
  switch (source) {
    case 'CEIPAL': return 'default';
    case 'Email': return 'secondary';
    default: return 'outline';
  }
};

export default function Candidates() {
  const [search, setSearch] = useState('');
  const [page] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['candidates', page, search],
    queryFn: () => apiRequest<ApiResponse<Candidate[]>>(`/api/candidates?page=${page}&limit=20&search=${search}`),
  });

  const createMutation = useMutation({
    mutationFn: async (candidate: { first_name: string; last_name: string; email: string; phone: string; source: string }) => {
      const result = await apiRequest<ApiResponse<Candidate>>('/api/candidates', {
        method: 'POST',
        body: JSON.stringify(candidate),
      });
      // Upload resume if provided
      if (resumeFile && result.data?.id) {
        const formData = new FormData();
        formData.append('resume', resumeFile);
        await apiUpload(`/api/candidates/${result.data.id}/resume`, formData);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast({ title: 'Candidate created successfully' });
      setDialogOpen(false);
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setSource(''); setResumeFile(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create candidate', description: err.message, variant: 'destructive' });
    },
  });

  const candidates = data?.data ?? [];
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search candidates..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Candidate</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Candidate</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ first_name: firstName, last_name: lastName, email, phone, source }); }} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>First Name</Label><Input placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Last Name</Label><Input placeholder="Doe" value={lastName} onChange={e => setLastName(e.target.value)} required /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Phone</Label><Input placeholder="+1 555-0100" value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div className="space-y-2"><Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CEIPAL">CEIPAL</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resume</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
                  <input type="file" accept=".pdf,.docx,.txt" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setResumeFile(e.target.files?.[0] ?? null)} />
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{resumeFile ? resumeFile.name : 'Drag & drop or click to upload'}</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT</p>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Save Candidate'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : error ? (
        <EmptyState icon={Users} title="Failed to load candidates" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : candidates.length === 0 ? (
        <EmptyState icon={Users} title="No candidates yet" description="Add your first candidate to get started with recruitment." actionLabel="Add Candidate" onAction={() => setDialogOpen(true)} />
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
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                    <TableCell><Badge variant={sourceBadgeVariant(c.source) as "default" | "secondary" | "outline"}>{c.source}</Badge></TableCell>
                    <TableCell>{c.applications_count ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
