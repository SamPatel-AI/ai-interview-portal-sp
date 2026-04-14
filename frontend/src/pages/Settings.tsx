import { useQuery } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import TeamManagement from '@/components/organisms/settings/TeamManagement';
import SchedulingSettings from '@/components/organisms/settings/SchedulingSettings';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  organization?: { name: string };
}

export default function SettingsPage() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<ApiResponse<UserProfile>>('/api/auth/me'),
    retry: false,
  });

  const profile = data?.data;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || '';
  const displayEmail = profile?.email || user?.email || '';

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Your Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {displayName?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">Change Avatar</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={displayName} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={displayEmail} disabled />
                </div>
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization" className="mt-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Organization Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input defaultValue={profile?.organization?.name || ''} />
              </div>
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamManagement currentUserId={user?.id || ''} />
        </TabsContent>

        <TabsContent value="scheduling" className="mt-6">
          <SchedulingSettings />
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          {[
            { name: 'CEIPAL', status: 'Connected', desc: 'ATS integration' },
            { name: 'Retell AI', status: 'Connected', desc: 'Voice AI platform' },
            { name: 'Cal.com', status: 'Connected', desc: 'Scheduling platform' },
          ].map((int) => (
            <Card key={int.name} className="shadow-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{int.name}</h3>
                  <p className="text-sm text-muted-foreground">{int.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={int.status === 'Connected' ? 'default' : 'secondary'}>{int.status}</Badge>
                  <Button variant="outline" size="sm">{int.status === 'Connected' ? 'Sync Now' : 'Connect'}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
