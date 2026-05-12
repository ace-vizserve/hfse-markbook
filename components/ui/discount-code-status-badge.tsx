import { CheckCircle2, Clock, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type DiscountCodeStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

const MAP: Record<DiscountCodeStatus, { tone: StatusTone; icon: typeof CheckCircle2; label: string }> = {
  active:    { tone: 'healthy', icon: CheckCircle2, label: 'Active' },
  scheduled: { tone: 'info',    icon: Clock,        label: 'Scheduled' },
  expired:   { tone: 'muted',   icon: X,            label: 'Expired' },
  inactive:  { tone: 'muted',   icon: X,            label: 'Inactive' },
};

export function DiscountCodeStatusBadge({ status }: { status: DiscountCodeStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}

/**
 * Classify discount code status from date window.
 * Active / Expired / Upcoming / none — computed from today vs. the window.
 * Today is normalized to 00:00 local for a stable same-day comparison;
 * a window ending today still counts as Active.
 */
export function classifyCodeStatus(start: string | null, end: string | null): DiscountCodeStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (e && e < today) return 'expired';
  if (s && s > today) return 'scheduled';
  if (s && e && today >= s && today <= e) return 'active';
  return 'inactive';
}

export function isExpired(endDate: string | null): boolean {
  return classifyCodeStatus(null, endDate) === 'expired';
}
