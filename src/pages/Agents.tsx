import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Bot, Mic, Settings } from 'lucide-react';

const mockAgents = [
  { id: '1', name: 'TechBot', company: 'TechCorp', voice: 'Aria', style: 'Technical', active: true, jobs: 3 },
  { id: '2', name: 'GenBot', company: 'Innovate Inc', voice: 'Mark', style: 'Conversational', active: true, jobs: 2 },
  { id: '3', name: 'DesignBot', company: 'DesignLab', voice: 'Sophie', style: 'Formal', active: false, jobs: 1 },
  { id: '4', name: 'DataAgent', company: 'DataDriven', voice: 'James', style: 'Technical', active: true, jobs: 1 },
];

const styleBadge = (style: string) => {
  switch (style) {
    case 'Technical': return 'default';
    case 'Conversational': return 'secondary';
    default: return 'outline';
  }
};

export default function Agents() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Configure AI interview agents for automated candidate screening.</p>
        <Button><Plus className="h-4 w-4 mr-2" />Create New Agent</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockAgents.map((agent) => (
          <Card key={agent.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground">{agent.company}</p>
                  </div>
                </div>
                <Badge variant={agent.active ? 'default' : 'secondary'}>
                  {agent.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="space-y-2 mt-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mic className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Voice:</span>
                  <span className="text-foreground">{agent.voice}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Style:</span>
                  <Badge variant={styleBadge(agent.style) as "default" | "secondary" | "outline"} className="text-xs">{agent.style}</Badge>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{agent.jobs} jobs assigned</span>
                <Button variant="ghost" size="sm" className="text-xs">Configure →</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
