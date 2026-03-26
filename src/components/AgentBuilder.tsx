import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Mic, RotateCcw } from 'lucide-react';

interface Voice { voice_id: string; voice_name: string; gender?: string; accent?: string }
interface Company { id: string; name: string }
interface EvalCriterion { name: string; description: string; weight: number }

interface AgentData {
  id?: string;
  name: string;
  client_company_id: string | null;
  system_prompt: string;
  voice_id: string;
  language: string;
  interview_style: string;
  max_call_duration_sec: number;
  is_active: boolean;
  evaluation_criteria: { categories: EvalCriterion[] };
  greeting_template: string;
  closing_template: string;
}

const DEFAULT_PROMPT = `You are a professional AI screening interviewer working on behalf of {{company_name}}. You are conducting a first-round screening interview for the {{job_title}} position.

Candidate: {{candidate_name}}

Instructions:
1. Greet the candidate warmly and confirm their identity
2. Explain this is a 15-20 minute screening interview
3. Ask the mandatory screening questions first
4. Then proceed with role-specific interview questions
5. Allow the candidate to ask questions at the end
6. Thank them and explain next steps

Mandatory Questions:
{{mandate_questions}}

Interview Questions:
{{interview_questions}}

{{call_context}}

Guidelines:
- Be professional but conversational
- Listen actively and ask follow-ups when answers are vague
- Keep track of time - aim to finish within 20 minutes`;

const DEFAULT_CRITERIA: EvalCriterion[] = [
  { name: 'Technical Fit', description: 'Skills match for the role', weight: 0.3 },
  { name: 'Communication', description: 'Clarity and professionalism', weight: 0.2 },
  { name: 'Experience Relevance', description: 'Relevant work history', weight: 0.25 },
  { name: 'Cultural Fit', description: 'Values and team alignment', weight: 0.15 },
  { name: 'Enthusiasm', description: 'Interest and motivation', weight: 0.1 },
];

const TEMPLATE_VARS = ['{{candidate_name}}', '{{job_title}}', '{{company_name}}', '{{mandate_questions}}', '{{interview_questions}}', '{{call_context}}'];

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (IN)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
];

const emptyAgent: AgentData = {
  name: '', client_company_id: null, system_prompt: DEFAULT_PROMPT,
  voice_id: '', language: 'en-US', interview_style: 'conversational',
  max_call_duration_sec: 1200, is_active: true,
  evaluation_criteria: { categories: [...DEFAULT_CRITERIA] },
  greeting_template: '', closing_template: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
}

export default function AgentBuilder({ open, onOpenChange, agentId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState<AgentData>({ ...emptyAgent });

  const { data: existingAgent } = useQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: () => apiRequest<ApiResponse<AgentData>>(`/api/agents/${agentId}`),
    enabled: !!agentId && open,
  });

  const { data: voicesData } = useQuery({
    queryKey: ['agent-voices'],
    queryFn: () => apiRequest<ApiResponse<Voice[]>>('/api/agents/voices'),
    enabled: open,
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => apiRequest<ApiResponse<Company[]>>('/api/companies'),
    enabled: open,
  });

  useEffect(() => {
    if (agentId && existingAgent?.data) {
      const a = existingAgent.data;
      setForm({
        name: a.name, client_company_id: a.client_company_id, system_prompt: a.system_prompt || DEFAULT_PROMPT,
        voice_id: a.voice_id || '', language: a.language || 'en-US', interview_style: a.interview_style || 'conversational',
        max_call_duration_sec: a.max_call_duration_sec || 1200, is_active: a.is_active ?? true,
        evaluation_criteria: a.evaluation_criteria || { categories: [...DEFAULT_CRITERIA] },
        greeting_template: a.greeting_template || '', closing_template: a.closing_template || '',
      });
    } else if (!agentId) {
      setForm({ ...emptyAgent, evaluation_criteria: { categories: [...DEFAULT_CRITERIA] } });
    }
  }, [agentId, existingAgent]);

  const saveMutation = useMutation({
    mutationFn: (data: AgentData) =>
      agentId
        ? apiRequest(`/api/agents/${agentId}`, { method: 'PATCH', body: JSON.stringify(data) })
        : apiRequest('/api/agents', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: agentId ? 'Agent updated' : 'Agent created successfully' });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest(`/api/agents/${agentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Agent deleted' });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const insertVariable = (v: string) => {
    const ta = promptRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = form.system_prompt.slice(0, start);
    const after = form.system_prompt.slice(ta.selectionEnd);
    setForm(f => ({ ...f, system_prompt: before + v + after }));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length); }, 0);
  };

  const updateCriteria = (i: number, field: keyof EvalCriterion, value: string | number) => {
    setForm(f => {
      const cats = [...f.evaluation_criteria.categories];
      cats[i] = { ...cats[i], [field]: value };
      return { ...f, evaluation_criteria: { categories: cats } };
    });
  };

  const removeCriteria = (i: number) => {
    setForm(f => ({ ...f, evaluation_criteria: { categories: f.evaluation_criteria.categories.filter((_, idx) => idx !== i) } }));
  };

  const addCriteria = () => {
    setForm(f => ({ ...f, evaluation_criteria: { categories: [...f.evaluation_criteria.categories, { name: '', description: '', weight: 0.1 }] } }));
  };

  const voices = voicesData?.data ?? [];
  const companies = companiesData?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{agentId ? 'Edit Agent' : 'Create New Agent'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-8 py-4">
            {/* Section 1: Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Basic Info</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Agent Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Senior Dev Screener" required />
                </div>
                <div className="space-y-2">
                  <Label>Client Company</Label>
                  <Select value={form.client_company_id ?? ''} onValueChange={v => setForm(f => ({ ...f, client_company_id: v || null }))}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Interview Style</Label>
                <div className="grid grid-cols-3 gap-3">
                  {['formal', 'conversational', 'technical'].map(style => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, interview_style: style }))}
                      className={`p-3 rounded-lg border text-sm font-medium capitalize transition-all ${
                        form.interview_style === style
                          ? 'border-primary bg-primary/10 text-primary ring-2 ring-ring'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Active</Label>
              </div>
            </div>

            <Separator />

            {/* Section 2: Voice */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Mic className="h-4 w-4" />Voice Selection</h3>
              {voices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading voices...</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {voices.map(v => (
                    <button
                      key={v.voice_id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, voice_id: v.voice_id }))}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        form.voice_id === v.voice_id
                          ? 'border-primary bg-primary/10 ring-2 ring-ring'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="font-medium text-foreground">{v.voice_name}</p>
                      <p className="text-xs text-muted-foreground">{v.gender} {v.accent && `• ${v.accent}`}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Section 3: Prompt */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">System Prompt</h3>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARS.map(v => (
                  <Badge key={v} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => insertVariable(v)}>
                    {v}
                  </Badge>
                ))}
              </div>
              <Textarea
                ref={promptRef}
                value={form.system_prompt}
                onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                rows={12}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, system_prompt: DEFAULT_PROMPT }))}>
                <RotateCcw className="h-3 w-3 mr-1" />Reset to Default
              </Button>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Greeting Template</Label>
                  <Textarea value={form.greeting_template} onChange={e => setForm(f => ({ ...f, greeting_template: e.target.value }))} rows={3} placeholder="Optional greeting..." />
                </div>
                <div className="space-y-2">
                  <Label>Closing Template</Label>
                  <Textarea value={form.closing_template} onChange={e => setForm(f => ({ ...f, closing_template: e.target.value }))} rows={3} placeholder="Optional closing..." />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 4: Call Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Call Settings</h3>
              <div className="space-y-2">
                <Label>Max Duration: {Math.round(form.max_call_duration_sec / 60)} min</Label>
                <Slider
                  value={[form.max_call_duration_sec / 60]}
                  onValueChange={([v]) => setForm(f => ({ ...f, max_call_duration_sec: v * 60 }))}
                  min={5} max={60} step={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Section 5: Evaluation Criteria */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Evaluation Criteria</h3>
              {form.evaluation_criteria.categories.map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Name" value={c.name} onChange={e => updateCriteria(i, 'name', e.target.value)} />
                      <Input placeholder="Description" value={c.description} onChange={e => updateCriteria(i, 'description', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20">Weight: {c.weight.toFixed(2)}</span>
                      <Slider value={[c.weight]} onValueChange={([v]) => updateCriteria(i, 'weight', v)} min={0} max={1} step={0.05} className="flex-1" />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCriteria(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addCriteria}><Plus className="h-3 w-3 mr-1" />Add Criteria</Button>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 flex items-center justify-between border-t mt-0 pt-4">
          {agentId && (
            <Button variant="destructive" size="sm" onClick={() => { if (confirm('Delete this agent?')) deleteMutation.mutate(); }} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {agentId ? 'Save Changes' : 'Create Agent'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
