import { Badge, type BadgeProps } from '@/components/ui/badge';

// Status badges read severity at a glance through one of five semantic
// recipes. Per docs/context/09a-design-patterns.md §9.1 + §9.3 — gradient
// Badge variants (success / warning / blocked / default / muted) carry the
// non-flat status pill voice that's used app-wide for state pills
// (change-request status, lifecycle widget, attendance, etc).
//
// Mapping rules:
//   success  — healthy / verified / done / paid
//   default  — informational / in-progress (indigo gradient)
//   warning  — conditional / pending / needs attention
//   blocked  — rejected / failed / hard-stop
//   muted    — neutral terminal (withdrawn / archived / unknown)
//
// Anything not mapped falls through to MUTED so unfamiliar values surface
// rather than vanish.

type StatusVariant = NonNullable<BadgeProps['variant']>;

const APPLICATION_VARIANT: Record<string, StatusVariant> = {
  Submitted: 'default',
  'Ongoing Verification': 'default',
  Processing: 'default',
  Enrolled: 'success',
  'Enrolled (Conditional)': 'warning',
  Withdrawn: 'muted',
  Cancelled: 'blocked',
};

export function ApplicationStatusBadge({ status }: { status: string | null | undefined }) {
  const v = (status ?? '').trim();
  if (!v) {
    return <Badge variant="outline">Unknown</Badge>;
  }
  const variant = APPLICATION_VARIANT[v] ?? 'muted';
  return <Badge variant={variant}>{v}</Badge>;
}

const STAGE_VARIANT: Record<string, StatusVariant> = {
  // Healthy / done states
  Finished: 'success',
  Signed: 'success',
  Valid: 'success',
  Verified: 'success',
  Paid: 'success',
  Claimed: 'success',
  // Conditional / pending — needs admin action soon
  Pending: 'warning',
  Incomplete: 'warning',
  Uploaded: 'warning',
  'To follow': 'warning',
  // Hard-stop terminal failures
  Rejected: 'blocked',
  Expired: 'blocked',
  // In-progress — currently being worked on
  'Ongoing Assessment': 'default',
  Generated: 'default',
  Sent: 'default',
  Invoiced: 'default',
  'Re-invoiced': 'default',
  Unpaid: 'warning',
  // Neutral terminal
  Cancelled: 'muted',
  Withdrawn: 'muted',
};

export function StageStatusBadge({ status }: { status: string | null | undefined }) {
  const v = (status ?? '').trim();
  if (!v) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">—</span>
    );
  }
  const variant = STAGE_VARIANT[v] ?? 'muted';
  return <Badge variant={variant}>{v}</Badge>;
}
