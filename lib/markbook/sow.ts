import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { SowInstanceRow, SowLabel, SowTopic } from '@/lib/sis/sow/queries';
import {
  mergeGradingSheetSlots,
  mergeEvaluationTopics,
} from '@/lib/sis/sow/mutations';

export type { SowInstanceRow, SowLabel, SowTopic };

export type SowStatusKind = 'empty' | 'drafted' | 'synced';

export type SowListItem = {
  sow_id: string | null;
  section_id: string;
  section_name: string;
  level_id: string;
  level_label: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  term_id: string;
  term_label: string;
  term_number: number;
  ww_count: number;
  pt_count: number;
  topic_count: number;
  status: SowStatusKind;
  has_grading_sheet: boolean;
  copied_from_section_id: string | null;
  copied_at: string | null;
  updated_at: string | null;
};

/**
 * List all (section × subject × term) combos assigned to a teacher, with SOW status.
 * Registrar+ see all sections across the AY.
 */
export async function listTeacherSowItems(
  userId: string,
  ayCode: string,
  isRegistrarPlus: boolean
): Promise<SowListItem[]> {
  const service = createServiceClient();

  const { data: ay } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (!ay) return [];

  const { data: terms } = await service
    .from('terms')
    .select('id, label, term_number')
    .eq('academic_year_id', (ay as { id: string }).id)
    .order('term_number');

  if (!terms?.length) return [];

  let sectionIds: string[];

  if (isRegistrarPlus) {
    const { data: allSections } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', (ay as { id: string }).id);
    sectionIds = ((allSections ?? []) as { id: string }[]).map((s) => s.id);
  } else {
    const { data: assignments } = await service
      .from('teacher_assignments')
      .select('section_id')
      .eq('teacher_user_id', userId);
    sectionIds = [
      ...new Set(
        ((assignments ?? []) as { section_id: string }[]).map(
          (a) => a.section_id
        )
      ),
    ];
  }

  if (!sectionIds.length) return [];

  // Sections + levels
  const { data: sections } = await service
    .from('sections')
    .select('id, name, level_id, academic_year_id, levels(id, label)')
    .in('id', sectionIds)
    .eq('academic_year_id', (ay as { id: string }).id)
    .order('level_id')
    .order('name');

  if (!sections?.length) return [];

  // Subject configs for all levels in these sections
  const levelIds = [
    ...new Set((sections as { level_id: string }[]).map((s) => s.level_id)),
  ];
  const { data: configs } = await service
    .from('subject_configs')
    .select('subject_id, level_id, subjects(id, code, name)')
    .eq('academic_year_id', (ay as { id: string }).id)
    .in('level_id', levelIds);

  // Teacher's subject assignments (subject_teacher role)
  const { data: subjectAssignments } = isRegistrarPlus
    ? { data: null }
    : await service
        .from('teacher_assignments')
        .select('section_id, subject_id')
        .eq('teacher_user_id', userId)
        .eq('role', 'subject_teacher');

  const subjectsBySectionLevel = new Map<string, string[]>(); // level_id → [subject_id]
  for (const cfg of (configs ?? []) as {
    subject_id: string;
    level_id: string;
    subjects:
      | { id: string; code: string; name: string }
      | { id: string; code: string; name: string }[]
      | null;
  }[]) {
    const existing = subjectsBySectionLevel.get(cfg.level_id) ?? [];
    existing.push(cfg.subject_id);
    subjectsBySectionLevel.set(cfg.level_id, existing);
  }

  // SOW instances
  const { data: instances } = await service
    .from('sow_class_instances')
    .select(
      'id, section_id, subject_id, term_id, ww_labels, pt_labels, topics, copied_from_section_id, copied_at, updated_at'
    )
    .in('section_id', sectionIds);

  type InstanceRow = {
    id: string;
    section_id: string;
    subject_id: string;
    term_id: string;
    ww_labels: SowLabel[];
    pt_labels: SowLabel[];
    topics: SowTopic[];
    copied_from_section_id: string | null;
    copied_at: string | null;
    updated_at: string;
  };
  const instanceMap = new Map<string, InstanceRow>();
  for (const inst of (instances ?? []) as InstanceRow[]) {
    instanceMap.set(
      `${inst.section_id}:${inst.subject_id}:${inst.term_id}`,
      inst
    );
  }

  // Grading sheets existence
  const { data: sheetRows } = await service
    .from('grading_sheets')
    .select('section_id, subject_id, term_id')
    .in('section_id', sectionIds);

  const sheetSet = new Set(
    (sheetRows ?? []).map((s) => {
      const r = s as {
        section_id: string;
        subject_id: string;
        term_id: string;
      };
      return `${r.section_id}:${r.subject_id}:${r.term_id}`;
    })
  );

  // Subject name lookup
  const subjectById = new Map<string, { code: string; name: string }>();
  for (const cfg of (configs ?? []) as {
    subject_id: string;
    subjects:
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
  }[]) {
    const subj = Array.isArray(cfg.subjects) ? cfg.subjects[0] : cfg.subjects;
    if (subj) subjectById.set(cfg.subject_id, subj);
  }

  const rows: SowListItem[] = [];

  for (const sec of sections as {
    id: string;
    name: string;
    level_id: string;
    levels:
      | { id: string; label: string }
      | { id: string; label: string }[]
      | null;
  }[]) {
    const lvl = Array.isArray(sec.levels) ? sec.levels[0] : sec.levels;
    const levelSubjects = subjectsBySectionLevel.get(sec.level_id) ?? [];

    // For teachers: only show subjects they're assigned to teach in this section
    const relevantSubjects = isRegistrarPlus
      ? levelSubjects
      : levelSubjects.filter((sid) =>
          (subjectAssignments ?? []).some((a) => {
            const assign = a as { section_id: string; subject_id: string };
            return assign.section_id === sec.id && assign.subject_id === sid;
          })
        );

    for (const subjectId of relevantSubjects) {
      const subj = subjectById.get(subjectId);
      if (!subj) continue;

      for (const term of (terms ?? []) as {
        id: string;
        label: string;
        term_number: number;
      }[]) {
        const key = `${sec.id}:${subjectId}:${term.id}`;
        const inst = instanceMap.get(key);

        const hasGradingSheet = sheetSet.has(key);
        let status: SowStatusKind = 'empty';
        if (inst) {
          status = hasGradingSheet ? 'synced' : 'drafted';
        }

        rows.push({
          sow_id: inst?.id ?? null,
          section_id: sec.id,
          section_name: sec.name,
          level_id: sec.level_id,
          level_label: lvl?.label ?? sec.level_id,
          subject_id: subjectId,
          subject_name: subj.name,
          subject_code: subj.code,
          term_id: term.id,
          term_label: term.label,
          term_number: term.term_number,
          ww_count: (inst?.ww_labels ?? []).length,
          pt_count: (inst?.pt_labels ?? []).length,
          topic_count: (inst?.topics ?? []).length,
          status,
          has_grading_sheet: hasGradingSheet,
          copied_from_section_id: inst?.copied_from_section_id ?? null,
          copied_at: inst?.copied_at ?? null,
          updated_at: inst?.updated_at ?? null,
        });
      }
    }
  }

  return rows;
}

/**
 * Push SOW labels into a grading sheet (one-way, one-time, preserves scored cells).
 * The grading sheet must exist and must not be locked.
 */
export async function syncSowLabelsToSheet(
  sowId: string,
  sheetId: string
): Promise<{
  error: string | null;
  preserved: number;
  wwWritten: number;
  ptWritten: number;
}> {
  const service = createServiceClient();

  const [sowResult, sheetResult] = await Promise.all([
    service
      .from('sow_class_instances')
      .select('ww_labels, pt_labels')
      .eq('id', sowId)
      .maybeSingle(),
    service
      .from('grading_sheets')
      .select('is_locked')
      .eq('id', sheetId)
      .maybeSingle(),
  ]);

  if (!sowResult.data)
    return { error: 'SOW not found', preserved: 0, wwWritten: 0, ptWritten: 0 };
  if (!sheetResult.data)
    return {
      error: 'Sheet not found',
      preserved: 0,
      wwWritten: 0,
      ptWritten: 0,
    };
  if ((sheetResult.data as { is_locked: boolean }).is_locked) {
    return { error: 'sheet_locked', preserved: 0, wwWritten: 0, ptWritten: 0 };
  }

  const sow = sowResult.data as {
    ww_labels: SowLabel[];
    pt_labels: SowLabel[];
  };
  const { error, preserved } = await mergeGradingSheetSlots(
    service,
    sheetId,
    sow.ww_labels,
    sow.pt_labels
  );

  // Stamp provenance
  if (!error) {
    await service
      .from('grading_sheets')
      .update({ slot_labels_copied_at: new Date().toISOString() })
      .eq('id', sheetId);
  }

  return {
    error,
    preserved,
    wwWritten: sow.ww_labels.length,
    ptWritten: sow.pt_labels.length,
  };
}

/**
 * Seed SOW topics into a section's evaluation_checklist_items.
 * Items that already have ratings are preserved.
 */
export async function syncSowTopicsToChecklist(
  sowId: string,
  termId: string,
  subjectId: string,
  sectionId: string
): Promise<{ error: string | null; preserved: number; inserted: number }> {
  const service = createServiceClient();

  const { data: sow } = await service
    .from('sow_class_instances')
    .select('topics')
    .eq('id', sowId)
    .maybeSingle();

  if (!sow) return { error: 'SOW not found', preserved: 0, inserted: 0 };

  const topics = (sow as { topics?: SowTopic[] }).topics ?? [];
  const result = await mergeEvaluationTopics(
    service,
    {
      term_id: termId,
      subject_id: subjectId,
      section_id: sectionId,
      sow_instance_id: sowId,
    },
    topics
  );

  return {
    error: null,
    preserved: result.preserved,
    inserted: result.inserted,
  };
}
