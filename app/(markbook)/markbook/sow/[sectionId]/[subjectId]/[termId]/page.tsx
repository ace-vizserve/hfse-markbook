import { redirect } from 'next/navigation';
import { ArrowLeft, ScrollText } from 'lucide-react';
import Link from 'next/link';

import { getSowInstance, listImportableSowSources } from '@/lib/sis/sow/queries';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { SowEditorClient } from '@/components/markbook/sow-editor-client';
import { PageShell } from '@/components/ui/page-shell';

export default async function SowEditorPage({
  params,
}: {
  params: Promise<{ sectionId: string; subjectId: string; termId: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (!['teacher', 'registrar', 'school_admin', 'superadmin'].includes(sessionUser.role ?? '')) {
    redirect('/markbook');
  }

  const { sectionId, subjectId, termId } = await params;
  const service = createServiceClient();

  // Auth gate: teacher must be the subject_teacher for this section × subject.
  if (sessionUser.role === 'teacher') {
    const { data: assignment } = await service
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', sessionUser.id)
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) redirect('/markbook/sow');
  }

  // Metadata lookups (section, subject, term) + SOW instance + grading sheet status
  const [sectionResult, subjectResult, termResult, instance, importableSources] =
    await Promise.all([
      service.from('sections').select('name, level_id, academic_year_id').eq('id', sectionId).maybeSingle(),
      service.from('subjects').select('code, name').eq('id', subjectId).maybeSingle(),
      service.from('terms').select('label').eq('id', termId).maybeSingle(),
      getSowInstance(sectionId, subjectId, termId),
      listImportableSowSources(sectionId, subjectId, termId),
    ]);

  const sectionRow = sectionResult.data as { name: string; level_id: string; academic_year_id: string } | null;
  const sectionName = sectionRow?.name ?? sectionId;
  const subject = (subjectResult.data as { code: string; name: string } | null);
  const termLabel = (termResult.data as { label: string } | null)?.label ?? termId;

  // Fetch subject config to get the correct max slot counts for this (level × subject × AY).
  // Falls back to KD #5 max (5) if no config found.
  let maxWwSlots = 5;
  let maxPtSlots = 5;
  if (sectionRow?.level_id && sectionRow?.academic_year_id) {
    const { data: config } = await service
      .from('subject_configs')
      .select('ww_max_slots, pt_max_slots')
      .eq('level_id', sectionRow.level_id)
      .eq('subject_id', subjectId)
      .eq('academic_year_id', sectionRow.academic_year_id)
      .maybeSingle();
    if (config) {
      maxWwSlots = (config as { ww_max_slots: number; pt_max_slots: number }).ww_max_slots;
      maxPtSlots = (config as { ww_max_slots: number; pt_max_slots: number }).pt_max_slots;
    }
  }

  if (!subject) redirect('/markbook/sow');

  // Grading sheet for this (section × subject × term)
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('id, is_locked')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .maybeSingle();

  const hasGradingSheet = !!sheet;
  const isSheetLocked = (sheet as { is_locked: boolean } | null)?.is_locked ?? false;

  // Copied-from section name (for provenance banner)
  let copiedFromSectionName: string | null = null;
  if (instance?.copied_from_section_id) {
    const { data: copiedSec } = await service
      .from('sections')
      .select('name')
      .eq('id', instance.copied_from_section_id)
      .maybeSingle();
    copiedFromSectionName = (copiedSec as { name: string } | null)?.name ?? null;
  }

  return (
    <PageShell>
      {/* Back link */}
      <Link
        href="/markbook/sow"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All SOWs
      </Link>

      {/* Page header */}
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Markbook · Scheme of Work
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
            <ScrollText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground">
              {sectionName} · {subject.code}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {subject.name} — {termLabel}
            </p>
          </div>
        </div>
      </header>

      <SowEditorClient
        sectionId={sectionId}
        subjectId={subjectId}
        termId={termId}
        sectionName={sectionName}
        subjectName={subject.name}
        subjectCode={subject.code}
        termLabel={termLabel}
        instanceId={instance?.id ?? null}
        initialWwLabels={instance?.ww_labels ?? []}
        initialPtLabels={instance?.pt_labels ?? []}
        initialTopics={instance?.topics ?? []}
        copiedFromSectionName={copiedFromSectionName}
        copiedAt={instance?.copied_at ?? null}
        hasGradingSheet={hasGradingSheet}
        isSheetLocked={isSheetLocked}
        importableSources={importableSources}
        maxWwSlots={maxWwSlots}
        maxPtSlots={maxPtSlots}
      />
    </PageShell>
  );
}
