import { useState, useEffect, useMemo } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ArrowLeft, ArrowRight, Mic, X, Plus, Phone, RefreshCw, Download, Star, ChevronDown, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAgent, useVoices, useCreateAgent, useUpdateAgent,
  useSyncAgent, usePullAgent, useTestCallAgent, useSetDefaultAgent,
  type BuilderConfig, type CreateAgentInput,
} from '@/domains/agents';
import { useCompanies } from '@/domains/companies';
import { useAuthMe } from '@/domains/auth';
import SyncStatusBadge from './SyncStatusBadge';

interface Company { id: string; name: string }

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (IN)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
];

const TONE_CARDS: { value: BuilderConfig['tone']; title: string; desc: string }[] = [
  { value: 'conversational', title: 'Conversational', desc: "Warm and friendly, uses the candidate's name" },
  { value: 'formal', title: 'Formal', desc: 'Professional and structured' },
  { value: 'technical', title: 'Technical', desc: 'Deep, probing follow-ups' },
];

const PHASES: { key: keyof BuilderConfig['phases']; title: string; desc: string }[] = [
  { key: 'rapport', title: 'Rapport', desc: 'Warm-up & intros' },
  { key: 'screening', title: 'Screening', desc: 'Mandatory questions' },
  { key: 'deep_dive', title: 'Deep-dive', desc: 'Role-specific topics' },
  { key: 'candidate_qa', title: 'Candidate Q&A', desc: 'Answer their questions' },
  { key: 'closing', title: 'Closing', desc: 'Wrap up and next steps' },
];

const SEED_DOS = ['Ask follow-ups when answers are vague', "Use the candidate's first name naturally"];
const SEED_DONTS = ["Don't give away answer hints", "Don't argue with the candidate"];

const emptyBuilder = (): BuilderConfig => ({
  interviewer_persona: '',
  company_blurb: '',
  tone: 'conversational',
  phases: {
    rapport: { enabled: true, guidance: '' },
    screening: { enabled: true, guidance: '' },
    deep_dive: { enabled: true, guidance: '' },
    candidate_qa: { enabled: true, guidance: '' },
    closing: { enabled: true, guidance: '' },
  },
  dos: [...SEED_DOS],
  donts: [...SEED_DONTS],
  greeting: '',
  closing: '',
});

interface BaseForm {
  name: string;
  client_company_id: string | null;
  voice_id: string;
  language: string;
  interview_style: BuilderConfig['tone'];
  max_call_duration_sec: number;
  is_active: boolean;
}

const emptyBase = (): BaseForm => ({
  name: '',
  client_company_id: null,
  voice_id: '',
  language: 'en-US',
  interview_style: 'conversational',
  max_call_duration_sec: 1200,
  is_active: true,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
}

export default function AgentBuilder({ open, onOpenChange, agentId }: Props) {
  const isEdit = !!agentId;
  const { data: agentRes, refetch: refetchAgent } = useAgent(open ? (agentId ?? null) : null);
  const agent = agentRes?.data;

  const { data: voicesRes } = useVoices();
  const voices = voicesRes?.data ?? [];

  const { data: companiesRes } = useCompanies();
  const companies = companiesRes?.data ?? [];

  const { data: meRes } = useAuthMe();
  const isAdmin = ((meRes as any)?.data?.role ?? '') === 'admin';

  const createMut = useCreateAgent();
  const updateMut = useUpdateAgent();
  const syncMut = useSyncAgent();
  const pullMut = usePullAgent();
  const testMut = useTestCallAgent();
  const defaultMut = useSetDefaultAgent();

  // Determine mode: guided (wizard) vs raw (legacy editor)
  // For new agents: always guided. For existing: guided when builder_config exists.
  const isRaw = isEdit && agent && agent.builder_config === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              {isEdit ? agent?.name ?? 'Edit Agent' : 'Create New Agent'}
              {agent?.is_default && (
                <Badge variant="outline" className="gap-1 bg-amber-500/15 text-amber-700 border-amber-500/30">
                  <Star className="h-3 w-3" /> Default
                </Badge>
              )}
            </DialogTitle>
            {isEdit && agent && <SyncStatusBadge status={agent.sync_status} />}
          </div>
        </DialogHeader>

        {isEdit && !agent ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isRaw && agent ? (
          <LegacyEditor
            agent={agent}
            voices={voices}
            companies={companies}
            isAdmin={isAdmin}
            onClose={() => onOpenChange(false)}
            onSync={() => syncMut.mutate(agent.id)}
            onPull={() => pullMut.mutateAsync(agent.id).then(() => refetchAgent())}
            onTestCall={(phone) => testMut.mutate({ id: agent.id, phone_number: phone })}
            onSetDefault={() => defaultMut.mutate(agent.id)}
            onSave={async (payload) => { await updateMut.mutateAsync({ id: agent.id, ...payload }); await refetchAgent(); }}
            saving={updateMut.isPending}
            syncing={syncMut.isPending}
            pulling={pullMut.isPending}
          />
        ) : (
          <GuidedWizard
            agent={agent}
            voices={voices}
            companies={companies}
            isAdmin={isAdmin}
            onClose={() => onOpenChange(false)}
            onSync={() => agent && syncMut.mutate(agent.id)}
            onPull={() => agent && pullMut.mutateAsync(agent.id).then(() => refetchAgent())}
            onTestCall={(phone) => agent && testMut.mutate({ id: agent.id, phone_number: phone })}
            onSetDefault={() => agent && defaultMut.mutate(agent.id)}
            onSave={async (payload) => {
              if (isEdit && agent) {
                await updateMut.mutateAsync({ id: agent.id, ...payload });
                await refetchAgent();
              } else {
                await createMut.mutateAsync(payload);
                onOpenChange(false);
              }
            }}
            saving={createMut.isPending || updateMut.isPending}
            syncing={syncMut.isPending}
            pulling={pullMut.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Guided Wizard
   ============================================================ */

interface GuidedProps {
  agent?: any;
  voices: { voice_id: string; voice_name: string; gender?: string; accent?: string }[];
  companies: Company[];
  isAdmin: boolean;
  onClose: () => void;
  onSync: () => void;
  onPull: () => Promise<unknown>;
  onTestCall: (phone: string) => void;
  onSetDefault: () => void;
  onSave: (payload: CreateAgentInput) => Promise<void>;
  saving: boolean;
  syncing: boolean;
  pulling: boolean;
}

function GuidedWizard({
  agent, voices, companies, isAdmin, onClose,
  onSync, onPull, onTestCall, onSetDefault, onSave, saving, syncing, pulling,
}: GuidedProps) {
  const [step, setStep] = useState(1);
  const [base, setBase] = useState<BaseForm>(emptyBase());
  const [builder, setBuilder] = useState<BuilderConfig>(emptyBuilder());

  useEffect(() => {
    if (agent) {
      setBase({
        name: agent.name ?? '',
        client_company_id: agent.client_company_id ?? null,
        voice_id: agent.voice_id ?? '',
        language: agent.language ?? 'en-US',
        interview_style: (agent.interview_style ?? 'conversational') as BuilderConfig['tone'],
        max_call_duration_sec: agent.max_call_duration_sec ?? 1200,
        is_active: agent.is_active ?? true,
      });
      if (agent.builder_config) {
        setBuilder({ ...emptyBuilder(), ...agent.builder_config, phases: { ...emptyBuilder().phases, ...agent.builder_config.phases } });
      }
    }
  }, [agent]);

  const totalSteps = 5;
  const canNext = useMemo(() => {
    if (step === 1) return !!base.name && !!base.voice_id;
    return true;
  }, [step, base]);

  const handleSave = async () => {
    const payload: CreateAgentInput = {
      name: base.name,
      client_company_id: base.client_company_id ?? undefined,
      voice_id: base.voice_id,
      language: base.language,
      interview_style: builder.tone,
      max_call_duration_sec: base.max_call_duration_sec,
      is_active: base.is_active,
      builder_config: builder,
    };
    await onSave(payload);
  };

  return (
    <>
      <div className="px-6 pt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {step} of {totalSteps}</span>
          <span>{['Basics', 'Personality & tone', 'Interview flow', 'Guardrails', 'Review & test'][step - 1]}</span>
        </div>
        <Progress value={(step / totalSteps) * 100} className="h-1.5" />
      </div>

      <ScrollArea className="flex-1 px-6 py-4">
        {step === 1 && <Step1Basics base={base} setBase={setBase} voices={voices} companies={companies} />}
        {step === 2 && <Step2Personality builder={builder} setBuilder={setBuilder} />}
        {step === 3 && <Step3Flow builder={builder} setBuilder={setBuilder} />}
        {step === 4 && <Step4Guardrails builder={builder} setBuilder={setBuilder} />}
        {step === 5 && (
          <Step5Review
            agent={agent}
            isAdmin={isAdmin}
            onSync={onSync}
            onPull={onPull}
            onTestCall={onTestCall}
            onSetDefault={onSetDefault}
            syncing={syncing}
            pulling={pulling}
          />
        )}
      </ScrollArea>

      <div className="p-4 border-t flex items-center justify-between gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < totalSteps ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || !base.name || !base.voice_id}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {agent ? 'Save changes' : 'Create agent'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Steps ---- */

function Step1Basics({ base, setBase, voices, companies }: {
  base: BaseForm; setBase: (u: (b: BaseForm) => BaseForm) => void;
  voices: GuidedProps['voices']; companies: Company[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Agent name *</Label>
        <Input value={base.name} onChange={e => setBase(b => ({ ...b, name: e.target.value }))} placeholder="Senior Dev Screener" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Client company</Label>
          <Select value={base.client_company_id ?? ''} onValueChange={v => setBase(b => ({ ...b, client_company_id: v || null }))}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Language</Label>
          <Select value={base.language} onValueChange={v => setBase(b => ({ ...b, language: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Mic className="h-4 w-4" /> Voice *</Label>
        {voices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading voices…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {voices.map(v => (
              <button
                key={v.voice_id}
                type="button"
                onClick={() => setBase(b => ({ ...b, voice_id: v.voice_id }))}
                className={`p-3 rounded-lg border text-left text-sm transition-all ${
                  base.voice_id === v.voice_id
                    ? 'border-primary bg-primary/10 ring-2 ring-ring'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-medium">{v.voice_name}</p>
                <p className="text-xs text-muted-foreground">{v.gender} {v.accent && `• ${v.accent}`}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Max call duration: {Math.round(base.max_call_duration_sec / 60)} min</Label>
        <Slider
          value={[base.max_call_duration_sec / 60]}
          onValueChange={([v]) => setBase(b => ({ ...b, max_call_duration_sec: v * 60 }))}
          min={5} max={60} step={1}
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={base.is_active} onCheckedChange={v => setBase(b => ({ ...b, is_active: v }))} />
        <Label>Active</Label>
      </div>
    </div>
  );
}

function Step2Personality({ builder, setBuilder }: { builder: BuilderConfig; setBuilder: (u: (b: BuilderConfig) => BuilderConfig) => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Interviewer persona</Label>
        <Input
          value={builder.interviewer_persona}
          onChange={e => setBuilder(b => ({ ...b, interviewer_persona: e.target.value }))}
          placeholder="warm, professional recruiter"
        />
      </div>
      <div className="space-y-2">
        <Label>Tone</Label>
        <div className="grid grid-cols-3 gap-3">
          {TONE_CARDS.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setBuilder(b => ({ ...b, tone: t.value }))}
              className={`p-4 rounded-lg border text-left text-sm transition-all ${
                builder.tone === t.value
                  ? 'border-primary bg-primary/10 ring-2 ring-ring'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <p className="font-medium mb-1">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Company blurb</Label>
        <Textarea
          value={builder.company_blurb}
          onChange={e => setBuilder(b => ({ ...b, company_blurb: e.target.value }))}
          rows={4}
          placeholder="Leave blank to use the company name automatically"
        />
        <p className="text-xs text-muted-foreground">Leave blank to use the company name automatically.</p>
      </div>
    </div>
  );
}

function Step3Flow({ builder, setBuilder }: { builder: BuilderConfig; setBuilder: (u: (b: BuilderConfig) => BuilderConfig) => void }) {
  return (
    <div className="space-y-5">
      {PHASES.map(p => {
        const phase = builder.phases[p.key];
        return (
          <div key={p.key} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </div>
              <Switch
                checked={phase.enabled}
                onCheckedChange={v => setBuilder(b => ({ ...b, phases: { ...b.phases, [p.key]: { ...b.phases[p.key], enabled: v } } }))}
              />
            </div>
            {phase.enabled && (
              <Textarea
                placeholder="Anything specific for this part? (optional)"
                value={phase.guidance}
                onChange={e => setBuilder(b => ({ ...b, phases: { ...b.phases, [p.key]: { ...b.phases[p.key], guidance: e.target.value } } }))}
                rows={2}
              />
            )}
          </div>
        );
      })}
      <Separator />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Custom greeting</Label>
          <Textarea rows={3} value={builder.greeting} onChange={e => setBuilder(b => ({ ...b, greeting: e.target.value }))} placeholder="Optional" />
        </div>
        <div className="space-y-2">
          <Label>Custom closing</Label>
          <Textarea rows={3} value={builder.closing} onChange={e => setBuilder(b => ({ ...b, closing: e.target.value }))} placeholder="Optional" />
        </div>
      </div>
    </div>
  );
}

function ChipList({ label, items, onChange, placeholder }: {
  label: string; items: string[]; onChange: (next: string[]) => void; placeholder: string;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, t]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="gap-1">
            {item}
            <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} />
        <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function Step4Guardrails({ builder, setBuilder }: { builder: BuilderConfig; setBuilder: (u: (b: BuilderConfig) => BuilderConfig) => void }) {
  return (
    <div className="space-y-6">
      <ChipList label="Do's" items={builder.dos} onChange={next => setBuilder(b => ({ ...b, dos: next }))} placeholder="Add a do…" />
      <ChipList label="Don'ts" items={builder.donts} onChange={next => setBuilder(b => ({ ...b, donts: next }))} placeholder="Add a don't…" />
    </div>
  );
}

function Step5Review({ agent, isAdmin, onSync, onPull, onTestCall, onSetDefault, syncing, pulling }: {
  agent?: any; isAdmin: boolean;
  onSync: () => void;
  onPull: () => Promise<unknown>;
  onTestCall: (phone: string) => void;
  onSetDefault: () => void;
  syncing: boolean; pulling: boolean;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [phone, setPhone] = useState('');
  const [confirmPull, setConfirmPull] = useState(false);

  const saved = !!agent?.id;

  return (
    <div className="space-y-5">
      <Collapsible open={showPrompt} onOpenChange={setShowPrompt}>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <button className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-muted/50">
              <span>Generated prompt (read-only)</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-3 border-t">
              {agent?.system_prompt ? (
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-3 rounded max-h-72 overflow-auto">
                  {agent.system_prompt}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground italic">Save to generate preview.</p>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {saved && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SyncStatusBadge status={agent.sync_status} />
            {agent.sync_status === 'error' && (
              <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Retry sync
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setConfirmPull(true)} disabled={pulling}>
              {pulling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
              Pull from Retell
            </Button>
            {isAdmin && !agent.is_default && (
              <Button size="sm" variant="outline" onClick={onSetDefault}>
                <Star className="h-3 w-3 mr-1" /> Set as default
              </Button>
            )}
          </div>
          {agent.sync_status === 'error' && agent.sync_error && (
            <div className="flex gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{agent.sync_error}</span>
            </div>
          )}

          <div className="border rounded-lg p-4 space-y-2">
            <Label className="text-sm">Send me a test call</Label>
            <div className="flex gap-2">
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567" />
              <Button onClick={() => onTestCall(phone)} disabled={!phone}>
                <Phone className="h-4 w-4 mr-1" /> Call
              </Button>
            </div>
          </div>
        </div>
      )}

      {!saved && (
        <p className="text-sm text-muted-foreground italic">Save the agent to enable sync status, pull, and test-call controls.</p>
      )}

      <AlertDialog open={confirmPull} onOpenChange={setConfirmPull}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull from Retell?</AlertDialogTitle>
            <AlertDialogDescription>
              Pulling will overwrite this agent in the portal with its current settings in Retell.
              If this is a guided agent, it will switch to raw-prompt mode (the structured fields can't be recovered from a Retell-edited prompt). Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmPull(false); onPull(); }}>Pull</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================================================
   Legacy raw-prompt editor (imported / null builder_config)
   ============================================================ */

function LegacyEditor({
  agent, voices, companies, isAdmin, onClose,
  onSync, onPull, onTestCall, onSetDefault, onSave, saving, syncing, pulling,
}: GuidedProps & { onSave: (payload: Partial<CreateAgentInput>) => Promise<unknown> }) {
  const [base, setBase] = useState<BaseForm>({
    name: agent?.name ?? '',
    client_company_id: agent?.client_company_id ?? null,
    voice_id: agent?.voice_id ?? '',
    language: agent?.language ?? 'en-US',
    interview_style: (agent?.interview_style ?? 'conversational') as BuilderConfig['tone'],
    max_call_duration_sec: agent?.max_call_duration_sec ?? 1200,
    is_active: agent?.is_active ?? true,
  });
  const [systemPrompt, setSystemPrompt] = useState<string>(agent?.system_prompt ?? '');
  const [phone, setPhone] = useState('');
  const [confirmPull, setConfirmPull] = useState(false);

  useEffect(() => {
    if (agent) {
      setBase({
        name: agent.name ?? '',
        client_company_id: agent.client_company_id ?? null,
        voice_id: agent.voice_id ?? '',
        language: agent.language ?? 'en-US',
        interview_style: (agent.interview_style ?? 'conversational') as BuilderConfig['tone'],
        max_call_duration_sec: agent.max_call_duration_sec ?? 1200,
        is_active: agent.is_active ?? true,
      });
      setSystemPrompt(agent.system_prompt ?? '');
    }
  }, [agent]);

  const handleSave = async () => {
    await onSave({
      name: base.name,
      client_company_id: base.client_company_id ?? undefined,
      voice_id: base.voice_id,
      language: base.language,
      interview_style: base.interview_style,
      max_call_duration_sec: base.max_call_duration_sec,
      is_active: base.is_active,
      system_prompt: systemPrompt,
    });
    toast.success('Agent updated');
  };

  return (
    <>
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-5">
          <div className="text-xs px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-700">
            Imported from Retell — editing the raw prompt.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={base.name} onChange={e => setBase(b => ({ ...b, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={base.client_company_id ?? ''} onValueChange={v => setBase(b => ({ ...b, client_company_id: v || null }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Voice</Label>
            <Select value={base.voice_id} onValueChange={v => setBase(b => ({ ...b, voice_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select voice" /></SelectTrigger>
              <SelectContent>
                {voices.map(v => <SelectItem key={v.voice_id} value={v.voice_id}>{v.voice_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={base.language} onValueChange={v => setBase(b => ({ ...b, language: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max duration: {Math.round(base.max_call_duration_sec / 60)} min</Label>
              <Slider
                value={[base.max_call_duration_sec / 60]}
                onValueChange={([v]) => setBase(b => ({ ...b, max_call_duration_sec: v * 60 }))}
                min={5} max={60} step={1}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={base.is_active} onCheckedChange={v => setBase(b => ({ ...b, is_active: v }))} />
            <Label>Active</Label>
          </div>

          <div className="space-y-2">
            <Label>System prompt</Label>
            <Textarea rows={14} className="font-mono text-xs" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <SyncStatusBadge status={agent.sync_status} />
              {agent.sync_status === 'error' && (
                <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Retry sync
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setConfirmPull(true)} disabled={pulling}>
                {pulling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                Pull from Retell
              </Button>
              {isAdmin && !agent.is_default && (
                <Button size="sm" variant="outline" onClick={onSetDefault}>
                  <Star className="h-3 w-3 mr-1" /> Set as default
                </Button>
              )}
            </div>
            {agent.sync_status === 'error' && agent.sync_error && (
              <div className="flex gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{agent.sync_error}</span>
              </div>
            )}
            <div className="border rounded-lg p-4 space-y-2">
              <Label className="text-sm">Send me a test call</Label>
              <div className="flex gap-2">
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567" />
                <Button onClick={() => onTestCall(phone)} disabled={!phone}>
                  <Phone className="h-4 w-4 mr-1" /> Call
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving || !base.name}>
          {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Save changes
        </Button>
      </div>

      <AlertDialog open={confirmPull} onOpenChange={setConfirmPull}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull from Retell?</AlertDialogTitle>
            <AlertDialogDescription>
              Pulling will overwrite this agent in the portal with its current settings in Retell.
              If this is a guided agent, it will switch to raw-prompt mode (the structured fields can't be recovered from a Retell-edited prompt). Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmPull(false); onPull(); }}>Pull</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
