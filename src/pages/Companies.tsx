import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Building2, Briefcase, Bot } from 'lucide-react';

const mockCompanies = [
  { id: '1', name: 'TechCorp', description: 'Leading technology solutions provider', jobs: 12, agents: 2 },
  { id: '2', name: 'Innovate Inc', description: 'Innovation-driven startup studio', jobs: 8, agents: 1 },
  { id: '3', name: 'CloudScale', description: 'Cloud infrastructure and DevOps services', jobs: 5, agents: 1 },
  { id: '4', name: 'DesignLab', description: 'Premium design and UX agency', jobs: 4, agents: 1 },
  { id: '5', name: 'DataDriven', description: 'Data analytics and AI consulting', jobs: 6, agents: 1 },
  { id: '6', name: 'FinTech Solutions', description: 'Financial technology and banking', jobs: 3, agents: 0 },
];

export default function Companies() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search companies..." className="pl-8" />
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Add Company</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockCompanies.map((company) => (
          <Card key={company.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-primary">{company.name[0]}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{company.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{company.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" />{company.jobs} jobs
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" />{company.agents} agents
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
