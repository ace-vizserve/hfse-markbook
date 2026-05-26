import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────────────────

export type SowLabel = {
  label: string;
  page: string | null;
};

export type SowTopic = {
  text: string;
  sort_order: number;
};

export type SowInstanceRow = {
  id: string;
  section_id: string;
  subject_id: string;
  term_id: string;
  ww_labels: SowLabel[];
  pt_labels: SowLabel[];
  topics: SowTopic[];
  copied_from_section_id: string | null;
  copied_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Instance fetching ────────────────────────────────────────────────────────

export async function getSowInstance(
  sectionId: string,
  subjectId: string,
  termId: string,
): Promise<SowInstanceRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_class_instances')
    .select('*')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .maybeSingle();
  return (data as SowInstanceRow | null) ?? null;
}

export async function getSowInstanceById(id: string): Promise<SowInstanceRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_class_instances')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as SowInstanceRow | null) ?? null;
}

// ── Coordinator review ───────────────────────────────────────────────────────

export type SowReviewRow = {
  sow_id: string | null;
  section_id: string;
  section_name: string;
  level_id: string;
  level_code: string;
  level_label: string;
  advisor_name: string | null;
  ww_labels: SowLabel[];
  pt_labels: SowLabel[];
  topic_count: number;
  topic_texts: string[];
  copied_from_section_name: string | null;
  copied_at: string | null;
  last_edited_at: string | null;
  has_grading_sheet: boolean;
};

export async function getSowReviewRows(
  termId: string,
  subjectId: string,
  ayCode: string,
): Promise<SowReviewRow[]> {
  const service = createServiceClient();

  // AY id
  const { data: ay } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (!ay) return [];

  // Sections in this AY with their levels and form advisers
  const { data: sections } = await service
    .from('sections')
    .select('id, name, level_id, levels(id, code, label)')
    .eq('academic_year_id', ay.id)
    .order('name');

  if (!sections?.length) return [];

  const sectionIds = sections.map((s) => (s as { id: string }).id);

  // SOW instances for this subject × term, across all sections
  const { data: instances } = await service
    .from('sow_class_instances')
    .select('id, section_id, ww_labels, pt_labels, topics, copied_from_section_id, copied_at, updated_at')
    .in('section_id', sectionIds)
    .eq('subject_id', subjectId)
    .eq('term_id', termId);

  type ReviewInstanceRow = {
    id: string;
    section_id: string;
    ww_labels: SowLabel[];
    pt_labels: SowLabel[];
    topics: SowTopic[];
    copied_from_section_id: string | null;
    copied_at: string | null;
    updated_at: string;
  };
  const instanceBySection = new Map<string, ReviewInstanceRow>(
    (instances ?? []).map((i) => {
      const row = i as ReviewInstanceRow;
      return [row.section_id, row];
    }),
  );

  // Copied-from section names
  const copiedFromIds = [
    ...new Set(
      (instances ?? [])
        .map((i) => (i as { copied_from_section_id: string | null }).copied_from_section_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: copiedFromSections } = copiedFromIds.length
    ? await service.from('sections').select('id, name').in('id', copiedFromIds)
    : { data: [] };
  const copiedFromName = new Map(
    (copiedFromSections ?? []).map((s) => [(s as { id: string }).id, (s as { name: string }).name]),
  );

  // Form adviser names for each section
  const { data: assignments } = await service
    .from('teacher_assignments')
    .select('section_id, teacher_user_id')
    .in('section_id', sectionIds)
    .eq('role', 'form_adviser');

  const adviserUserIds = [
    ...new Set((assignments ?? []).map((a) => (a as { teacher_user_id: string }).teacher_user_id)),
  ];
  const adviserNameById = new Map<string, string>();
  await Promise.all(
    adviserUserIds.map(async (uid) => {
      try {
        const { data: u } = await service.auth.admin.getUserById(uid);
        const meta = u?.user?.user_metadata as { display_name?: string } | undefined;
        adviserNameById.set(uid, meta?.display_name ?? u?.user?.email ?? uid);
      } catch {
        adviserNameById.set(uid, uid);
      }
    }),
  );
  const adviserBySectionId = new Map(
    (assignments ?? []).map((a) => {
      const row = a as { section_id: string; teacher_user_id: string };
      return [row.section_id, adviserNameById.get(row.teacher_user_id) ?? null];
    }),
  );

  // Grading sheets existence
  const { data: sheetRows } = await service
    .from('grading_sheets')
    .select('section_id')
    .in('section_id', sectionIds)
    .eq('subject_id', subjectId)
    .eq('term_id', termId);
  const sectionsWithSheets = new Set(
    (sheetRows ?? []).map((s) => (s as { section_id: string }).section_id),
  );

  const LEVEL_ORDER: Record<string, number> = {
    'YS-L': 0, 'YS-J': 1, 'YS-S': 2,
    P1: 3, P2: 4, P3: 5, P4: 6, P5: 7, P6: 8,
    S1: 9, S2: 10, S3: 11, S4: 12,
    CS1: 13, CS2: 14,
  };

  const rows = sections.map((s) => {
    const sec = s as {
      id: string;
      name: string;
      level_id: string;
      levels: { id: string; code: string; label: string } | { id: string; code: string; label: string }[] | null;
    };
    const lvl = Array.isArray(sec.levels) ? sec.levels[0] : sec.levels;
    const inst = instanceBySection.get(sec.id);

    return {
      sow_id: inst?.id ?? null,
      section_id: sec.id,
      section_name: sec.name,
      level_id: sec.level_id,
      level_code: lvl?.code ?? '',
      level_label: lvl?.label ?? sec.level_id,
      advisor_name: adviserBySectionId.get(sec.id) ?? null,
      ww_labels: inst?.ww_labels ?? [],
      pt_labels: inst?.pt_labels ?? [],
      topic_count: (inst?.topics ?? []).length,
      topic_texts: (inst?.topics ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => t.text),
      copied_from_section_name: inst?.copied_from_section_id
        ? copiedFromName.get(inst.copied_from_section_id) ?? null
        : null,
      copied_at: inst?.copied_at ?? null,
      last_edited_at: inst?.updated_at ?? null,
      has_grading_sheet: sectionsWithSheets.has(sec.id),
    } satisfies SowReviewRow;
  });

  rows.sort((a, b) => {
    const lo = (LEVEL_ORDER[a.level_code] ?? 99) - (LEVEL_ORDER[b.level_code] ?? 99);
    if (lo !== 0) return lo;
    return a.section_name.localeCompare(b.section_name);
  });

  return rows;
}

// ── Import helpers ───────────────────────────────────────────────────────────

export type ImportableSource = {
  section_id: string;
  section_name: string;
  level_label: string;
  ww_count: number;
  pt_count: number;
  topic_count: number;
  sow_id: string;
};

/** Peer sections the caller could import from: same level + subject, excluding the current section. */
export async function listImportableSowSources(
  currentSectionId: string,
  subjectId: string,
  termId: string,
): Promise<ImportableSource[]> {
  const service = createServiceClient();

  // Find the level of the current section
  const { data: sec } = await service
    .from('sections')
    .select('level_id, academic_year_id')
    .eq('id', currentSectionId)
    .maybeSingle();
  if (!sec) return [];

  const { level_id, academic_year_id } = sec as { level_id: string; academic_year_id: string };

  // All same-level sections in the same AY
  const { data: peers } = await service
    .from('sections')
    .select('id, name, levels(label)')
    .eq('academic_year_id', academic_year_id)
    .eq('level_id', level_id)
    .neq('id', currentSectionId)
    .order('name');

  if (!peers?.length) return [];

  const peerIds = peers.map((p) => (p as { id: string }).id);

  // SOW instances for these peers at this subject × term
  const { data: instances } = await service
    .from('sow_class_instances')
    .select('id, section_id, ww_labels, pt_labels, topics')
    .in('section_id', peerIds)
    .eq('subject_id', subjectId)
    .eq('term_id', termId);

  if (!instances?.length) return [];

  const instBySection = new Map(
    (instances ?? []).map((i) => [(i as { section_id: string }).section_id, i]),
  );

  return peers
    .map((p) => {
      const peer = p as {
        id: string;
        name: string;
        levels: { label: string } | { label: string }[] | null;
      };
      const inst = instBySection.get(peer.id);
      if (!inst) return null;
      const lvl = Array.isArray(peer.levels) ? peer.levels[0] : peer.levels;
      const row = inst as {
        id: string;
        ww_labels: SowLabel[];
        pt_labels: SowLabel[];
        topics: SowTopic[];
      };
      return {
        section_id: peer.id,
        section_name: peer.name,
        level_label: lvl?.label ?? '',
        ww_count: (row.ww_labels ?? []).length,
        pt_count: (row.pt_labels ?? []).length,
        topic_count: (row.topics ?? []).length,
        sow_id: row.id,
      } satisfies ImportableSource;
    })
    .filter((x): x is ImportableSource => x !== null);
}

/** Peer sheets for the Import Labels dialog: same (level × subject × term), different section. */
export async function listImportableSheetSources(
  currentSheetId: string,
): Promise<Array<{ sheet_id: string; section_name: string; ww_count: number; pt_count: number }>> {
  const service = createServiceClient();

  // Find the current sheet's section, level, subject, term
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('section_id, subject_id, term_id, sections(level_id, academic_year_id, name)')
    .eq('id', currentSheetId)
    .maybeSingle();
  if (!sheet) return [];

  const s = sheet as unknown as {
    section_id: string;
    subject_id: string;
    term_id: string;
    sections: { level_id: string; academic_year_id: string; name: string } | { level_id: string; academic_year_id: string; name: string }[] | null;
  };
  const sec = Array.isArray(s.sections) ? s.sections[0] : s.sections;
  if (!sec) return [];

  // All peer sections at the same level/AY
  const { data: peers } = await service
    .from('sections')
    .select('id, name')
    .eq('academic_year_id', sec.academic_year_id)
    .eq('level_id', sec.level_id)
    .neq('id', s.section_id)
    .order('name');

  if (!peers?.length) return [];
  const peerIds = peers.map((p) => (p as { id: string }).id);

  // Find peer sheets for the same subject + term
  const { data: peerSheets } = await service
    .from('grading_sheets')
    .select('id, section_id, slot_labels')
    .in('section_id', peerIds)
    .eq('subject_id', s.subject_id)
    .eq('term_id', s.term_id);

  if (!peerSheets?.length) return [];

  const sectionName = new Map(peers.map((p) => {
    const peer = p as { id: string; name: string };
    return [peer.id, peer.name];
  }));

  return peerSheets.map((ps) => {
    const row = ps as { id: string; section_id: string; slot_labels: { ww?: unknown[]; pt?: unknown[] } | null };
    const labels = row.slot_labels ?? { ww: [], pt: [] };
    return {
      sheet_id: row.id,
      section_name: sectionName.get(row.section_id) ?? row.section_id,
      ww_count: (labels.ww ?? []).filter(Boolean).length,
      pt_count: (labels.pt ?? []).filter(Boolean).length,
    };
  });
}
