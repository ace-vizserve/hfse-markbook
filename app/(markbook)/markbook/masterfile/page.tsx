import { redirect } from 'next/navigation';

import { MasterfileGrid } from '@/components/markbook/masterfile-grid';
import { MasterfileToolbar } from '@/components/markbook/masterfile-toolbar';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { loadMasterfile } from '@/lib/markbook/masterfile';
import { createClient, getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// HFSE Masterfile (KD #95). Per-level cross-subject grid.
//
// URL params:
//   ?level=<level_id>   required (page redirects to first level if omitted)
//   ?class=<section_id> optional (filter to one class; omit for all classes)

export default async function MasterfilePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; class?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (
    session.role !== 'registrar' &&
    session.role !== 'school_admin' &&
    session.role !== 'superadmin'
  ) {
    redirect('/');
  }

  const sp = await searchParams;
  const supabase = await createClient();
  const service = createServiceClient();
  const ayCode = await requireCurrentAyCode(service);

  // Resolve current AY id and pull every level that has at least one section
  // configured this AY (so the picker doesn't list empty levels).
  const { data: ayRow } = await supabase
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (!ayRow) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No academic year configured.</div>
      </PageShell>
    );
  }
  const ayId = (ayRow as { id: string }).id;

  const { data: sectionLevelRows } = await supabase
    .from('sections')
    .select('level:levels(id, code, label, level_type)')
    .eq('academic_year_id', ayId);

  type LvlLite = { id: string; code: string; label: string; level_type: string };
  const levelMap = new Map<string, LvlLite>();
  for (const row of (sectionLevelRows ?? []) as Array<{
    level: LvlLite | LvlLite[] | null;
  }>) {
    const lvl = Array.isArray(row.level) ? row.level[0] : row.level;
    if (lvl) levelMap.set(lvl.id, lvl);
  }
  const levels = Array.from(levelMap.values()).sort((a, b) => {
    // Primary first, then Secondary; alphabetical within each group.
    if (a.level_type !== b.level_type) {
      return a.level_type === 'primary' ? -1 : 1;
    }
    return a.code.localeCompare(b.code);
  });

  const selectedLevelId =
    sp.level && levels.some((l) => l.id === sp.level)
      ? sp.level
      : levels[0]?.id ?? null;

  if (!selectedLevelId) {
    return (
      <PageShell>
        <header className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Markbook · Masterfile
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Masterfile.
          </h1>
        </header>
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No levels with sections configured for this academic year. Sync the
          roster from Admissions or seed sections from the Master Template
          before reviewing the Masterfile.
        </div>
      </PageShell>
    );
  }

  const payload = await loadMasterfile({
    ayCode,
    levelId: selectedLevelId,
    sectionIds: sp.class ? [sp.class] : undefined,
  });

  if (!payload) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">Could not load Masterfile data.</div>
      </PageShell>
    );
  }

  const selectedSectionId = sp.class && payload.sections.some((s) => s.id === sp.class)
    ? sp.class
    : null;

  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Markbook · Masterfile
        </p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            {payload.level.label}
          </h1>
          <Badge
            variant="outline"
            className="h-7 border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            {ayCode}
          </Badge>
          <Badge
            variant="outline"
            className="h-7 border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            {payload.rows.length} {payload.rows.length === 1 ? 'student' : 'students'}
          </Badge>
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Cross-subject grid for the whole level. Subject Award and Overall Academic
          Award badges compute server-side from the locked grading sheets. Letter-graded
          subject columns (Music, Arts, PE, Health, etc.) stay empty this sprint —
          letter entry ships in Phase 2.
        </p>
      </header>

      <MasterfileToolbar
        levels={levels.map((l) => ({ id: l.id, label: l.label }))}
        selectedLevelId={selectedLevelId}
        sections={payload.sections}
        selectedSectionId={selectedSectionId}
      />

      <MasterfileGrid payload={payload} />

      <p className="border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Award thresholds · Bronze ≥ {payload.thresholds.bronzeMin} · Silver ≥{' '}
        {payload.thresholds.silverMin} · Gold ≥ {payload.thresholds.goldMin} ·
        Editable in <span className="text-foreground">SIS Admin → School config</span>
      </p>
    </PageShell>
  );
}
