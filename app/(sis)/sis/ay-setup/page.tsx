import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CalendarRange } from 'lucide-react';

import { NewAyButton } from '@/components/sis/ay-setup-wizard';
import { AySetupDataTable, type AyTableRow } from '@/components/sis/ay-setup-data-table';
import { PageShell } from '@/components/ui/page-shell';
import {
  checkAyEmpty,
  getCopyForwardPreview,
  listAcademicYears,
  listTermsByAy,
} from '@/lib/sis/ay-setup/queries';
import { getSessionUser } from '@/lib/supabase/server';

export default async function AySetupPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');

  const role = sessionUser.role;
  if (role !== 'school_admin' && role !== 'superadmin') {
    redirect('/sis');
  }

  const ays = await listAcademicYears();
  const termsByAy = await listTermsByAy();
  const activeAyCode = ays.find((a) => a.is_current)?.ay_code ?? null;

  // Preview for the "New AY" wizard. Uses a throwaway code so the query
  // just pulls the most-recent existing AY.
  const preview = await getCopyForwardPreview('__NEW__');

  // Pre-compute blockers for each AY (only matters when superadmin sees
  // the Delete button — cheap enough to always fetch for HFSE's handful
  // of AYs).
  const blockersByAy: Record<string, string[]> = {};
  if (role === 'superadmin') {
    await Promise.all(
      ays.map(async (ay) => {
        const res = await checkAyEmpty(ay.ay_code);
        blockersByAy[ay.ay_code] = res.blockers;
      }),
    );
  }

  // Build enriched rows for the client DataTable.
  const tableRows: AyTableRow[] = ays.map((ay) => ({
    ...ay,
    termsData: termsByAy[ay.id] ?? [],
    blockers: blockersByAy[ay.ay_code] ?? [],
    activeAyCode,
    otherAys: ays
      .filter((o) => o.ay_code !== ay.ay_code)
      .map((o) => ({ ayCode: o.ay_code, label: o.label })),
    role,
  }));

  return (
    <PageShell>
      <Link
        href="/sis"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Records · AY Setup
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Academic years.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Create new academic years, switch the active AY, and retire empty ones.
            Creating an AY sets up its terms, sections, subjects, and admissions data all at once.
          </p>
        </div>
        <NewAyButton preview={preview} />
      </header>

      <AySetupDataTable rows={tableRows} />

      <section className="rounded-xl border border-hairline bg-card p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-indigo-deep">
          <CalendarRange className="size-3" /> Rollover checklist
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong>Create the new AY</strong> here — sets up terms, sections, subjects, and admissions
            data all at once. The new AY shows up in the switcher right away across every page.
            (admin + superadmin)
          </li>
          <li>
            <strong>Verify the parent-portal team</strong> is ready to write to the new admissions
            tables. The canonical DDL is frozen in{' '}
            <code className="rounded bg-muted px-1 py-0.5">docs/context/10-parent-portal.md</code>.
          </li>
          <li>
            <strong>Switch active</strong> on the new AY when ready. (admin + superadmin)
          </li>
          <li>
            <strong>Optional:</strong> delete a mis-created AY if it&apos;s still empty. (superadmin
            only)
          </li>
        </ol>
      </section>
    </PageShell>
  );
}

