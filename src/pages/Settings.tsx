import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Your Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                    {user?.user_metadata?.full_name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm">Change Avatar</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={user?.user_metadata?.full_name || ''} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled />
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
              <div className="space-y-2"><Label>Organization Name</Label><Input defaultValue="Saanvi AI" /></div>
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Team Members</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Sarah Kim', email: 'sarah@saanvi.ai', role: 'Admin' },
                  { name: 'John Doe', email: 'john@saanvi.ai', role: 'Recruiter' },
                  { name: 'Emily Rose', email: 'emily@saanvi.ai', role: 'Recruiter' },
                ].map((member) => (
                  <div key={member.email} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{member.role}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          {[
            { name: 'CEIPAL', status: 'Connected', desc: 'Last synced 2 hours ago' },
            { name: 'Retell AI', status: 'Connected', desc: 'Voice AI platform' },
            { name: 'Microsoft Outlook', status: 'Not connected', desc: 'Email integration' },
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
