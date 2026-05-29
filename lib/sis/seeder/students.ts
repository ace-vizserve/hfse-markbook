import type { SupabaseClient } from '@supabase/supabase-js';

import { pickNames } from './names';

export type SeedResult = {
  students_inserted: number;
  section_count: number;
  section_ids: string[];
};

// Slugifies a section name into a segment safe for legacy student_number formats
// (uppercase, A-Z0-9 only; spaces/punct collapse to `-`).
function slugSegment(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type SectionRow = {
  id: string;
  name: string;
  level_id: string;
  levels: { code: string } | { code: string }[] | null;
};

// Seeds the given academic year with test students, using the caller-supplied
// `perSection` list to control which sections are seeded and how many students
// each gets. Student numbers follow the H270{ayDigits}{seq4} format (e.g.
// H27099990001). The global sequence counter runs across all sections so
// numbers never collide. Per-section idempotency: any section that already
// has section_students rows is skipped; other sections proceed.
export async function seedTestAy(
  service: SupabaseClient,
  ayId: string,
  ayCode: string,
  opts: { perSection: Array<{ sectionId: string; count: number }> }
): Promise<SeedResult> {
  if (opts.perSection.length === 0) {
    return { students_inserted: 0, section_count: 0, section_ids: [] };
  }

  // Fetch T1 start_date so enrollment_date reflects the beginning of the year,
  // preventing KD #68's late-enrollee detector from misidentifying all seeded
  // students as late-enrollees.
  const { data: t1Row } = await service
    .from('terms')
    .select('start_date')
    .eq('academic_year_id', ayId)
    .eq('term_number', 1)
    .maybeSingle();
  const enrollDate =
    (t1Row as { start_date: string } | null)?.start_date ??
    new Date().toISOString().slice(0, 10);

  // Load section metadata for every requested section.
  const requestedIds = opts.perSection.map((p) => p.sectionId);
  const { data: sectionRows, error: sectionsErr } = await service
    .from('sections')
    .select('id, name, level_id, levels(code)')
    .in('id', requestedIds);

  if (sectionsErr || !sectionRows) {
    throw new Error(
      `seed: failed to list sections — ${sectionsErr?.message ?? 'no data'}`
    );
  }

  const sectionMap = new Map(
    (sectionRows as unknown as SectionRow[]).map((s) => [s.id, s])
  );

  // Per-section skip: check which of the requested sections already have
  // section_students rows. Only those specific sections are skipped.
  const { data: existingEnrol, error: enrolErr } = await service
    .from('section_students')
    .select('section_id')
    .in('section_id', requestedIds);

  if (enrolErr) {
    throw new Error(
      `seed: failed to check existing enrolments — ${enrolErr.message}`
    );
  }

  const occupiedSectionIds = new Set(
    (existingEnrol ?? []).map((r) => (r as { section_id: string }).section_id)
  );

  const toSeed = opts.perSection.filter(
    (p) => !occupiedSectionIds.has(p.sectionId)
  );

  if (toSeed.length === 0) {
    return { students_inserted: 0, section_count: 0, section_ids: [] };
  }

  // Build student number prefix from the AY code (e.g. AY9999 → 9999).
  const ayDigits = ayCode.replace(/^AY/i, '');

  // Build insert payloads. The global sequence counter runs across all
  // sections so H270{ayDigits}{seq4} values never collide within an AY.
  const studentInserts: Array<{
    student_number: string;
    first_name: string;
    last_name: string;
  }> = [];

  type Enrol = {
    section_id: string;
    student_number: string;
    index_number: number;
  };
  const enrolPlans: Enrol[] = [];

  let globalSeq = 0;

  for (const { sectionId, count } of toSeed) {
    const section = sectionMap.get(sectionId);
    if (!section) continue;

    const names = pickNames(`${ayCode}:${sectionId}`, count);

    for (let i = 0; i < count; i++) {
      globalSeq += 1;
      const seq4 = String(globalSeq).padStart(4, '0');
      const studentNumber = `H270${ayDigits}${seq4}`;

      studentInserts.push({
        student_number: studentNumber,
        first_name: names[i].first_name,
        last_name: names[i].last_name,
      });
      enrolPlans.push({
        section_id: sectionId,
        student_number: studentNumber,
        index_number: i + 1,
      });
    }
  }

  // Bulk upsert students (on conflict → update so a partial re-run is safe).
  const { data: insertedStudents, error: insertErr } = await service
    .from('students')
    .upsert(studentInserts, {
      onConflict: 'student_number',
      ignoreDuplicates: false,
    })
    .select('id, student_number');

  if (insertErr || !insertedStudents) {
    throw new Error(
      `seed: students insert failed — ${insertErr?.message ?? 'no data'}`
    );
  }

  const idByNumber = new Map(
    insertedStudents.map((r) => [
      (r as { student_number: string }).student_number,
      (r as { id: string }).id,
    ])
  );

  const enrolInserts = enrolPlans.map((e) => {
    const studentId = idByNumber.get(e.student_number);
    if (!studentId) {
      throw new Error(
        `seed: student ${e.student_number} was not returned by upsert — partial result set`
      );
    }
    return {
      section_id: e.section_id,
      student_id: studentId,
      index_number: e.index_number,
      enrollment_status: 'active' as const,
      enrollment_date: enrollDate,
    };
  });

  const { error: enrolInsertErr } = await service
    .from('section_students')
    .insert(enrolInserts);

  if (enrolInsertErr) {
    throw new Error(
      `seed: section_students insert failed — ${enrolInsertErr.message}`
    );
  }

  return {
    students_inserted: studentInserts.length,
    section_count: toSeed.length,
    section_ids: toSeed.map((p) => p.sectionId),
  };
}
