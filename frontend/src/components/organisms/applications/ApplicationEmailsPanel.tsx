import { Badge } from '@/components/ui/badge';
import { Mail } from 'lucide-react';
import type { EmailLog } from '@/domains/applications';
import { formatDate } from './applicationDetailHelpers';

interface Props {
  emails: EmailLog[];
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  invitation: 'Interview Invitation',
  reminder: 'Reminder',
  rejection: 'Rejection',
  offer: 'Offer',
};

export default function ApplicationEmailsPanel({ emails }: Props) {
  if (!emails.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Mail className="h-4 w-4" /> Email Log
      </h3>
      <div className="space-y-1.5">
        {emails.map(e => (
          <div key={e.id} className="flex items-center justify-between p-2 border rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{EMAIL_TYPE_LABELS[e.type] ?? e.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{formatDate(e.sent_at)}</span>
              <Badge variant="outline" className="capitalize text-xs">{e.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
