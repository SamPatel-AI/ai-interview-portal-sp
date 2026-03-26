import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Mail } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

const typeColors: Record<string, string> = {
  Invitation: 'bg-primary/10 text-primary',
  'Follow-up': 'bg-info/10 text-info',
  Rejection: 'bg-destructive/10 text-destructive',
};

const statusColors: Record<string, string> = {
  Sent: 'bg-success/10 text-success',
  Failed: 'bg-destructive/10 text-destructive',
  Bounced: 'bg-warning/10 text-warning',
};

export default function Emails() {
  // Emails are logged automatically by the backend. 
  // No direct email list endpoint yet — keeping UI as placeholder.
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search emails..." className="pl-8" />
        </div>
        <Button><Mail className="h-4 w-4 mr-2" />Compose Email</Button>
      </div>

      <EmptyState
        icon={Mail}
        title="Email logs coming soon"
        description="Emails are sent automatically when candidates are approved. A full email log will be available here in a future update."
      />
    </div>
  );
}
