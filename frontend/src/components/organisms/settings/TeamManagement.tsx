import { useState } from 'react';
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/molecules/PageSkeleton';
import EmptyState from '@/components/molecules/EmptyState';
import { UserPlus, Shield, ShieldCheck, Eye, Users } from 'lucide-react';
import {
  useTeamMembers, useInviteUser, useUpdateUser, type TeamMember,
} from '@/domains/settings';
import { useAuthMe } from '@/domains/auth';

const roleIcons: Record<string, React.ElementType> = {
  admin: ShieldCheck,
  recruiter: Shield,
  viewer: Eye,
};

const roleChipClass: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
  recruiter: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  viewer: 'bg-muted text-muted-foreground border-border hover:bg-muted',
};

interface Props {
  currentUserId: string;
}

export default function TeamManagement({ currentUserId }: Props) {
  const { data: meRes } = useAuthMe();
  const myRole = (meRes as any)?.data?.role as 'admin' | 'recruiter' | 'viewer' | undefined;
  const isAdmin = myRole === 'admin';
  const isViewer = myRole === 'viewer';

  const { data: response, isLoading } = useTeamMembers();
  const members: TeamMember[] = (response as any)?.data || [];

  const inviteMutation = useInviteUser();
  const updateMutation = useUpdateUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '', full_name: '', role: 'recruiter' as 'admin' | 'recruiter' | 'viewer',
  });

  const handleInvite = () => {
    inviteMutation.mutate(inviteForm, {
      onSuccess: () => {
        setInviteOpen(false);
        setInviteForm({ email: '', full_name: '', role: 'recruiter' });
      },
    });
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Team Members</CardTitle>
        {isAdmin && (
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
                  <Select
                    value={inviteForm.role}
                    onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as typeof inviteForm.role })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  onClick={handleInvite}
                  disabled={!inviteForm.email || !inviteForm.full_name || inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invite'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members yet"
            description={isAdmin ? 'Invite your first teammate to get started.' : 'Your organization has no team members.'}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {!isViewer && <TableHead className="text-right">Active</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const RoleIcon = roleIcons[member.role] || Eye;
                const initials = (member.full_name || member.email || '?')
                  .split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const isSelf = member.id === currentUserId;
                const canEdit = isAdmin && !isSelf;

                return (
                  <TableRow key={member.id} className={!member.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{member.full_name}</span>
                          {isSelf && <Badge variant="outline" className="text-xs">You</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) => updateMutation.mutate({ id: member.id, role: v })}
                        >
                          <SelectTrigger className="w-[140px] h-8">
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
                      ) : (
                        <Badge variant="outline" className={`gap-1 capitalize ${roleChipClass[member.role]}`}>
                          <RoleIcon className="h-3 w-3" />
                          {member.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.is_active ? 'default' : 'secondary'}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {!isViewer && (
                      <TableCell className="text-right">
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={(checked) =>
                            updateMutation.mutate({ id: member.id, is_active: checked })
                          }
                          disabled={!canEdit}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
