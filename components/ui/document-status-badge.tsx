import { Check, Clock, FileWarning, Inbox, Upload, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type DocumentStatus =
  | 'missing'
  | 'to-follow'
  | 'uploaded'
  | 'valid'
  | 'rejected'
  | 'expired';

const MAP: Record<DocumentStatus, { tone: StatusTone; icon: typeof Check; label: string }> = {
  missing:     { tone: 'muted',   icon: Inbox,       label: 'Missing' },
  'to-follow': { tone: 'warning', icon: Clock,       label: 'Awaiting parent' },
  uploaded:    { tone: 'info',    icon: Upload,      label: 'Awaiting review' },
  valid:       { tone: 'healthy', icon: Check,       label: 'Valid' },
  rejected:    { tone: 'locked',  icon: X,           label: 'Sent back' },
  expired:     { tone: 'locked',  icon: FileWarning, label: 'Lapsed' },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
