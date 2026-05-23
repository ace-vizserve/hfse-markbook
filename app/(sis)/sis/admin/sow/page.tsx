import { redirect } from 'next/navigation';
import { BookOpenCheck } from 'lucide-react';

import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PageShell } from '@/components/ui/page-shell';
import { SowBuilder } from '@/components/sis/sow-builder';
import { SowScopeManager } from '@/components/sis/sow-scope-manager';
import type { ScopeEntry, LevelOption, SubjectOption } from '@/components/sis/sow-scope-manager';

type AyRow = { id: string; ay_code: string; label: string; is_current: boolean };
type TermRow = { id: string; academic_year_id: string; label: string; term_number: number };

type SectionRaw = {
  id: string;
  name: string;
  curriculum_track: string | null;
  academic_year_id: string;
  level_id: string;
  levels: { id: string; code: string; label: string; level_type: string } | { id: string; code: string; label: string; level_type: string }[] | null;
};

export default async function SowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{
    ay_id?: string;
    term_id?: string;
    subject_id?: string;
    section_id?: string;
  }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (sessionUser.role !== 'school_admin' && sessionUser.role !== 'superadmin') {
    redirect('/sis');
  }

  const sp = await searchParams;
  const service = createServiceClient();

  const [
    { data: aysRaw },
    { data: termsRaw },
    { data: subjectsRaw },
    { data: sectionsRaw },
    { data: levelsRaw },
    { data: scopesRaw },
  ] = await Promise.all([
    service
      .from('academic_years')
      .select('id, ay_code, label, is_current')
      .order('ay_code', { ascending: false }),
    service
      .from('terms')
      .select('id, academic_year_id, label, term_number')
      .order('term_number'),
    service
      .from('subjects')
      .select('id, code, name')
      .order('name'),
    service
      .from('sections')
      .select('id, name, curriculum_track, academic_year_id, level_id, levels(id, code, label, level_type)')
      .order('level_id')
      .order('name'),
    service
      .from('levels')
      .select('id, code, label, level_type')
      .order('code'),
    service
      .from('sow_subject_scopes')
      .select('id, level_id, curriculum_track, subject_id, sort_order')
      .order('sort_order'),
  ]);

  const ays = (aysRaw ?? []) as AyRow[];
  const terms = (termsRaw ?? []) as TermRow[];
  const subjects = (subjectsRaw ?? []) as SubjectOption[];
  const levels = (levelsRaw ?? []) as LevelOption[];
  const scopeEntries = (scopesRaw ?? []) as ScopeEntry[];

  const sections = (sectionsRaw ?? []).map((raw) => {
    const s = raw as unknown as SectionRaw;
    const lvl = Array.isArray(s.levels) ? s.levels[0] : s.levels;
    return {
      id: s.id,
      name: s.name,
      level_id: s.level_id,
      level_code: lvl?.code ?? '',
      level_label: lvl?.label ?? '',
      curriculum_track: s.curriculum_track ?? 'singapore_inspired',
      academic_year_id: s.academic_year_id,
    };
  });

  // Minimal scope entries for the builder (only the fields it needs).
  const builderScopeEntries = scopeEntries.map((e) => ({
    level_id: e.level_id,
    curriculum_track: e.curriculum_track,
    subject_id: e.subject_id,
  }));

  return (
    <PageShell>
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            SIS Admin · Curriculum
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
              <BookOpenCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-serif text-[32px] font-semibold leading-[1.1] tracking-tight text-foreground">
              Scheme of Work.
            </h1>
          </div>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Capture the approved SOW — evaluation topics and activity labels — then apply it directly to all matching sections with one click.
          </p>
        </div>
      </header>

      <SowScopeManager
        initialScopes={scopeEntries}
        levels={levels}
        subjects={subjects}
      />

      <SowBuilder
        ays={ays}
        terms={terms}
        subjects={subjects}
        sections={sections}
        scopeEntries={builderScopeEntries}
        initialScope={{
          ay_id: sp.ay_id,
          term_id: sp.term_id,
          subject_id: sp.subject_id,
          section_id: sp.section_id,
        }}
      />
    </PageShell>
  );
}
