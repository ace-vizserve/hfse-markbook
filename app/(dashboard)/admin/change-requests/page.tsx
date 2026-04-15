import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getUserRole } from '@/lib/auth/roles';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { ChangeRequestsDataTable, type AdminRequestRow } from './change-requests-data-table';

export default async function AdminChangeRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet_id?: string }>;
}) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect('/login');
  const role = getUserRole(userRes.user);
  if (!role || (role !== 'admin' && role !== 'superadmin' && role !== 'registrar')) {
    redirect('/');
  }
  const canDecide = role === 'admin' || role === 'superadmin';

  const { sheet_id } = await searchParams;

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

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
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

      <ChangeRequestsDataTable
        rows={rows}
        canDecide={canDecide}
        initialSheetIdFilter={sheet_id}
      />
    </PageShell>
  );
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
          }`}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
