import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import TeamManagement from '@/components/organisms/settings/TeamManagement';
import SchedulingSettings from '@/components/organisms/settings/SchedulingSettings';
import { useAuthMe, useUpdateProfile } from '@/domains/auth';

export default function SettingsPage() {
  const { user } = useAuth();
  const { data } = useAuthMe();
  const updateProfile = useUpdateProfile();

  const profile = data?.data;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || '';
  const displayEmail = profile?.email || user?.email || '';

  const [fullName, setFullName] = useState(displayName);
  useEffect(() => { setFullName(displayName); }, [displayName]);

  const handleSaveProfile = () => {
    if (!user?.id || !fullName.trim()) return;
    updateProfile.mutate({ id: user.id, full_name: fullName.trim() });
  };

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Your Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-lg">{displayName?.[0] || '?'}</AvatarFallback>
                </Avatar>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2"><Label>Email</Label><Input value={displayEmail} disabled /></div>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={updateProfile.isPending || !fullName.trim() || fullName.trim() === displayName}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization" className="mt-6">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Organization</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={profile?.organization?.name || ''} disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamManagement currentUserId={user?.id || ''} />
        </TabsContent>

        <TabsContent value="scheduling" className="mt-6">
          <SchedulingSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
