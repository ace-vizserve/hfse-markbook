import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  GraduationCap,
  LayoutGrid,
  Layers,
  Users,
} from 'lucide-react';

import { createClient, getSessionUser } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvaluationSectionsList } from '@/components/evaluation/sections-list';
import {
  getChecklistTopicCountByTerm,
  getWriteupProgressByTerm,
  listFormAdviserSectionIds,
  listSubjectTeacherSectionIds,
} from '@/lib/evaluation/queries';

type LevelLite = {
  id: string;
  code: string;
  label: string;
  level_type: 'primary' | 'secondary';
};

export default async function EvaluationSectionsPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ term_id?: string; term?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (
    sessionUser.role !== 'teacher' &&
    sessionUser.role !== 'registrar' &&
    sessionUser.role !== 'school_admin' &&
    sessionUser.role !== 'superadmin'
  ) {
    redirect('/');
  }

  const sp = await searchParams;
  const supabase = await createClient();

  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('is_current', true)
    .single();

  if (!ay) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">
          No current academic year configured.
        </div>
      </PageShell>
    );
  }

  const { data: termsRaw } = await supabase
    .from('terms')
    .select('id, label, term_number, virtue_theme, is_current')
    .eq('academic_year_id', ay.id)
    .order('term_number', { ascending: true });

  type TermRow = {
    id: string;
    label: string;
    term_number: number;
    virtue_theme: string | null;
    is_current: boolean;
  };
  // T4 is excluded — the T4 final card has no comment section (KD #49).
  const terms = ((termsRaw ?? []) as TermRow[]).filter(
    (t) => t.term_number !== 4
  );

  // `?term=<1|2|3>` is the sidebar-Quicklink contract — resolve the semantic
  // number into the AY's term_id. `?term_id=<uuid>` is the canonical form (used
  // by the Tabs switcher below); it wins when both are present.
  const termNumberParam = sp.term ? Number.parseInt(sp.term, 10) : NaN;
  const termIdFromNumber = Number.isFinite(termNumberParam)
    ? terms.find((t) => t.term_number === termNumberParam)?.id
    : undefined;

  const defaultTermId =
    sp.term_id ??
    termIdFromNumber ??
    terms.find((t) => t.is_current)?.id ??
    terms[0]?.id ??
    '';
  const selectedTerm = terms.find((t) => t.id === defaultTermId) ?? null;

  // Sections: teachers see every section they have any assignment in
  // (form_adviser OR subject_teacher); registrar+ sees the whole AY.
  const { data: allSections } = await supabase
    .from('sections')
    .select('id, name, level:levels(id, code, label, level_type)')
    .eq('academic_year_id', ay.id);

  let sections: Array<{ id: string; name: string; level: LevelLite | null }> = (
    (allSections ?? []) as Array<{
      id: string;
      name: string;
      level: LevelLite | LevelLite[] | null;
    }>
  ).map((s) => ({
    id: s.id,
    name: s.name,
    level: Array.isArray(s.level) ? (s.level[0] ?? null) : s.level,
  }));

  // For teachers, resolve both assignment sets in parallel then filter.
  // For registrar+, both sets stay empty — all sections treated as adviser
  // sections for display purposes (write-up progress shown everywhere).
  let adviserSet = new Set<string>();
  let subjectTeacherSet = new Set<string>();
  if (sessionUser.role === 'teacher') {
    [adviserSet, subjectTeacherSet] = await Promise.all([
      listFormAdviserSectionIds(sessionUser.id),
      listSubjectTeacherSectionIds(sessionUser.id),
    ]);
    sections = sections.filter(
      (s) => adviserSet.has(s.id) || subjectTeacherSet.has(s.id)
    );
  }

  const sectionIds = sections.map((s) => s.id);

  // Write-up progress + checklist topic counts fetched in parallel.
  const [progress, checklistTopics] = selectedTerm
    ? await Promise.all([
        getWriteupProgressByTerm(selectedTerm.id, sectionIds),
        getChecklistTopicCountByTerm(selectedTerm.id, sections),
      ])
    : [
        {} as Record<string, { active_count: number; submitted_count: number }>,
        {} as Record<string, number>,
      ];

  const sorted = sections.slice().sort((a, b) => {
    const ca = a.level?.code ?? '';
    const cb = b.level?.code ?? '';
    return ca.localeCompare(cb) || a.name.localeCompare(b.name);
  });

  const isTeacher = sessionUser.role === 'teacher';

  // Unique levels in code-sorted order — used by the client-side level filter.
  const levels = Array.from(
    new Map(
      sorted
        .filter((s) => s.level?.id)
        .map((s) => [
          s.level!.id,
          { id: s.level!.id, code: s.level!.code, label: s.level!.label },
        ])
    ).values()
  );

  // Write-up progress stats are only meaningful for adviser sections.
  // For registrar+ (adviserSet is empty), all sections count.
  const adviserSectionIds = isTeacher
    ? sorted.filter((s) => adviserSet.has(s.id)).map((s) => s.id)
    : sorted.map((s) => s.id);
  const totalActive = Object.entries(progress)
    .filter(([id]) => !isTeacher || adviserSectionIds.includes(id))
    .reduce((n, [, p]) => n + (p?.active_count ?? 0), 0);
  const totalSubmitted = Object.entries(progress)
    .filter(([id]) => !isTeacher || adviserSectionIds.includes(id))
    .reduce((n, [, p]) => n + (p?.submitted_count ?? 0), 0);
  const completePct =
    totalActive === 0 ? 0 : Math.round((totalSubmitted / totalActive) * 100);
  const levelCount = new Set(sorted.map((s) => s.level?.label).filter(Boolean))
    .size;

  // Is this teacher exclusively a subject teacher with no advisory sections?
  const isSubjectTeacherOnly = isTeacher && adviserSet.size === 0;

  return (
    <PageShell>
      {/* Back nav */}
      <Link
        href="/evaluation"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Evaluation
      </Link>

      {/* Hero */}
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Evaluation · {selectedTerm?.label ?? ay.ay_code}
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            {isTeacher ? 'Your sections.' : 'Sections.'}
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {isTeacher
              ? isSubjectTeacherOnly
                ? 'Sections where you teach a subject. Open one to set up checklist topics and record ratings for your students.'
                : 'Your assigned sections — advisory and subject. Open one to write evaluations or manage checklist topics.'
              : 'Every section in the current academic year. Pick one to view or edit evaluations.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-7 border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            {ay.ay_code}
          </Badge>
          {!isSubjectTeacherOnly && totalActive > 0 && (
            <Badge
              variant="outline"
              className={`h-7 border-border bg-card px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
                completePct === 100
                  ? 'border-brand-mint/50 text-emerald-700'
                  : 'text-muted-foreground'
              }`}
            >
              {completePct}% submitted
            </Badge>
          )}
        </div>
      </header>

      {/* Term switcher */}
      {terms.length > 0 && (
        <Tabs value={defaultTermId}>
          <TabsList>
            {terms.map((t) => (
              <TabsTrigger key={t.id} value={t.id} asChild>
                <Link href={`/evaluation/sections?term_id=${t.id}`}>
                  {t.label}
                  {t.is_current && (
                    <span className="ml-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      current
                    </span>
                  )}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Virtue theme warning */}
      {selectedTerm && !selectedTerm.virtue_theme && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-amber/40 bg-brand-amber-light/40 p-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/15 text-brand-amber">
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-serif text-sm font-semibold text-foreground">
              Virtue theme not set for {selectedTerm.label}.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Joann sets the virtue theme in{' '}
              <Link
                href="/sis/ay-setup"
                className="font-medium text-brand-amber underline underline-offset-2"
              >
                SIS Admin → AY Setup → Dates
              </Link>
              . Until it&apos;s set,{' '}
              {isTeacher
                ? 'the write-up fields are locked.'
                : "advisers can't start writing (registrars can still edit if needed)."}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      {sorted.length > 0 && (
        <div className="@container/main">
          <div
            className={`grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs ${
              isSubjectTeacherOnly
                ? '@xl/main:grid-cols-2'
                : '@xl/main:grid-cols-3'
            }`}
          >
            <SummaryCard
              description={isTeacher ? 'Your sections' : 'Total sections'}
              value={sorted.length.toLocaleString('en-SG')}
              icon={Layers}
              footerTitle={`${levelCount} ${levelCount === 1 ? 'level' : 'levels'}`}
              footerDetail={selectedTerm?.label ?? ay.label}
            />
            <SummaryCard
              description="Active students"
              value={Object.values(progress)
                .reduce((n, p) => n + (p?.active_count ?? 0), 0)
                .toLocaleString('en-SG')}
              icon={Users}
              footerTitle="Currently enrolled"
              footerDetail="Across every section listed"
            />
            {!isSubjectTeacherOnly && (
              <SummaryCard
                description="Write-ups submitted"
                value={`${completePct}%`}
                icon={ClipboardCheck}
                footerTitle={
                  totalActive === 0
                    ? '—'
                    : `${totalSubmitted.toLocaleString('en-SG')} of ${totalActive.toLocaleString('en-SG')}`
                }
                footerDetail={
                  selectedTerm
                    ? `${selectedTerm.label} progress`
                    : 'No term selected'
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Empty state or sections list */}
      {sorted.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardContent className="flex flex-col items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo/10 to-brand-indigo/5">
              <GraduationCap className="size-6 text-brand-indigo/60" />
            </div>
            <p className="font-serif text-lg font-semibold text-foreground">
              {isTeacher ? 'No assigned sections.' : 'No sections in this AY.'}
            </p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {isTeacher
                ? 'Ask the registrar to add your teacher assignments in SIS Admin → Sections.'
                : 'Create sections in SIS Admin → Sections for the current academic year.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Sections label row */}
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <LayoutGrid className="size-3" />
            </div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {sorted.length} {sorted.length === 1 ? 'section' : 'sections'}
              {selectedTerm && (
                <span className="ml-2 text-muted-foreground/50">
                  · {selectedTerm.label}
                </span>
              )}
            </p>
          </div>

          <EvaluationSectionsList
            levels={levels}
            selectedTermId={selectedTerm?.id ?? ''}
            sections={sorted.map((s) => {
              const isAdviserSection = !isTeacher || adviserSet.has(s.id);
              const p = progress[s.id];
              return {
                id: s.id,
                name: s.name,
                levelId: s.level?.id ?? null,
                levelLabel: s.level?.label ?? null,
                isAdviserSection,
                isAlsoBoth:
                  isTeacher &&
                  adviserSet.has(s.id) &&
                  subjectTeacherSet.has(s.id),
                isSubjectTeacherOnly: isTeacher && !adviserSet.has(s.id),
                active: p?.active_count ?? 0,
                submitted: p?.submitted_count ?? 0,
                topicCount: checklistTopics[s.id] ?? 0,
              };
            })}
          />
        </>
      )}
    </PageShell>
  );
}

function SummaryCard({
  description,
  value,
  icon: Icon,
  footerTitle,
  footerDetail,
}: {
  description: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  footerTitle: string;
  footerDetail: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {description}
        </CardDescription>
        <CardTitle className="font-serif text-[32px] font-semibold leading-none tabular-nums text-foreground @[240px]/card:text-[38px]">
          {value}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <p className="font-medium text-foreground">{footerTitle}</p>
        <p className="text-xs text-muted-foreground">{footerDetail}</p>
      </CardFooter>
    </Card>
  );
}
