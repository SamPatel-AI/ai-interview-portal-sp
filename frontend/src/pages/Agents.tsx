import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Bot, Mic, Settings, Star, Download, Loader2 } from 'lucide-react';
import { CardGridSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import AgentBuilder from '@/components/organisms/agents/AgentBuilder';
import SyncStatusBadge from '@/components/organisms/agents/SyncStatusBadge';
import { useAgents, useSetDefaultAgent, useImportAgents } from '@/domains/agents';
import { useAuthMe } from '@/domains/auth';

const styleBadge = (style: string) => {
  switch (style) {
    case 'technical': return 'default';
    case 'conversational': return 'secondary';
    default: return 'outline';
  }
};

export default function Agents() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);

  const { data, isLoading, error } = useAgents();
  const agents = data?.data ?? [];

  const { data: meRes } = useAuthMe();
  const isAdmin = ((meRes as any)?.data?.role ?? '') === 'admin';

  const setDefault = useSetDefaultAgent();
  const importMut = useImportAgents();

  const openCreate = () => { setEditAgentId(null); setBuilderOpen(true); };
  const openEdit = (id: string) => { setEditAgentId(id); setBuilderOpen(true); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-muted-foreground">Configure AI interview agents for automated candidate screening.</p>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => importMut.mutate()} disabled={importMut.isPending}>
              {importMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Import from Retell
            </Button>
          )}
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create New Agent</Button>
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <EmptyState icon={Bot} title="Failed to load agents" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : agents.length === 0 ? (
        <EmptyState icon={Bot} title="No AI agents yet" description="Create your first AI interview agent to start screening candidates automatically." actionLabel="Create Agent" onAction={openCreate} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer" onClick={() => openEdit(agent.id)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{agent.name}</h3>
                        {agent.is_default && (
                          <Badge variant="outline" className="gap-1 bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px] px-1.5 py-0">
                            <Star className="h-2.5 w-2.5" /> Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{agent.client_companies?.name ?? 'No company'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                      {agent.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <SyncStatusBadge status={agent.sync_status} />
                  </div>
                </div>
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Voice:</span>
                    <span className="text-foreground truncate">{agent.voice_id || 'Default'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Style:</span>
                    <Badge variant={styleBadge(agent.interview_style) as 'default' | 'secondary' | 'outline'} className="text-xs capitalize">{agent.interview_style || 'Default'}</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t gap-2">
                  <span className="text-xs text-muted-foreground">
                    {(agent as any).jobs_count ?? 0} {((agent as any).jobs_count ?? 0) === 1 ? 'job' : 'jobs'} assigned
                  </span>
                  <div className="flex items-center gap-1">
                    {isAdmin && !agent.is_default && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={(e) => { e.stopPropagation(); setDefault.mutate(agent.id); }}
                      >
                        <Star className="h-3 w-3 mr-1" /> Set default
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openEdit(agent.id); }}>
                      Configure →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AgentBuilder open={builderOpen} onOpenChange={setBuilderOpen} agentId={editAgentId} />
    </div>
  );
}
