import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Users2,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StaffTable } from '@/components/sis/staff-table';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { getSectionStaffingCoverage } from '@/lib/sis/dashboard';
import { loadStaffAssignments } from '@/lib/sis/staff';
import { createClient, getSessionUser } from '@/lib/supabase/server';

export default async function StaffPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (
    sessionUser.role !== 'registrar' &&
    sessionUser.role !== 'school_admin' &&
    sessionUser.role !== 'superadmin'
  ) {
    redirect('/sis');
  }

  const supabase = await createClient();
  const { data: ayRow } = await supabase
    .from('academic_years')
    .select('ay_code')
    .eq('is_current', true)
    .single();
  const ayCode = (ayRow as { ay_code: string } | null)?.ay_code;
  if (!ayCode) redirect('/sis');

  const [rows, coverage] = await Promise.all([
    loadStaffAssignments(ayCode),
    getSectionStaffingCoverage(ayCode),
  ]);

  const totalTeachers = rows.filter((r) => !r.disabled).length;
  const withFca = coverage.withAdviser;
  const sectionsMissingFca = coverage.total - coverage.withAdviser;

  return (
    <PageShell>
      <Link
        href="/sis"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        SIS Admin
      </Link>

      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          SIS Admin · Staff
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Staff assignments.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Manage form class adviser and subject teaching assignments for{' '}
          {ayCode}. Click a teacher row to edit their assignments.
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-3">
        <Card
          data-slot="card"
          className="bg-gradient-to-t from-primary/5 to-card"
        >
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Active teachers
            </CardDescription>
            <CardTitle className="font-serif text-3xl tabular-nums text-foreground">
              {totalTeachers}
            </CardTitle>
            <CardAction>
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                <Users2 className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
        </Card>

        <Card
          data-slot="card"
          className="bg-gradient-to-t from-primary/5 to-card"
        >
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Sections with FCA
            </CardDescription>
            <CardTitle className="font-serif text-3xl tabular-nums text-foreground">
              {withFca}
            </CardTitle>
            <CardAction>
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-mint to-brand-mint/60 text-ink shadow-brand-tile-mint">
                <UserCheck className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
        </Card>

        <Card
          data-slot="card"
          className={
            sectionsMissingFca > 0
              ? 'border-brand-amber/30 bg-gradient-to-r from-brand-amber/10 to-card'
              : 'bg-gradient-to-t from-primary/5 to-card'
          }
        >
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Sections missing FCA
            </CardDescription>
            <CardTitle
              className={`font-serif text-3xl tabular-nums ${sectionsMissingFca > 0 ? 'text-brand-amber' : 'text-foreground'}`}
            >
              {sectionsMissingFca}
            </CardTitle>
            <CardAction>
              <div
                className={`flex size-9 items-center justify-center rounded-xl ${
                  sectionsMissingFca > 0
                    ? 'bg-gradient-to-br from-brand-amber to-brand-amber/70 text-ink shadow-brand-tile-amber'
                    : 'bg-gradient-to-br from-brand-mint to-brand-mint/60 text-ink shadow-brand-tile-mint'
                }`}
              >
                {sectionsMissingFca > 0 ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
              </div>
            </CardAction>
          </CardHeader>
        </Card>
      </div>

      <StaffTable rows={rows} ayCode={ayCode} />
    </PageShell>
  );
}
