import { CheckCircle2, Clock, Inbox, Lock, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

type AppStatus =
  | 'Submitted'
  | 'Ongoing Verification'
  | 'Processing'
  | 'Enrolled'
  | 'Enrolled (Conditional)'
  | 'Cancelled'
  | 'Withdrawn';

const STATUS_MAP: Record<AppStatus, { tone: StatusTone; icon?: typeof CheckCircle2; label: string }> = {
  Submitted: { tone: 'info', icon: Inbox, label: 'Submitted' },
  'Ongoing Verification': { tone: 'info', icon: Clock, label: 'Verifying' },
  Processing: { tone: 'info', icon: Clock, label: 'Processing' },
  Enrolled: { tone: 'healthy', icon: CheckCircle2, label: 'Enrolled' },
  'Enrolled (Conditional)': { tone: 'warning', icon: CheckCircle2, label: 'Conditional' },
  Cancelled: { tone: 'muted', icon: X, label: 'Cancelled' },
  Withdrawn: { tone: 'locked', icon: Lock, label: 'Withdrawn' },
};

export function ApplicationStatusBadge({ status }: { status: AppStatus | string | null }) {
  const entry = (status && STATUS_MAP[status as AppStatus]) ?? null;
  if (!entry) return <StatusBadge tone="muted">{status ?? '—'}</StatusBadge>;
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
