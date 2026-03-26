import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Bot, Mic, Settings } from 'lucide-react';
import { CardGridSkeleton } from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';

interface Agent {
  id: string;
  name: string;
  voice_id: string;
  interview_style: string;
  is_active: boolean;
  client_companies?: { name: string };
  jobs_count?: number;
}

const styleBadge = (style: string) => {
  switch (style) {
    case 'technical': return 'default';
    case 'conversational': return 'secondary';
    default: return 'outline';
  }
};

export default function Agents() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: () => apiRequest<ApiResponse<Agent[]>>('/api/agents?active_only=false'),
  });

  const agents = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Configure AI interview agents for automated candidate screening.</p>
        <Button><Plus className="h-4 w-4 mr-2" />Create New Agent</Button>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : error ? (
        <EmptyState icon={Bot} title="Failed to load agents" description={error instanceof Error ? error.message : 'An error occurred'} />
      ) : agents.length === 0 ? (
        <EmptyState icon={Bot} title="No AI agents yet" description="Create your first AI interview agent to start screening candidates automatically." actionLabel="Create Agent" onAction={() => {}} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{agent.client_companies?.name ?? 'No company'}</p>
                    </div>
                  </div>
                  <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                    {agent.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Voice:</span>
                    <span className="text-foreground">{agent.voice_id || 'Default'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Style:</span>
                    <Badge variant={styleBadge(agent.interview_style) as "default" | "secondary" | "outline"} className="text-xs capitalize">{agent.interview_style || 'Default'}</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">{agent.jobs_count ?? 0} jobs assigned</span>
                  <Button variant="ghost" size="sm" className="text-xs">Configure →</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
