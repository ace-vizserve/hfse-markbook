import { CheckCircle2, Clock, Lock } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type EnrollmentStatus = 'active' | 'late_enrollee' | 'withdrawn';

const MAP: Record<EnrollmentStatus, { tone: StatusTone; icon: typeof CheckCircle2; label: string }> = {
  active:        { tone: 'healthy', icon: CheckCircle2, label: 'Active' },
  late_enrollee: { tone: 'warning', icon: Clock,        label: 'Late' },
  withdrawn:     { tone: 'locked',  icon: Lock,         label: 'Withdrawn' },
};

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
