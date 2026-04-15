import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getUserRole } from '@/lib/auth/roles';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChangeRequestDecisionButtons } from './decision-buttons';

export type AdminRequestRow = {
  id: string;
  grading_sheet_id: string;
  grade_entry_id: string;
  field_changed: string;
  slot_index: number | null;
  current_value: string | null;
  proposed_value: string;
  reason_category: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'cancelled';
  requested_by_email: string;
  requested_at: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  decision_note: string | null;
  applied_by: string | null;
  applied_at: string | null;
};

const STATUS_LABELS: Record<AdminRequestRow['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Declined',
  applied: 'Applied',
  cancelled: 'Cancelled',
};

function statusBadgeClass(status: AdminRequestRow['status']): string {
  switch (status) {
    case 'pending':
      return 'border-border bg-muted text-muted-foreground';
    case 'approved':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'applied':
      return 'border-brand-mint bg-brand-mint/30 text-ink';
    case 'rejected':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'cancelled':
      return 'border-border bg-muted/50 text-muted-foreground';
  }
}

function fieldLabel(field: string, slot: number | null): string {
  switch (field) {
    case 'ww_scores':
      return slot != null ? `W${slot + 1}` : 'WW';
    case 'pt_scores':
      return slot != null ? `PT${slot + 1}` : 'PT';
    case 'qa_score':
      return 'QA';
    case 'letter_grade':
      return 'Letter';
    case 'is_na':
      return 'N/A';
    default:
      return field;
  }
}

export default async function AdminChangeRequestsPage() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect('/login');
  const role = getUserRole(userRes.user);
  if (!role || (role !== 'admin' && role !== 'superadmin' && role !== 'registrar')) {
    redirect('/');
  }
  const canDecide = role === 'admin' || role === 'superadmin';

  const service = createServiceClient();
  const { data: rawRows } = await service
    .from('grade_change_requests')
    .select(
      `id, grading_sheet_id, grade_entry_id, field_changed, slot_index,
       current_value, proposed_value, reason_category, justification,
       status, requested_by_email, requested_at,
       reviewed_by_email, reviewed_at, decision_note,
       applied_by, applied_at`,
    )
    .order('requested_at', { ascending: false });

  const rows = (rawRows ?? []) as AdminRequestRow[];
  const pending = rows.filter((r) => r.status === 'pending');
  const history = rows.filter((r) => r.status !== 'pending');

  const counts = {
    pending: pending.length,
    approved: rows.filter((r) => r.status === 'approved').length,
    applied: rows.filter((r) => r.status === 'applied').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };

  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Admin · Grade changes
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Change requests
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Review and decide on locked-sheet change requests from teachers.
          Approved requests are applied by the registrar; rejected requests are
          terminal and the teacher is notified.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Pending" value={counts.pending} emphasised />
        <StatCard label="Approved" value={counts.approved} />
        <StatCard label="Applied" value={counts.applied} />
        <StatCard label="Declined" value={counts.rejected} />
        <StatCard label="Cancelled" value={counts.cancelled} />
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending{' '}
            {counts.pending > 0 && (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {counts.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Awaiting review</CardTitle>
              <CardDescription>
                {canDecide
                  ? 'Approve or decline each request. Approvals are not auto-applied — the registrar applies them on the locked sheet.'
                  : 'Only admins and superadmins can approve or decline. This view is read-only for the registrar.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <RequestTable
                rows={pending}
                canDecide={canDecide}
                emptyLabel="No pending requests. Nothing to review right now."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>All decided requests</CardTitle>
              <CardDescription>
                Everything approved, applied, declined, or cancelled so far.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <RequestTable
                rows={history}
                canDecide={false}
                emptyLabel="No decided requests yet."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );

  function RequestTable({
    rows,
    canDecide,
    emptyLabel,
  }: {
    rows: AdminRequestRow[];
    canDecide: boolean;
    emptyLabel: string;
  }) {
    if (rows.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filed</TableHead>
            <TableHead>Teacher</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Reason / Justification</TableHead>
            <TableHead>Status</TableHead>
            {canDecide && <TableHead className="text-right">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {new Date(r.requested_at).toLocaleString('en-SG', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </TableCell>
              <TableCell className="text-sm">{r.requested_by_email}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {fieldLabel(r.field_changed, r.slot_index)}
              </TableCell>
              <TableCell className="tabular-nums text-sm">
                {r.current_value ?? '(blank)'}{' '}
                <span className="text-muted-foreground">→</span>{' '}
                <span className="font-medium">{r.proposed_value}</span>
              </TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">
                <div className="font-mono text-[10px] uppercase tracking-wider">
                  {r.reason_category.replace(/_/g, ' ')}
                </div>
                <div className="mt-0.5 line-clamp-2">{r.justification}</div>
                {r.decision_note && (
                  <div className="mt-1 line-clamp-1 text-[11px]">
                    Note: {r.decision_note}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase tracking-wider ${statusBadgeClass(r.status)}`}>
                  {STATUS_LABELS[r.status]}
                </Badge>
              </TableCell>
              {canDecide && (
                <TableCell className="text-right">
                  <ChangeRequestDecisionButtons requestId={r.id} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
}

function StatCard({
  label,
  value,
  emphasised = false,
}: {
  label: string;
  value: number;
  emphasised?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </CardDescription>
        <CardTitle
          className={`font-serif text-[28px] font-semibold leading-none tabular-nums ${
            emphasised && value > 0 ? 'text-primary' : 'text-foreground'
          }`}>
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
