import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, GraduationCap, Hourglass, Tag, UserMinus, Users } from 'lucide-react';

import { AySwitcher } from '@/components/admissions/ay-switcher';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { getCurrentAcademicYear, listAyCodes } from '@/lib/academic-year';
import { getSisDashboardSummary } from '@/lib/sis/queries';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export default async function SisDashboard({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (sessionUser.role !== 'registrar' && sessionUser.role !== 'school_admin' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
    redirect('/');
  }

  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  if (!currentAy) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No current academic year configured.</div>
      </PageShell>
    );
  }

  const { ay: ayParam } = await searchParams;
  const ayCodes = await listAyCodes(service);
  const selectedAy = ayParam && ayCodes.includes(ayParam) ? ayParam : currentAy.ay_code;

  const summary = await getSisDashboardSummary(selectedAy);

  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Records · Student records
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Student records.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Find any student, view their full record, and track their enrollment across academic years. Read-only in this phase.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryStat
              label="Total students"
              value={summary.totalStudents}
              icon={Users}
              footnote="In this academic year"
            />
            <SummaryStat
              label="Enrolled"
              value={summary.enrolled}
              icon={GraduationCap}
              footnote="Active + conditional"
            />
            <SummaryStat
              label="In pipeline"
              value={summary.pending}
              icon={Hourglass}
              footnote="Pre-enrollment stages"
            />
            <SummaryStat
              label="Withdrawn"
              value={summary.withdrawn}
              icon={UserMinus}
              footnote="Left during the year"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <QuickLink
              href={{ pathname: '/records/students', query: { ay: selectedAy } }}
              icon={Users}
              title="Students"
              description="Browse and search all students for the selected academic year."
            />
            <QuickLink
              href={{ pathname: '/records/discount-codes', query: { ay: selectedAy } }}
              icon={Tag}
              title="Discount Codes"
              description="Manage time-bound enrolment promotion codes."
            />
          </div>
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader>
              <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                Viewing
              </CardDescription>
              <CardTitle className="font-serif text-lg font-semibold">Academic year</CardTitle>
            </CardHeader>
            <CardContent>
              <AySwitcher current={selectedAy} options={ayCodes} />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Switching loads the corresponding <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ay{selectedAy.slice(2)}_*</code> tables.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  footnote,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  footnote: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </CardDescription>
        <CardTitle className="font-serif text-[28px] font-semibold leading-none tabular-nums text-foreground @[200px]/card:text-[32px]">
          {value.toLocaleString('en-SG')}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="text-xs text-muted-foreground">{footnote}</CardFooter>
    </Card>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: { pathname: string; query: Record<string, string> };
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-xl border border-hairline bg-card p-5 transition-all hover:border-brand-indigo/40 hover:shadow-sm"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-base font-semibold text-foreground">{title}</h3>
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
