import { Badge } from '@/components/ui/badge';
import type { SyncStatus } from '@/domains/agents';

const MAP: Record<SyncStatus, { label: string; className: string }> = {
  synced: { label: 'Live on Retell', className: 'bg-green-500/15 text-green-700 border-green-500/30 hover:bg-green-500/20' },
  pending: { label: 'Syncing…', className: 'bg-muted text-muted-foreground border-border' },
  error: { label: 'Sync failed', className: 'bg-red-500/15 text-red-700 border-red-500/30 hover:bg-red-500/20' },
  imported: { label: 'Imported', className: 'bg-blue-500/15 text-blue-700 border-blue-500/30 hover:bg-blue-500/20' },
};

export default function SyncStatusBadge({ status }: { status?: SyncStatus | null }) {
  const cfg = MAP[(status ?? 'pending') as SyncStatus] ?? MAP.pending;
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}
