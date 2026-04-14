import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, X } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (o: boolean) => void }

export default function CreateJobDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [taxTerms, setTaxTerms] = useState('');
  const [agentId, setAgentId] = useState('');

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => apiRequest<ApiResponse<{ id: string; name: string }[]>>('/api/companies'),
    enabled: open,
  });

  const { data: agents } = useQuery({
    queryKey: ['agents-active'],
    queryFn: () => apiRequest<ApiResponse<{ id: string; name: string }[]>>('/api/agents?active_only=true'),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => apiRequest('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        title, description, client_company_id: companyId || undefined,
        skills, location, state, country, employment_type: employmentType,
        tax_terms: taxTerms, ai_agent_id: agentId || undefined,
      }),
    }),
    onSuccess: () => {
      toast({ title: 'Job created successfully' });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onOpenChange(false);
      setTitle(''); setDescription(''); setCompanyId(''); setSkills([]); setLocation(''); setState(''); setCountry(''); setEmploymentType(''); setTaxTerms(''); setAgentId('');
    },
    onError: (e: Error) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput(''); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div className="space-y-2"><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Senior React Developer" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Job description..." /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{companies?.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>AI Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{agents?.data?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Skills</Label>
            <div className="flex gap-2">
              <Input value={skillInput} onChange={e => setSkillInput(e.target.value)} placeholder="Type and press Enter" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); }}} />
              <Button type="button" variant="outline" size="sm" onClick={addSkill}>Add</Button>
            </div>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {skills.map(s => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}<button type="button" onClick={() => setSkills(skills.filter(x => x !== s))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={e => setLocation(e.target.value)} /></div>
            <div className="space-y-2"><Label>State</Label><Input value={state} onChange={e => setState(e.target.value)} /></div>
            <div className="space-y-2"><Label>Country</Label><Input value={country} onChange={e => setCountry(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Employment Type</Label>
              <Select value={employmentType} onValueChange={setEmploymentType}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full Time">Full Time</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="C2C">C2C</SelectItem>
                  <SelectItem value="W2">W2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Tax Terms</Label><Input value={taxTerms} onChange={e => setTaxTerms(e.target.value)} /></div>
          </div>
          <Button type="submit" className="w-full" disabled={!title || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Create Job
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
