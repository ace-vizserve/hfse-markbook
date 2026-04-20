import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { AySwitcher } from '@/components/admissions/ay-switcher';
import { CrossAySearch } from '@/components/sis/cross-ay-search';
import { StudentDataTable } from '@/components/sis/student-data-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { getCurrentAcademicYear, listAyCodes } from '@/lib/academic-year';
import { listStudents } from '@/lib/sis/queries';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export default async function SisStudentsPage({
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

  const students = await listStudents(selectedAy);

  return (
    <PageShell>
      <Link
        href="/records"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Records · Students · {selectedAy}
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Student records.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Browse, search, and open any student in the selected academic year. Use the cross-year search to find returning students.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CrossAySearch />
          <StudentDataTable data={students} />
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
                Filters in the table below scope to <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ay{selectedAy.slice(2)}_*</code>.
                Cross-year search above ignores this filter.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
