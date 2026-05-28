import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StaffTable } from '@/components/sis/staff-table';
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
      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-hairline bg-card px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Teachers
          </p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {totalTeachers}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-card px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            With FCA
          </p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {withFca}
          </p>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            sectionsMissingFca > 0
              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
              : 'border-hairline bg-card'
          }`}
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sections missing FCA
          </p>
          <p
            className={`text-2xl font-semibold tabular-nums ${
              sectionsMissingFca > 0 ? 'text-amber-600' : 'text-foreground'
            }`}
          >
            {sectionsMissingFca}
          </p>
        </div>
      </div>

      <StaffTable rows={rows} ayCode={ayCode} />
    </PageShell>
  );
}
