import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiResponse } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Shield, ShieldCheck, Eye } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'recruiter' | 'viewer';
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

const roleIcons: Record<string, React.ElementType> = {
  admin: ShieldCheck,
  recruiter: Shield,
  viewer: Eye,
};

export default function TeamManagement({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'recruiter' as string });

  const { data: response, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => apiRequest<ApiResponse<TeamMember[]>>('/api/users'),
  });

  const members: TeamMember[] = (response as any)?.data || [];

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; full_name: string; role: string }) =>
      apiRequest('/api/users/invite', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setInviteOpen(false);
      setInviteForm({ email: '', full_name: '', role: 'recruiter' });
      toast({ title: 'Invitation sent', description: 'Team member has been invited.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to invite', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: string; is_active?: boolean }) =>
      apiRequest(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'User updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Team Members</CardTitle>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-4 w-4 mr-2" />Invite Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={inviteForm.full_name}
                    onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => inviteMutation.mutate(inviteForm)}
                  disabled={!inviteForm.email || !inviteForm.full_name || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading team...</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const RoleIcon = roleIcons[member.role] || Eye;
                const initials = member.full_name
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase();
                const isSelf = member.id === currentUserId;

                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${!member.is_active ? 'opacity-50' : ''}`}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{member.full_name}</p>
                        {isSelf && <Badge variant="outline" className="text-xs">You</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={member.role}
                        onValueChange={(v) => updateMutation.mutate({ id: member.id, role: v })}
                        disabled={isSelf}
                      >
                        <SelectTrigger className="w-[130px] h-8">
                          <div className="flex items-center gap-1.5">
                            <RoleIcon className="h-3.5 w-3.5" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="recruiter">Recruiter</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Active</span>
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={(checked) => updateMutation.mutate({ id: member.id, is_active: checked })}
                          disabled={isSelf}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
