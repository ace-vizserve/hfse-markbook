import type { SupabaseClient } from '@supabase/supabase-js';

import { seedDemoExtras, type DemoExtrasResult } from './demo-extras';
import { seedMovements } from './movements';
import { hashString, mulberry32, prefixFor } from './random';

import { computeQuarterly } from '@/lib/compute/quarterly';
import {
  LEVEL_LABELS,
  LEVEL_CODES,
  LEVEL_TYPE_BY_CODE,
  type LevelCode,
} from '@/lib/sis/levels';
import { invalidateAllOperationalDrills } from '@/lib/cache/invalidate-drill-tags';
import { DOCUMENT_SLOTS, STP_CONDITIONAL_SLOT_KEYS } from '@/lib/sis/queries';
import { fetchAllPages } from '@/lib/supabase/paginate';

import { pickNames } from './names';

// Populated seeder — layers on top of `ensureTestStructure`. Once structure
// + students are in place, this fills grade entries, attendance, evaluation
// writeups, admissions-funnel rows, discount codes, and a demo publication
// window so every module renders populated screens instead of empty states.
//
// Each step is self-healing: computes the expected row set, subtracts what
// already exists keyed on the natural identifier (grading_sheet ×
// section_student, term × student, enroleeNumber, etc.), and inserts the
// remainder. Re-running fills in gaps from a previously-aborted seed
// without duplicating existing rows. Tables with a true unique constraint
// use `upsert({ ignoreDuplicates: true })`; append-only tables filter
// in JS before insert.

export type PopulatedSeedResult = {
  grade_entries_inserted: number;
  attendance_daily_inserted: number;
  attendance_rollups_built: number;
  evaluation_writeups_inserted: number;
  admissions_apps_inserted: number;
  enrolled_applications_inserted: number;
  teacher_form_adviser_assignments: number;
  teacher_subject_assignments: number;
  discount_codes_inserted: number;
  publications_inserted: number;
  documents_inserted: number;
  movements_inserted: number;
  demo_extras: DemoExtrasResult | null;
};

export async function seedPopulated(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<PopulatedSeedResult> {
  const result: PopulatedSeedResult = {
    grade_entries_inserted: 0,
    attendance_daily_inserted: 0,
    attendance_rollups_built: 0,
    evaluation_writeups_inserted: 0,
    admissions_apps_inserted: 0,
    enrolled_applications_inserted: 0,
    teacher_form_adviser_assignments: 0,
    teacher_subject_assignments: 0,
    discount_codes_inserted: 0,
    publications_inserted: 0,
    documents_inserted: 0,
    movements_inserted: 0,
    demo_extras: null,
  };

  // ---- 1. Grade entries ----
  result.grade_entries_inserted = await seedGradeEntries(service, testAy);

  // Lock all T1 sheets to reflect the closed-term state. T2 stays unlocked
  // so the registrar can demo entry edits, change-request submission, etc.
  {
    const { data: t1 } = await service
      .from('terms')
      .select('id, end_date')
      .eq('academic_year_id', testAy.id)
      .eq('term_number', 1)
      .maybeSingle();
    if (t1 && (t1 as { end_date: string | null }).end_date) {
      const endDateIso = `${(t1 as { end_date: string }).end_date}T23:59:59+08:00`;
      const { error } = await service
        .from('grading_sheets')
        .update({ is_locked: true, locked_at: endDateIso })
        .eq('term_id', (t1 as { id: string }).id)
        .eq('is_locked', false);
      if (error) {
        console.error('[populated seeder] T1 lock pass failed:', error.message);
      }
    }
  }

  // ---- 2. Attendance daily + rollups ----
  const att = await seedAttendanceSummary(service, testAy);
  result.attendance_daily_inserted = att.daily;
  result.attendance_rollups_built = att.rollups;

  // ---- 3. Teacher assignments (form advisers + subject teachers) ----
  const ta = await seedTeacherAssignments(service, testAy);
  result.teacher_form_adviser_assignments = ta.form_adviser;
  result.teacher_subject_assignments = ta.subject_teacher;

  // ---- 4. Evaluation writeups ----
  result.evaluation_writeups_inserted = await seedEvaluationWriteups(service, testAy);

  // ---- 5. Enrolled-stage admissions rows (Records/Admissions detail pages
  //        need these to resolve for the seeded TEST-% students) ----
  result.enrolled_applications_inserted = await seedEnrolledAdmissionsRows(
    service,
    testAy,
  );

  // ---- 6. Admissions pre-enrolment funnel (non-enrolled stages) ----
  result.admissions_apps_inserted = await seedAdmissionsFunnel(service, testAy);

  // ---- 7. Discount codes ----
  result.discount_codes_inserted = await seedDiscountCodes(service, testAy);

  // ---- 8. One demo publication window ----
  result.publications_inserted = await seedPublication(service, testAy);

  // ---- 9. Admissions documents (P-Files dashboards + lifecycle widget) ----
  result.documents_inserted = await seedAdmissionsDocuments(service, testAy);

  // ---- 10. Demo-extras pass — fills dashboard charts + KPIs that the base
  //          seeder leaves thin (extra publications, parent accounts,
  //          P-File outreach + wider expiry buckets, evaluation lifecycle,
  //          typed calendar events + audience overrides). Idempotent;
  //          safe to re-run on a partially-seeded AY9999. See
  //          `lib/sis/seeder/demo-extras.ts`.
  result.demo_extras = await seedDemoExtras(service, testAy);

  // ---- 11. Enrolment movements — synthetic audit_log rows so the
  //          /records/movements page renders populated demo data.
  //          Audit-only writes; rosters are not mutated. See
  //          `lib/sis/seeder/movements.ts`.
  result.movements_inserted = await seedMovements(service, testAy);

  // ---- 12. Bust the per-AY drill caches so a freshly-seeded environment
  //          renders without waiting for the 60s unstable_cache TTL.
  //          Critical for the Top-absent dashboard tile, which reads from
  //          buildAllRowSets — a stale snapshot would show 0 absences while
  //          the lazy-fetched drill sheet shows the real rows.
  invalidateAllOperationalDrills(testAy.ay_code);

  return result;
}

// For every (grading_sheet × section_student) pair in T1, insert a
// fully-computed grade_entry (plausible scores + quarterly via
// `computeQuarterly`). For T2 (the active term), insert a PARTIAL entry
// — one WW slot only, empty pt_scores, null qa_score — so the registrar
// can demo entry edits + change-request submission against an "in
// progress" sheet. T3+T4 stay untouched.
async function seedGradeEntries(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  // Skip if any grade_entries already exist for this AY's sheets.
  const { data: sheetIds } = await service
    .from('grading_sheets')
    .select('id, term_id, section_id, subject_config_id, ww_totals, pt_totals, qa_total')
    .in(
      'term_id',
      (
        await service.from('terms').select('id').eq('academic_year_id', testAy.id)
      ).data?.map((r) => (r as { id: string }).id) ?? [],
    );
  const sheets = (sheetIds ?? []) as Array<{
    id: string;
    term_id: string;
    section_id: string;
    subject_config_id: string;
    ww_totals: number[] | null;
    pt_totals: number[] | null;
    qa_total: number | null;
  }>;
  if (sheets.length === 0) return 0;

  // Idempotent: rely on the migration-035 unique index
  // `(grading_sheet_id, section_student_id)` — duplicate insert attempts
  // are silently dropped by the upsert below. Re-runs only fill in the
  // rows missing from a partial prior seed.

  // Narrow to T1 only — we want T1 publishable-ready, T2+ mostly empty so
  // the registrar can exercise the entry flow. Fetch terms to identify T1.
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, start_date, end_date')
    .eq('academic_year_id', testAy.id)
    .order('term_number');
  const terms = (termRows ?? []) as Array<{
    id: string;
    term_number: number;
    start_date: string | null;
    end_date: string | null;
  }>;
  const t1 = terms.find((t) => t.term_number === 1);
  const t2 = terms.find((t) => t.term_number === 2);
  if (!t1) return 0;

  const targetTermIds = t2 ? [t1.id, t2.id] : [t1.id];
  const targetSheets = sheets.filter((s) => targetTermIds.includes(s.term_id));

  // Pull every section_student per section we're about to seed.
  const sectionIds = [...new Set(targetSheets.map((s) => s.section_id))];
  const { data: enrolments } = await service
    .from('section_students')
    .select('id, section_id, student_id')
    .in('section_id', sectionIds);
  const enrolmentsBySection = new Map<string, Array<{ id: string; student_id: string }>>();
  for (const e of (enrolments ?? []) as Array<{
    id: string;
    section_id: string;
    student_id: string;
  }>) {
    if (!enrolmentsBySection.has(e.section_id)) enrolmentsBySection.set(e.section_id, []);
    enrolmentsBySection.get(e.section_id)!.push({ id: e.id, student_id: e.student_id });
  }

  // Pull weights per subject_config_id (needed for computeQuarterly).
  const configIds = [...new Set(targetSheets.map((s) => s.subject_config_id))];
  const { data: cfgs } = await service
    .from('subject_configs')
    .select('id, ww_weight, pt_weight, qa_weight')
    .in('id', configIds);
  const configById = new Map(
    ((cfgs ?? []) as Array<{
      id: string;
      ww_weight: number;
      pt_weight: number;
      qa_weight: number;
    }>).map((c) => [c.id, c]),
  );

  type InsertRow = {
    grading_sheet_id: string;
    section_student_id: string;
    ww_scores: number[];
    pt_scores: number[];
    qa_score: number | null;
    ww_ps: number | null;
    pt_ps: number | null;
    qa_ps: number | null;
    initial_grade: number | null;
    quarterly_grade: number | null;
    is_na: boolean;
    created_at: string;
  };
  const inserts: InsertRow[] = [];

  const rand = mulberry32(hashString(`${testAy.ay_code}:grades`));
  // Plausible score generator — centered around ~85 with variance.
  const scoreFor = (max: number) => {
    const pct = 0.70 + rand() * 0.25; // 70–95%
    return Math.round(pct * max);
  };

  // Spread `created_at` across the term window so the per-day velocity
  // chart shows a distribution instead of one spike. T1 (closed): full
  // start→end span. T2 (active): start→today. Falls back to seed-time
  // if the term lacks dates.
  const todayMs = Date.now();
  const createdAtForTerm = (termId: string): string => {
    const term = termId === t1.id ? t1 : t2;
    if (!term?.start_date) return new Date().toISOString();
    const startMs = new Date(`${term.start_date}T00:00:00+08:00`).getTime();
    const upperIso =
      termId === t1.id && term.end_date
        ? `${term.end_date}T23:59:59+08:00`
        : null;
    const upperMs = upperIso ? new Date(upperIso).getTime() : todayMs;
    if (upperMs <= startMs) return new Date().toISOString();
    const ms = startMs + Math.floor(rand() * (upperMs - startMs));
    return new Date(ms).toISOString();
  };

  for (const sheet of targetSheets) {
    const enrolments = enrolmentsBySection.get(sheet.section_id) ?? [];
    const cfg = configById.get(sheet.subject_config_id);
    if (!cfg) continue;

    const ww_totals = (sheet.ww_totals ?? [10, 10]).length > 0 ? sheet.ww_totals! : [10, 10];
    const pt_totals =
      (sheet.pt_totals ?? [10, 10, 10]).length > 0 ? sheet.pt_totals! : [10, 10, 10];
    const qa_total = sheet.qa_total ?? 30;

    const isT1 = sheet.term_id === t1.id;

    for (const e of enrolments) {
      if (isT1) {
        // T1 (closed): fill 100% — full WW + PT + QA, computed quarterly.
        const ww_scores = ww_totals.map((max) => scoreFor(max));
        const pt_scores = pt_totals.map((max) => scoreFor(max));
        const qa_score = scoreFor(qa_total);

        const computed = computeQuarterly({
          ww_scores,
          ww_totals,
          pt_scores,
          pt_totals,
          qa_score,
          qa_total,
          ww_weight: cfg.ww_weight,
          pt_weight: cfg.pt_weight,
          qa_weight: cfg.qa_weight,
        });

        inserts.push({
          grading_sheet_id: sheet.id,
          section_student_id: e.id,
          ww_scores,
          pt_scores,
          qa_score,
          ww_ps: computed.ww_ps,
          pt_ps: computed.pt_ps,
          qa_ps: computed.qa_ps,
          initial_grade: computed.initial_grade,
          quarterly_grade: computed.quarterly_grade,
          is_na: false,
          created_at: createdAtForTerm(sheet.term_id),
        });
      } else {
        // T2 (active): seed a PARTIAL entry — one WW slot only, empty
        // PT, null QA. Sheets look "in progress"; quarterly stays null
        // until the rest of the slots are filled. Still call
        // computeQuarterly so ww_ps reflects the single slot recorded.
        const firstMax = ww_totals[0] ?? 10;
        const ww_scores = [scoreFor(firstMax)];
        const pt_scores: number[] = [];
        const qa_score = null;

        const computed = computeQuarterly({
          ww_scores,
          ww_totals,
          pt_scores,
          pt_totals,
          qa_score,
          qa_total,
          ww_weight: cfg.ww_weight,
          pt_weight: cfg.pt_weight,
          qa_weight: cfg.qa_weight,
        });

        inserts.push({
          grading_sheet_id: sheet.id,
          section_student_id: e.id,
          ww_scores,
          pt_scores,
          qa_score,
          ww_ps: computed.ww_ps,
          pt_ps: computed.pt_ps,
          qa_ps: computed.qa_ps,
          initial_grade: computed.initial_grade,
          quarterly_grade: computed.quarterly_grade,
          is_na: false,
          created_at: createdAtForTerm(sheet.term_id),
        });
      }
    }
  }

  // Chunked upsert — 500 rows per round-trip. ignoreDuplicates against the
  // migration-035 unique index lets re-runs fill in only the rows missing
  // from a prior partial seed.
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const slice = inserts.slice(i, i + CHUNK);
    const { error } = await service.from('grade_entries').upsert(slice, {
      onConflict: 'grading_sheet_id,section_student_id',
      ignoreDuplicates: true,
    });
    if (!error) inserted += slice.length;
  }
  return inserted;
}

// Daily attendance for T1+T2 with a temporal split. T1 (closed term):
// every encodable school day is seeded. T2 (active term): only dates up
// to today, so the demo AY shows a partial-month-in-progress state. T3+T4
// stay empty.
//
// Inserts one `attendance_daily` row per (section_student × encodable
// school day in window) with a P-heavy random status distribution, then
// calls the `recompute_attendance_rollup` RPC per (section_student, term)
// so `attendance_records` mirrors what the wide-grid shows. Production
// uses the same rollup path — seeding via the same pipeline keeps the
// two views consistent.
async function seedAttendanceSummary(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ daily: number; rollups: number }> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, start_date, end_date')
    .eq('academic_year_id', testAy.id)
    .in('term_number', [1, 2])
    .order('term_number');
  const terms = (termRows ?? []) as Array<{
    id: string;
    term_number: number;
    start_date: string | null;
    end_date: string | null;
  }>;
  if (terms.length === 0) return { daily: 0, rollups: 0 };

  // Idempotent: build the full expected (section_student × date) set for
  // each term's encodable days, subtract any tuples that already exist in
  // attendance_daily, and insert the remainder. attendance_daily has no
  // unique constraint (append-only — corrections insert a new row and
  // latest recorded_at wins), so we filter manually before inserting.

  // All enrolments in the AY (shared across both terms).
  const { data: sections } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', testAy.id);
  const sectionIds = (sections ?? []).map((r) => (r as { id: string }).id);
  if (sectionIds.length === 0) return { daily: 0, rollups: 0 };
  const { data: enrolments } = await service
    .from('section_students')
    .select('id')
    .in('section_id', sectionIds);
  const enrolList = ((enrolments ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (enrolList.length === 0) {
    console.warn('[populated seeder] attendance: no enrolments in test AY — skipping');
    return { daily: 0, rollups: 0 };
  }

  // Weighted random status picker (P heavy, small mix of L/A/EX). Single
  // PRNG instance threaded across both terms so determinism holds. EX rows
  // also get an `ex_reason` from the migration-015 enum so the donut /
  // compassionate-quota drill have meaningful spread (KD #50).
  const rand = mulberry32(hashString(`${testAy.ay_code}:attendance-daily`));
  type ExReason = 'mc' | 'compassionate' | 'school_activity';
  function pickExReason(): ExReason {
    const r = rand();
    if (r < 0.6) return 'mc';
    if (r < 0.85) return 'school_activity';
    return 'compassionate';
  }
  function pickStatus(): {
    status: 'P' | 'L' | 'A' | 'EX';
    ex_reason: ExReason | null;
  } {
    const r = rand();
    if (r < 0.9) return { status: 'P', ex_reason: null };
    if (r < 0.94) return { status: 'L', ex_reason: null };
    if (r < 0.97) return { status: 'A', ex_reason: null };
    return { status: 'EX', ex_reason: pickExReason() };
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  let insertedDaily = 0;
  let rollupCount = 0;

  for (const term of terms) {
    // Encodable school days in this term (school_day + hbl).
    const { data: calendarRows } = await service
      .from('school_calendar')
      .select('date, day_type')
      .eq('term_id', term.id)
      .in('day_type', ['school_day', 'hbl'])
      .order('date');
    let schoolDays = ((calendarRows ?? []) as Array<{ date: string; day_type: string }>).map(
      (r) => r.date,
    );
    if (schoolDays.length === 0) {
      console.warn(
        `[populated seeder] attendance: no encodable school days in T${term.term_number} — skipping`,
      );
      continue;
    }

    // Temporal split: if today falls inside this term's window, only seed
    // dates up to today. T1 closed (today > end_date) → no filter, all
    // dates seeded. T2 active (start_date <= today <= end_date) → today
    // is the upper bound. Term entirely in the future (today < start_date)
    // → schoolDays becomes empty and we skip.
    if (term.start_date && term.end_date) {
      if (todayIso >= term.start_date && todayIso <= term.end_date) {
        schoolDays = schoolDays.filter((d) => d <= todayIso);
      } else if (todayIso < term.start_date) {
        // Entirely future — leave T-future empty.
        continue;
      }
      // else: entirely past (todayIso > end_date) → no filter.
    }
    if (schoolDays.length === 0) continue;

    // Build the expected set for this term, then exclude tuples that
    // already exist (re-runs only fill in the diff).
    const allRows: Array<{
      section_student_id: string;
      term_id: string;
      date: string;
      status: 'P' | 'L' | 'A' | 'EX';
      ex_reason: ExReason | null;
    }> = [];
    for (const enrolmentId of enrolList) {
      for (const date of schoolDays) {
        const picked = pickStatus();
        allRows.push({
          section_student_id: enrolmentId,
          term_id: term.id,
          date,
          status: picked.status,
          ex_reason: picked.ex_reason,
        });
      }
    }

    // Page over existing tuples for this term so we don't insert
    // duplicates. PostgREST caps single responses at 1000 rows; use the
    // shared paginate helper (KD note in lib/supabase/paginate.ts).
    const existingDailyRows = await fetchAllPages<{
      section_student_id: string;
      date: string;
    }>((from, to) =>
      service
        .from('attendance_daily')
        .select('section_student_id, date')
        .eq('term_id', term.id)
        .range(from, to),
    );
    const existingTuples = new Set(
      existingDailyRows.map((r) => `${r.section_student_id}|${r.date}`),
    );
    const rows = allRows.filter(
      (r) => !existingTuples.has(`${r.section_student_id}|${r.date}`),
    );

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await service.from('attendance_daily').insert(slice);
      if (error) {
        console.error(
          `[populated seeder] attendance_daily T${term.term_number} insert failed:`,
          error.message,
        );
        continue;
      }
      insertedDaily += slice.length;
    }

    // Fire the rollup RPC once per section_student × term so
    // `attendance_records` reflects the daily ledger. Same path
    // production uses after each daily write.
    for (const enrolmentId of enrolList) {
      const { error } = await service.rpc('recompute_attendance_rollup', {
        p_term_id: term.id,
        p_section_student_id: enrolmentId,
      });
      if (error) {
        console.error(
          `[populated seeder] rollup RPC failed for T${term.term_number} ${enrolmentId}:`,
          error.message,
        );
        continue;
      }
      rollupCount += 1;
    }
  }

  return { daily: insertedDaily, rollups: rollupCount };
}

// Seeds evaluation writeups across T1 (closed) + T2 (active). T1: 5
// submitted writeups per section, submitted_at = T1.end_date so the
// pre-publish checklist on the publish-window panel shows green on the
// "adviser comments" line for the demo section. T2: 3 writeups per
// section — 2 submitted (submitted_at = today − 7 days) + 1 still in
// draft (submitted=false, submitted_at=null) — so the demo shows an
// active term with mixed progress. T3+T4 stay untouched.
async function seedEvaluationWriteups(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, end_date')
    .eq('academic_year_id', testAy.id)
    .in('term_number', [1, 2])
    .order('term_number');
  const terms = (termRows ?? []) as Array<{
    id: string;
    term_number: number;
    end_date: string | null;
  }>;
  if (terms.length === 0) return 0;
  const t1 = terms.find((t) => t.term_number === 1);
  const t2 = terms.find((t) => t.term_number === 2);

  // Idempotent: migration-018 unique `(term_id, student_id)` lets the
  // upsert below silently drop duplicates on re-run.

  const { data: sections } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', testAy.id);
  const sectionIds = (sections ?? []).map((r) => (r as { id: string }).id);
  if (sectionIds.length === 0) return 0;

  const rand = mulberry32(hashString(`${testAy.ay_code}:writeups`));
  const TEMPLATES = [
    'Shows steady improvement this term. Participates well in group activities and demonstrates a strong sense of responsibility during classroom duties.',
    'A diligent learner who asks thoughtful questions. Could benefit from more proactive contributions in discussions.',
    'Exemplifies the virtue through consistent effort and kindness toward peers. Academic focus has strengthened noticeably.',
    'Demonstrates genuine curiosity and persistence in the face of challenges. Continues to develop leadership presence.',
    'A pleasure to have in class — composed, attentive, and supportive of classmates who need help.',
  ];

  const writeupRows: Array<{
    term_id: string;
    student_id: string;
    section_id: string;
    writeup: string;
    submitted: boolean;
    submitted_at: string | null;
  }> = [];

  // T1 timestamp: prefer the term's end_date (closed-term semantics);
  // fall back to now() if the AY hasn't filled term dates yet.
  const t1SubmittedAt =
    t1 && t1.end_date
      ? `${t1.end_date}T17:00:00+08:00`
      : new Date().toISOString();
  // T2 "submitted recently" timestamp: today − 7 days.
  const t2SubmittedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const sectionId of sectionIds) {
    // T1 — 5 submitted writeups per section (end-of-term snapshot).
    if (t1) {
      const { data: enrolments } = await service
        .from('section_students')
        .select('student_id')
        .eq('section_id', sectionId)
        .limit(5);
      const students = (enrolments ?? []) as Array<{ student_id: string }>;
      for (const s of students) {
        const tmpl = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
        writeupRows.push({
          term_id: t1.id,
          student_id: s.student_id,
          section_id: sectionId,
          writeup: tmpl,
          submitted: true,
          submitted_at: t1SubmittedAt,
        });
      }
    }

    // T2 — 3 writeups per section: 2 submitted ~7 days ago + 1 draft.
    if (t2) {
      const { data: enrolments } = await service
        .from('section_students')
        .select('student_id')
        .eq('section_id', sectionId)
        .limit(3);
      const students = (enrolments ?? []) as Array<{ student_id: string }>;
      students.forEach((s, idx) => {
        const tmpl = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
        const isDraft = idx === 2; // last of the 3 is still in draft
        writeupRows.push({
          term_id: t2.id,
          student_id: s.student_id,
          section_id: sectionId,
          writeup: tmpl,
          submitted: !isDraft,
          submitted_at: isDraft ? null : t2SubmittedAt,
        });
      });
    }
  }

  if (writeupRows.length === 0) return 0;
  const { error } = await service
    .from('evaluation_writeups')
    .upsert(writeupRows, {
      onConflict: 'term_id,student_id',
      ignoreDuplicates: true,
    });
  return error ? 0 : writeupRows.length;
}

// Canonical applicationStatus union — matches STAGE_STATUS_OPTIONS.application
// in lib/schemas/sis.ts (post-Directus consolidation 2026-04-24).
type ApplicationStatus =
  | 'Submitted'
  | 'Ongoing Verification'
  | 'Processing'
  | 'Enrolled'
  | 'Enrolled (Conditional)'
  | 'Cancelled'
  | 'Withdrawn';

// Per-funnel-stage 5-prereq fill profile. The five columns line up with
// ENROLLED_PREREQ_STAGES + STAGE_TERMINAL_STATUS in lib/schemas/sis.ts.
type StageProgression = {
  registrationStatus: string | null;
  documentStatus: string | null;
  assessmentStatus: string | null;
  contractStatus: string | null;
  feeStatus: string | null;
};

// Builds a plausible per-stage status fill given a profile name. Profiles
// map 1:1 to applicationStatus values except for "withdrawn-pre-enrolment"
// which is a sub-flavor of Withdrawn (got far in the pipeline before pulling
// out). The lifecycle aggregate widget keys off this column matrix to slot
// rows into "ungated to enroll" / "at contract" / "at fees" buckets.
function stageProgressionFor(
  profile:
    | 'submitted'
    | 'ongoing-verification'
    | 'processing'
    | 'cancelled'
    | 'withdrawn-pre-enrolment',
  rand: () => number,
): StageProgression & { ungatedToEnroll: boolean } {
  switch (profile) {
    case 'submitted':
      return {
        registrationStatus: null,
        documentStatus: null,
        assessmentStatus: null,
        contractStatus: null,
        feeStatus: null,
        ungatedToEnroll: false,
      };
    case 'ongoing-verification':
      return {
        registrationStatus: 'Finished',
        documentStatus: rand() < 0.5 ? 'Pending' : 'Verified',
        assessmentStatus: 'Pending',
        contractStatus: null,
        feeStatus: null,
        ungatedToEnroll: false,
      };
    case 'processing': {
      // ~45% of Processing rows are fully ungated (all 5 prereqs at terminal
      // status) — appears in the "Ungated to enroll" lifecycle bucket as
      // ready-to-flip applicants the registrar should be processing.
      const ungated = rand() < 0.45;
      if (ungated) {
        return {
          registrationStatus: 'Finished',
          documentStatus: 'Finished',
          assessmentStatus: 'Finished',
          contractStatus: 'Signed',
          feeStatus: 'Paid',
          ungatedToEnroll: true,
        };
      }
      const r = rand();
      if (r < 0.33) {
        // At contract stage — assessment finished, contract drafted/sent.
        return {
          registrationStatus: 'Finished',
          documentStatus: 'Finished',
          assessmentStatus: 'Finished',
          contractStatus: rand() < 0.5 ? 'Generated' : 'Sent',
          feeStatus: 'Pending',
          ungatedToEnroll: false,
        };
      } else if (r < 0.66) {
        // At fee stage — contract signed, awaiting payment.
        return {
          registrationStatus: 'Finished',
          documentStatus: 'Finished',
          assessmentStatus: 'Finished',
          contractStatus: 'Signed',
          feeStatus: rand() < 0.5 ? 'Invoiced' : 'Re-invoiced',
          ungatedToEnroll: false,
        };
      } else {
        // At assessment stage — registration + docs done, assessment pending.
        return {
          registrationStatus: 'Finished',
          documentStatus: 'Finished',
          assessmentStatus: rand() < 0.5 ? 'Pending' : 'Ongoing Assessment',
          contractStatus: null,
          feeStatus: null,
          ungatedToEnroll: false,
        };
      }
    }
    case 'cancelled':
      return {
        registrationStatus: rand() < 0.5 ? 'Cancelled' : 'Pending',
        documentStatus: null,
        assessmentStatus: null,
        contractStatus: null,
        feeStatus: null,
        ungatedToEnroll: false,
      };
    case 'withdrawn-pre-enrolment':
      // Got partway then pulled out — show effort-spent through assessment.
      return {
        registrationStatus: 'Finished',
        documentStatus: 'Finished',
        assessmentStatus: 'Finished',
        contractStatus: null,
        feeStatus: null,
        ungatedToEnroll: false,
      };
    default:
      return {
        registrationStatus: null,
        documentStatus: null,
        assessmentStatus: null,
        contractStatus: null,
        feeStatus: null,
        ungatedToEnroll: false,
      };
  }
}

// Canonical funnel mix used by seedAdmissionsFunnel — total 33 rows across
// the five non-Enrolled applicationStatus values. Distribution chosen so the
// dashboard's lifecycle aggregate has data in every bucket: Submitted (no
// admin work), Ongoing Verification (in-flight), Processing (varied — some
// ungated, some at contract/fees/assessment), Cancelled (admin-killed),
// Withdrawn (pulled out partway).
const FUNNEL_PROFILES: ReadonlyArray<{
  applicationStatus: ApplicationStatus;
  count: number;
  stageProfile:
    | 'submitted'
    | 'ongoing-verification'
    | 'processing'
    | 'cancelled'
    | 'withdrawn-pre-enrolment';
}> = [
  { applicationStatus: 'Submitted', count: 8, stageProfile: 'submitted' },
  { applicationStatus: 'Ongoing Verification', count: 8, stageProfile: 'ongoing-verification' },
  { applicationStatus: 'Processing', count: 12, stageProfile: 'processing' },
  { applicationStatus: 'Cancelled', count: 3, stageProfile: 'cancelled' },
  { applicationStatus: 'Withdrawn', count: 2, stageProfile: 'withdrawn-pre-enrolment' },
];

// 4-value enum mirrored across the apps row's `category` and the status row's
// `enroleeType`. They always agree. Distribution: ~70% Current (returning),
// ~25% New (first-time), ~3% VizSchool Current, ~2% VizSchool New.
type EnroleeCategoryValue = 'New' | 'Current' | 'VizSchool New' | 'VizSchool Current';
function pickEnroleeCategory(rand: () => number): EnroleeCategoryValue {
  const r = rand();
  if (r < 0.70) return 'Current';
  if (r < 0.95) return 'New';
  if (r < 0.98) return 'VizSchool Current';
  return 'VizSchool New';
}

// Realistic class-type values seen in production parent-portal submissions.
const CLASS_TYPES = [
  'Enrichment Class',
  'Global Class 3 (ENGLISH + FRENCH)',
  'Global Class 1 (ENGLISH + CHINESE)',
  'Cambridge Lower Secondary',
  'Standard',
] as const;
const PAYMENT_OPTIONS = ['Option 1', 'Option 2'] as const;
const CONTRACT_SIGNATORIES = ['Father', 'Mother', 'Guardian'] as const;
const PASS_TYPES = ['Singapore PR', 'S-PASS', 'Dependent Pass', null] as const;
// Real sample image URL — keeps every funnel + enrolled row's
// `applications.enroleePhoto` clickable / renderable in the SIS Records
// + admissions detail surfaces. Same asset the docs seeder uses for
// idPicture / icaPhoto slots.
const PLACEHOLDER_PHOTO =
  'https://vnhklhppftebbcuupfjw.supabase.co/storage/v1/object/public/parent-portal/ay2027/documents/1774407491653_favicon.png';

// Yes/No string flags — real production rows store these as strings, not bools.
const YES_NO = ['Yes', 'No'] as const;

// STP application type — set on the foreign-student personas (parent-portal
// gates 3 specific document slots when this is non-null per the STP workflow).
const STP_APPLICATION_TYPE = 'New Student Pass Application';

// Sample residenceHistory JSON for STP applicants. Stored as a JSON string in
// the column (matches production format).
const STP_RESIDENCE_HISTORY =
  '[{"toYear":"Present","country":"Singapore","fromYear":2020,"cityOrTown":"Singapore","purposeOfStay":"Schooling"}]';

// Parent / guardian name pools — small deterministic lists so seeded
// applicants ship with realistic mother / father / guardian rows. In
// production every application carries these from intake (parent portal
// writes them alongside enroleeNumber + studentNumber); the seeder
// mirrors that shape.
const MOTHER_FIRST_NAMES = [
  'Maria',
  'Anna',
  'Linda',
  'Susan',
  'Jennifer',
  'Mary',
  'Patricia',
  'Karen',
  'Nancy',
  'Elizabeth',
  'Margaret',
  'Lisa',
  'Helen',
  'Sandra',
  'Donna',
  'Carol',
  'Sharon',
  'Michelle',
  'Laura',
  'Sarah',
] as const;
const FATHER_FIRST_NAMES = [
  'John',
  'David',
  'Michael',
  'James',
  'Robert',
  'William',
  'Richard',
  'Joseph',
  'Thomas',
  'Charles',
  'Christopher',
  'Daniel',
  'Paul',
  'Mark',
  'Donald',
  'Steven',
  'Andrew',
  'Kenneth',
  'George',
  'Brian',
] as const;
const GUARDIAN_FIRST_NAMES = [
  'Antonio',
  'Carlos',
  'Eduardo',
  'Felipe',
  'Hector',
  'Isabel',
  'Sofia',
  'Carmen',
  'Lucia',
  'Beatriz',
] as const;
const GUARDIAN_LAST_NAMES = [
  'Tan',
  'Lim',
  'Cruz',
  'Garcia',
  'Reyes',
  'Santos',
  'Wong',
  'Lee',
] as const;
const NATIONALITY_BY_PASS: Record<string, string> = {
  'Singapore PR': 'Singaporean',
  'S-PASS': 'Filipino',
  'Dependent Pass': 'Indian',
};
const FALLBACK_NATIONALITY = 'Filipino';

function sgMobile(rand: () => number): string {
  // +65 9XXX XXXX — Singapore mobile format.
  const a = 1000 + Math.floor(rand() * 9000);
  const b = 1000 + Math.floor(rand() * 9000);
  return `+65 9${a} ${b}`;
}

function fakeEmail(first: string, last: string): string {
  return `${first.toLowerCase()}.${last.toLowerCase()}@example.test`;
}

// Builds parent + guardian columns for an apps row. Mother is always
// present (KD #69 anchor parent). Father is present in ~85% of rows;
// of the remainder, ~80% get a guardian on record (the other ~20% are
// mother-only). All names + emails are deterministic per rand seed so
// the seeder stays idempotent.
function buildParentFields(
  rand: () => number,
  studentLastName: string | null,
  passType: string | null,
): Record<string, unknown> {
  const lastName = studentLastName?.trim() ? studentLastName : 'Doe';
  const motherFirst = MOTHER_FIRST_NAMES[Math.floor(rand() * MOTHER_FIRST_NAMES.length)];
  const fatherFirst = FATHER_FIRST_NAMES[Math.floor(rand() * FATHER_FIRST_NAMES.length)];
  const nationality = (passType && NATIONALITY_BY_PASS[passType]) ?? FALLBACK_NATIONALITY;

  const hasFather = rand() < 0.85;
  const hasGuardian = !hasFather && rand() < 0.80;

  const fields: Record<string, unknown> = {
    motherFirstName: motherFirst,
    motherLastName: lastName,
    motherFullName: `${motherFirst} ${lastName}`,
    motherEmail: fakeEmail(motherFirst, lastName),
    motherMobile: sgMobile(rand),
    motherNationality: nationality,
  };

  if (hasFather) {
    fields.fatherFirstName = fatherFirst;
    fields.fatherLastName = lastName;
    fields.fatherFullName = `${fatherFirst} ${lastName}`;
    fields.fatherEmail = fakeEmail(fatherFirst, lastName);
    fields.fatherMobile = sgMobile(rand);
    fields.fatherNationality = nationality;
  }

  if (hasGuardian) {
    const gFirst = GUARDIAN_FIRST_NAMES[Math.floor(rand() * GUARDIAN_FIRST_NAMES.length)];
    const gLast = GUARDIAN_LAST_NAMES[Math.floor(rand() * GUARDIAN_LAST_NAMES.length)];
    fields.guardianFirstName = gFirst;
    fields.guardianLastName = gLast;
    fields.guardianFullName = `${gFirst} ${gLast}`;
    fields.guardianEmail = fakeEmail(gFirst, gLast);
    fields.guardianMobile = sgMobile(rand);
    fields.guardianNationality = nationality;
  }

  return fields;
}

// Funnel-row level distribution. Heaviest in P1-S4 (the canonical mass
// market), with 1-2 Youngstarters + 1 Cambridge Secondary sprinkled in so
// the dashboard's level breakdowns show every band populated.
function pickFunnelLevelCode(rand: () => number): LevelCode {
  const r = rand();
  // Youngstarters: ~6% (2/33), one row each across L/J/S families.
  if (r < 0.06) {
    const ys: LevelCode[] = ['YS-L', 'YS-J', 'YS-S'];
    return ys[Math.floor(rand() * ys.length)];
  }
  // Cambridge Secondary: ~3% (1/33).
  if (r < 0.09) {
    const cs: LevelCode[] = ['CS1', 'CS2'];
    return cs[Math.floor(rand() * cs.length)];
  }
  // Primary + standard Secondary share the remaining ~91%. Pick uniformly
  // across all P1-S4 codes (10 of them).
  const main = LEVEL_CODES.filter(
    (c) => LEVEL_TYPE_BY_CODE[c] !== 'preschool' && c !== 'CS1' && c !== 'CS2',
  );
  return main[Math.floor(rand() * main.length)];
}

// Injects 33 pre-enrolment applications across the canonical applicationStatus
// values (Submitted/Ongoing Verification/Processing/Cancelled/Withdrawn) into
// ay{YY}_enrolment_applications + ay{YY}_enrolment_status. Each row gets a
// realistic 5-prereq stage progression so the dashboard's lifecycle widget
// shows non-zero buckets at each gate.
//
// Skips when any non-Enrolled rows already exist.
async function seedAdmissionsFunnel(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const prefix = prefixFor(testAy.ay_code);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;

  // Idempotent: enroleeNumbers are deterministic for a given AY code (same
  // mulberry32 seed → same sequence). Build the full row set, then drop any
  // enroleeNumbers that already exist before inserting the remainder.

  const REFERRALS = [
    'Facebook',
    'Google',
    'Word of Mouth',
    'School Visit',
    'Alumni',
    'Parent Referral',
  ];

  const rand = mulberry32(hashString(`${testAy.ay_code}:funnel`));
  const totalCount = FUNNEL_PROFILES.reduce((n, p) => n + p.count, 0);
  const names = pickNames(`${testAy.ay_code}:funnel`, totalCount);

  const appRows: Array<Record<string, unknown>> = [];
  const statusRows: Array<Record<string, unknown>> = [];
  let nameIdx = 0;

  for (const profile of FUNNEL_PROFILES) {
    for (let i = 0; i < profile.count; i++) {
      const n = names[nameIdx++];
      // Enrolee number format: <prefix>-TEST-<4-digit>
      const seq = String(5000 + nameIdx).padStart(4, '0');
      const enroleeNumber = `${prefix.toUpperCase()}-TEST-${seq}`;
      const levelCode = pickFunnelLevelCode(rand);
      const levelLabel = LEVEL_LABELS[levelCode];
      const referral = REFERRALS[Math.floor(rand() * REFERRALS.length)];
      // Dates spread back ~60 days for outdated-applications demo.
      const daysBack = Math.floor(rand() * 60);
      const dateIso = new Date(
        Date.now() - daysBack * 24 * 60 * 60 * 1000,
      ).toISOString();

      const stageFill = stageProgressionFor(profile.stageProfile, rand);
      const category = pickEnroleeCategory(rand);
      const classType = CLASS_TYPES[Math.floor(rand() * CLASS_TYPES.length)];
      const paymentOption = PAYMENT_OPTIONS[Math.floor(rand() * PAYMENT_OPTIONS.length)];
      const contractSignatory =
        CONTRACT_SIGNATORIES[Math.floor(rand() * CONTRACT_SIGNATORIES.length)];
      const passType = PASS_TYPES[Math.floor(rand() * PASS_TYPES.length)];
      // STP application: ~30% of foreign-student rows (those without Singapore
      // PR). The 4 STP-conditional doc slots only get populated when this is set.
      const isStpApplicant = passType !== 'Singapore PR' && rand() < 0.45;
      const stpApplicationType = isStpApplicant ? STP_APPLICATION_TYPE : null;
      // 10% of funnel rows have allergy data (realistic distribution).
      const hasAllergies = rand() < 0.10;

      // studentNumber is generated alongside enroleeNumber in production
      // (parent portal mints both at intake). syncOneStudent skips with
      // 'no studentNumber' if this is null, so the section-roster insert
      // would silently fail when the registrar later flips this applicant
      // to Enrolled. Seed it now so the test env mirrors production.
      const studentNumber = `TEST-${prefix.toUpperCase()}-SN-${seq}`;
      const parentFields = buildParentFields(rand, n.last_name, passType);
      appRows.push({
        enroleeNumber,
        studentNumber,
        category,
        firstName: n.first_name,
        lastName: n.last_name,
        enroleeFullName: `${n.first_name} ${n.last_name}`,
        levelApplied: levelLabel,
        classType,
        paymentOption,
        contractSignatory,
        pass: passType,
        enroleePhoto: PLACEHOLDER_PHOTO,
        // Real DB stores avail* as Yes/No strings, not bools.
        availSchoolBus: YES_NO[Math.floor(rand() * YES_NO.length)],
        availUniform: YES_NO[Math.floor(rand() * YES_NO.length)],
        availStudentCare: YES_NO[Math.floor(rand() * YES_NO.length)],
        howDidYouKnowAboutHFSEIS: referral,
        // Parent-portal-side status — always 'Registered' once the parent
        // completes the registration form. SIS-side workflow status lives on
        // the status row below as `applicationStatus`.
        applicationStatus: 'Registered',
        // STP application tracker (HFSE Edutrust Certified, sponsors Student
        // Pass via ICA when applicable).
        stpApplicationType,
        residenceHistory: isStpApplicant ? STP_RESIDENCE_HISTORY : null,
        // Medical flags — minimal realistic surface for now.
        allergies: hasAllergies,
        allergyDetails: hasAllergies ? 'Test allergy details' : null,
        paracetamolConsent: true,
        socialMediaConsent: rand() < 0.7,
        ...parentFields,
      });

      const applicationStatus: ApplicationStatus = profile.applicationStatus;
      const statusRow: Record<string, unknown> = {
        enroleeNumber,
        applicationStatus,
        // Mirrors apps.category — same value, different column name.
        enroleeType: category,
        levelApplied: levelLabel,
        applicationUpdatedDate: dateIso,
        registrationStatus: stageFill.registrationStatus,
        documentStatus: stageFill.documentStatus,
        assessmentStatus: stageFill.assessmentStatus,
        contractStatus: stageFill.contractStatus,
        feeStatus: stageFill.feeStatus,
      };
      // Seed assessment grades for rows that have plausibly progressed past
      // the assessment stage. Without these the AssessmentOutcomes donut
      // shows 100% "unknown". Roughly 80% pass mix (both ≥60), 20% with at
      // least one fail < 60 → realistic pass-rate spread.
      if (
        applicationStatus === 'Processing' ||
        applicationStatus === 'Enrolled' ||
        applicationStatus === 'Enrolled (Conditional)'
      ) {
        const passingMath = rand() < 0.8;
        const passingEnglish = rand() < 0.8;
        const mathScore = passingMath
          ? 60 + Math.floor(rand() * 36) // 60–95
          : 50 + Math.floor(rand() * 10); // 50–59
        const engScore = passingEnglish
          ? 60 + Math.floor(rand() * 36)
          : 50 + Math.floor(rand() * 10);
        statusRow.assessmentGradeMath = String(mathScore);
        statusRow.assessmentGradeEnglish = String(engScore);
      }
      // For Processing rows that landed on the fee stage with feeStatus='Paid'
      // (i.e. the ungated-to-enroll branch), stamp a recent feePaymentDate so
      // the lifecycle widget's payment-recency slice has data.
      if (stageFill.feeStatus === 'Paid') {
        const payDaysBack = Math.floor(rand() * 14);
        statusRow.feePaymentDate = new Date(
          Date.now() - payDaysBack * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 10);
      }
      statusRows.push(statusRow);
    }
  }

  // Filter out enroleeNumbers that already exist on either table — the
  // AY-prefixed tables have no unique constraint on enroleeNumber so we
  // can't rely on upsert ignoreDuplicates. Existence on either side counts
  // as "this funnel row was already seeded".
  const existingApps = await fetchAllPages<{ enroleeNumber: string | null }>(
    (from, to) =>
      service.from(appsTable).select('enroleeNumber').range(from, to),
  );
  const existingStatus = await fetchAllPages<{ enroleeNumber: string | null }>(
    (from, to) =>
      service.from(statusTable).select('enroleeNumber').range(from, to),
  );
  const existingNums = new Set<string>([
    ...existingApps.map((r) => r.enroleeNumber).filter((n): n is string => !!n),
    ...existingStatus.map((r) => r.enroleeNumber).filter((n): n is string => !!n),
  ]);
  const appRowsToInsert = appRows.filter(
    (r) => !existingNums.has(String(r.enroleeNumber)),
  );
  const statusRowsToInsert = statusRows.filter(
    (r) => !existingNums.has(String(r.enroleeNumber)),
  );
  if (appRowsToInsert.length === 0) return 0;

  const { error: appsErr } = await service.from(appsTable).insert(appRowsToInsert);
  if (appsErr) {
    console.error('[populated seeder] admissions apps insert failed:', appsErr.message);
    return 0;
  }
  const { error: statusErr } = await service.from(statusTable).insert(statusRowsToInsert);
  if (statusErr) {
    console.error('[populated seeder] admissions status insert failed:', statusErr.message);
  }
  return appRowsToInsert.length;
}

// Seeds 7 plausible discount codes in the test AY's discount-codes table.
// Real schema columns: discountCode, details, enroleeType, startDate, endDate.
// (No `percentageDiscount` column — discount semantics live in `details` text.)
// Code naming convention is AY-prefixed: AY99 = AY9999 test environment.
async function seedDiscountCodes(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const prefix = prefixFor(testAy.ay_code);
  const table = `${prefix}_discount_codes`;

  // Idempotent: filter by discountCode (the natural key) before insert.
  const { data: existingRows } = await service
    .from(table)
    .select('discountCode');
  const existingCodes = new Set(
    ((existingRows ?? []) as Array<{ discountCode: string | null }>)
      .map((r) => r.discountCode)
      .filter((c): c is string => !!c),
  );

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  const rows = [
    {
      discountCode: 'AY99TEST01',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Test alumni family — 15% off registration',
      enroleeType: 'Both',
    },
    {
      discountCode: 'AY99TEST02',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Test sibling discount — 10% off term fees',
      enroleeType: 'Current',
    },
    {
      discountCode: 'AY99TEST03',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextMonth.toISOString().slice(0, 10),
      details: 'Test early-bird — 200 SGD off registration',
      enroleeType: 'New',
    },
    {
      discountCode: 'AY99TEST04',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Test staff family — 20% off all fees',
      enroleeType: 'Both',
    },
    {
      discountCode: 'AY99TEST05',
      startDate: tomorrow.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Future test promotion (not yet active) — 5% off',
      enroleeType: 'New',
    },
    // VizSchool variants
    {
      discountCode: 'AY99TESTVZ01',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Test VizSchool sibling — 10% off',
      enroleeType: 'VizSchool Current',
    },
    {
      discountCode: 'AY99TESTVZ02',
      startDate: today.toISOString().slice(0, 10),
      endDate: nextQuarter.toISOString().slice(0, 10),
      details: 'Test VizSchool any — 5% off',
      enroleeType: 'VizSchool Both',
    },
  ];

  const rowsToInsert = rows.filter((r) => !existingCodes.has(r.discountCode));
  if (rowsToInsert.length === 0) return 0;

  const { error } = await service.from(table).insert(rowsToInsert);
  if (error) {
    console.error('[populated seeder] discount codes insert failed:', error.message);
    return 0;
  }
  return rowsToInsert.length;
}

// Creates one publish-window for the first section × T1 so the parent
// portal + publish-checklist have something to demo.
async function seedPublication(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const { data: t1 } = await service
    .from('terms')
    .select('id')
    .eq('academic_year_id', testAy.id)
    .eq('term_number', 1)
    .maybeSingle();
  if (!t1) return 0;
  const termId = (t1 as { id: string }).id;

  const { data: firstSection } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', testAy.id)
    .order('name')
    .limit(1)
    .maybeSingle();
  if (!firstSection) return 0;
  const sectionId = (firstSection as { id: string }).id;

  // Idempotent: migration-007 unique `(section_id, term_id)` lets the
  // upsert below silently drop the duplicate on re-run.
  const from = new Date();
  const until = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const { error, data } = await service
    .from('report_card_publications')
    .upsert(
      {
        section_id: sectionId,
        term_id: termId,
        publish_from: from.toISOString(),
        publish_until: until.toISOString(),
        published_by: 'test-seeder@hfse.edu.sg',
      },
      { onConflict: 'section_id,term_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.error('[populated seeder] publication insert failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// Round-robin assigns existing staff users as form_advisers + subject_teachers
// across the test AY's sections. Prefers `role='teacher'` users; falls back
// to registrar/school_admin/superadmin if no teachers exist. Skip guard
// is a single "any row already" count to keep the check cheap.
async function seedTeacherAssignments(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ form_adviser: number; subject_teacher: number }> {
  // AY-scoped sections.
  const { data: sections } = await service
    .from('sections')
    .select('id, level_id')
    .eq('academic_year_id', testAy.id);
  const sectionRows = ((sections ?? []) as Array<{ id: string; level_id: string }>);
  if (sectionRows.length === 0) return { form_adviser: 0, subject_teacher: 0 };

  // Idempotent: pull every existing assignment for these sections so we
  // can filter out duplicates per-row. Migration 003's unique indexes are
  // partial (WHERE role='form_adviser' / 'subject_teacher'), which
  // PostgREST upsert can't target with a simple onConflict — manual diff
  // is the correct workaround.
  const { data: existingAssigns } = await service
    .from('teacher_assignments')
    .select('section_id, subject_id, role')
    .in(
      'section_id',
      sectionRows.map((s) => s.id),
    );
  type ExistingAssign = {
    section_id: string;
    subject_id: string | null;
    role: string;
  };
  const existingFAs = new Set(
    ((existingAssigns ?? []) as ExistingAssign[])
      .filter((r) => r.role === 'form_adviser')
      .map((r) => r.section_id),
  );
  const existingSTs = new Set(
    ((existingAssigns ?? []) as ExistingAssign[])
      .filter((r) => r.role === 'subject_teacher' && r.subject_id)
      .map((r) => `${r.section_id}|${r.subject_id}`),
  );

  // Pool of candidate users. Supabase JS `auth.admin.listUsers` returns
  // everyone including parents (role=null). Filter to staff roles.
  const { data: userList, error: usersErr } = await service.auth.admin.listUsers({
    perPage: 1000,
  });
  if (usersErr) {
    console.error('[populated seeder] listUsers failed:', usersErr.message);
    return { form_adviser: 0, subject_teacher: 0 };
  }
  const STAFF_ROLES = new Set(['teacher', 'registrar', 'school_admin', 'superadmin']);
  const staff = (userList?.users ?? [])
    .map((u) => ({
      id: u.id,
      role:
        (u.app_metadata?.role as string | undefined) ??
        (u.user_metadata?.role as string | undefined) ??
        null,
    }))
    .filter((u) => u.role && STAFF_ROLES.has(u.role));

  const teacherPool = staff.filter((u) => u.role === 'teacher');
  const fallbackPool = staff.filter((u) => u.role !== 'teacher');
  const pool = teacherPool.length > 0 ? teacherPool : fallbackPool;

  if (pool.length === 0) {
    console.warn(
      '[populated seeder] no staff users to assign — teacher flows will be empty',
    );
    return { form_adviser: 0, subject_teacher: 0 };
  }

  // ---- Form advisers: one per section, round-robin ----
  const faRows = sectionRows
    .map((s, i) => ({
      teacher_user_id: pool[i % pool.length].id,
      section_id: s.id,
      subject_id: null as string | null,
      role: 'form_adviser' as const,
    }))
    .filter((r) => !existingFAs.has(r.section_id));
  let formAdviserCount = 0;
  if (faRows.length > 0) {
    const { error: faErr, data: faInserted } = await service
      .from('teacher_assignments')
      .insert(faRows)
      .select('id');
    if (faErr) {
      console.error('[populated seeder] form_adviser insert failed:', faErr.message);
    }
    formAdviserCount = faInserted?.length ?? 0;
  }

  // ---- Subject teachers: one per (section × subject) from subject_configs ----
  // Pull the full matrix then round-robin. subject_configs scopes by
  // (academic_year_id, level_id); we need the level match per section.
  const { data: configs } = await service
    .from('subject_configs')
    .select('subject_id, level_id')
    .eq('academic_year_id', testAy.id);
  const cfgByLevel = new Map<string, string[]>();
  for (const c of (configs ?? []) as Array<{ subject_id: string; level_id: string }>) {
    if (!cfgByLevel.has(c.level_id)) cfgByLevel.set(c.level_id, []);
    cfgByLevel.get(c.level_id)!.push(c.subject_id);
  }

  const stRows: Array<{
    teacher_user_id: string;
    section_id: string;
    subject_id: string;
    role: 'subject_teacher';
  }> = [];
  let rotation = 0;
  for (const section of sectionRows) {
    const subjectIds = cfgByLevel.get(section.level_id) ?? [];
    for (const subjectId of subjectIds) {
      const key = `${section.id}|${subjectId}`;
      if (existingSTs.has(key)) {
        rotation += 1; // keep rotation stable so unrelated re-runs assign the same teacher
        continue;
      }
      stRows.push({
        teacher_user_id: pool[rotation % pool.length].id,
        section_id: section.id,
        subject_id: subjectId,
        role: 'subject_teacher',
      });
      rotation += 1;
    }
  }

  let subjectTeacherCount = 0;
  if (stRows.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < stRows.length; i += CHUNK) {
      const slice = stRows.slice(i, i + CHUNK);
      const { data, error } = await service
        .from('teacher_assignments')
        .insert(slice)
        .select('id');
      if (error) {
        console.error(
          `[populated seeder] subject_teacher insert failed (chunk ${i}..${i + slice.length}):`,
          error.message,
        );
        continue;
      }
      subjectTeacherCount += data?.length ?? 0;
    }
  }

  return { form_adviser: formAdviserCount, subject_teacher: subjectTeacherCount };
}

// For every TEST-% student in public.students, upserts a matching row in
// ay{YY}_enrolment_applications + ay{YY}_enrolment_status with stage marked
// Enrolled. Fills the gap so /records/students (which filters the admissions
// tables to Enrolled) shows rows, and Admissions applicant-detail pages for
// those students resolve.
async function seedEnrolledAdmissionsRows(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const prefix = prefixFor(testAy.ay_code);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;

  // Idempotent: enroleeNumbers here are deterministic (`<PREFIX>-ENR-<NNNN>`
  // sequenced by row index). Pull existing enroleeNumbers up front so the
  // chunked insert below skips rows that have already landed.

  // Pull every TEST-% student + their section placement + level code.
  const { data: enrolmentRows } = await service
    .from('section_students')
    .select(
      `
        id,
        student:students!inner(id, student_number, first_name, last_name, middle_name),
        section:sections!inner(
          name,
          academic_year_id,
          level:levels(code, label)
        )
      `,
    )
    .like('student.student_number', 'TEST-%');

  type EnrolRow = {
    id: string;
    student:
      | {
          id: string;
          student_number: string;
          first_name: string | null;
          last_name: string | null;
          middle_name: string | null;
        }
      | {
          id: string;
          student_number: string;
          first_name: string | null;
          last_name: string | null;
          middle_name: string | null;
        }[]
      | null;
    section:
      | {
          name: string;
          academic_year_id: string;
          level: { code: string; label: string } | { code: string; label: string }[] | null;
        }
      | {
          name: string;
          academic_year_id: string;
          level: { code: string; label: string } | { code: string; label: string }[] | null;
        }[]
      | null;
  };

  const rows = ((enrolmentRows ?? []) as unknown as EnrolRow[])
    .map((r) => {
      const student = Array.isArray(r.student) ? r.student[0] : r.student;
      const section = Array.isArray(r.section) ? r.section[0] : r.section;
      if (!student || !section) return null;
      if (section.academic_year_id !== testAy.id) return null;
      const level = Array.isArray(section.level) ? section.level[0] : section.level;
      if (!level) return null;
      return {
        // Carried through so we can write the generated enroleeNumber back
        // onto section_students.enrolee_number — migration 041 added the
        // column but the seeder was never wired to populate it. Drill
        // loaders that scope by enrolee_number + seedMovements's transfer
        // eligibility filter both depend on this back-write.
        sectionStudentId: r.id,
        studentNumber: student.student_number,
        firstName: student.first_name,
        lastName: student.last_name,
        middleName: student.middle_name,
        sectionName: section.name,
        levelCode: level.code,
        levelLabel: level.label,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const upperPrefix = prefix.toUpperCase();

  // Persona quirks layered on top of the default "everything Finished, status
  // Enrolled" baseline. Of ~200 rows:
  //   - 3 are Enrolled (Conditional) — registrar carve-outs (waiver path).
  //   - 5 are Enrolled with documentStatus='Verified' (not Finished) —
  //     "documents almost done" tail; exercises the lifecycle widget's
  //     near-complete bucket and the dashboard's docs-pending count.
  //   - 2 are Withdrawn post-enrollment (~30 days back) so the
  //     <StudentLifecycleTimeline> branches into the withdrawal path.
  // Counted from the start of the rows array so they're deterministic across
  // re-seeds.
  const CONDITIONAL_RANGE = { start: 0, end: 3 };
  const VERIFIED_DOCS_RANGE = { start: 3, end: 8 };
  const WITHDRAWN_RANGE = { start: 8, end: 10 };

  const personaApplicationStatus = (i: number): ApplicationStatus => {
    if (i >= CONDITIONAL_RANGE.start && i < CONDITIONAL_RANGE.end) {
      return 'Enrolled (Conditional)';
    }
    if (i >= WITHDRAWN_RANGE.start && i < WITHDRAWN_RANGE.end) {
      return 'Withdrawn';
    }
    return 'Enrolled';
  };

  // Document status fill: standard rows get all 5 prereqs Finished/Signed/Paid.
  // Verified-docs persona gets documentStatus='Verified' instead of 'Finished'.
  // Withdrawn persona keeps prereqs at their last-known state (Finished) since
  // they enrolled before withdrawing.
  const personaStageFill = (i: number) => {
    const isVerified = i >= VERIFIED_DOCS_RANGE.start && i < VERIFIED_DOCS_RANGE.end;
    return {
      registrationStatus: 'Finished',
      documentStatus: isVerified ? 'Verified' : 'Finished',
      assessmentStatus: 'Finished',
      contractStatus: 'Signed',
      feeStatus: 'Paid',
    };
  };

  // Withdrawn rows backdate `applicationUpdatedDate` ~30 days so the timeline
  // shows the withdrawal as a historical event rather than today.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Deterministic per-AY rand for category / classType / pass / STP picks. Same
  // pattern as funnel — keeps re-runs stable.
  const enrolledRand = mulberry32(hashString(`${testAy.ay_code}:enrolled-personas`));

  // Spread `applicationUpdatedDate` across the current calendar month for
  // ~35% of enrolled rows so the Conversion Rate KPI's `thisMonth` range
  // window catches enough samples to show a non-zero average.
  const now = new Date();
  const monthStartDay = 1;
  const monthMaxDay = now.getDate();
  const personaUpdatedDate = (i: number): string => {
    if (i >= WITHDRAWN_RANGE.start && i < WITHDRAWN_RANGE.end) return thirtyDaysAgo;
    if (enrolledRand() < 0.35) {
      const day = monthStartDay + Math.floor(enrolledRand() * monthMaxDay);
      return new Date(now.getFullYear(), now.getMonth(), day)
        .toISOString()
        .slice(0, 10);
    }
    return todayIso;
  };

  // Backdate `applications.created_at` to N days before each row's
  // updatedDate so `daysToEnroll = updatedAt - createdAt` has realistic
  // positive variance (14–90 days). Without this every row's daysToEnroll
  // would be 0 (created_at defaults to seed-time, updatedDate is also
  // ~today). Withdrawn rows backdate further so they don't pollute
  // averages of healthy enrol times.
  const personaCreatedAtIso = (i: number): string => {
    const daysAgo =
      i >= WITHDRAWN_RANGE.start && i < WITHDRAWN_RANGE.end
        ? 60 + Math.floor(enrolledRand() * 60) // 60–120d for withdrawn
        : 14 + Math.floor(enrolledRand() * 76); // 14–90d for active
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  };

  // Per-row metadata computed once, then shared between appInserts and
  // statusInserts so apps.category + status.enroleeType always agree (they
  // mirror each other in production).
  const personaMeta = rows.map(() => {
    const category = pickEnroleeCategory(enrolledRand);
    const classType = CLASS_TYPES[Math.floor(enrolledRand() * CLASS_TYPES.length)];
    const paymentOption =
      PAYMENT_OPTIONS[Math.floor(enrolledRand() * PAYMENT_OPTIONS.length)];
    const contractSignatory =
      CONTRACT_SIGNATORIES[Math.floor(enrolledRand() * CONTRACT_SIGNATORIES.length)];
    const passType = PASS_TYPES[Math.floor(enrolledRand() * PASS_TYPES.length)];
    const isStpApplicant = passType !== 'Singapore PR' && enrolledRand() < 0.20;
    const availSchoolBus = YES_NO[Math.floor(enrolledRand() * YES_NO.length)];
    const availUniform = YES_NO[Math.floor(enrolledRand() * YES_NO.length)];
    const availStudentCare = YES_NO[Math.floor(enrolledRand() * YES_NO.length)];
    const socialMediaConsent = enrolledRand() < 0.7;
    return {
      category,
      classType,
      paymentOption,
      contractSignatory,
      passType,
      isStpApplicant,
      availSchoolBus,
      availUniform,
      availStudentCare,
      socialMediaConsent,
    };
  });

  const appInserts = rows.map((r, i) => {
    const m = personaMeta[i];
    const parentFields = buildParentFields(enrolledRand, r.lastName, m.passType);
    return {
      enroleeNumber: `${upperPrefix}-ENR-${String(i + 1).padStart(4, '0')}`,
      studentNumber: r.studentNumber,
      category: m.category,
      firstName: r.firstName,
      lastName: r.lastName,
      middleName: r.middleName,
      enroleeFullName: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
      levelApplied: r.levelLabel,
      classType: m.classType,
      paymentOption: m.paymentOption,
      contractSignatory: m.contractSignatory,
      pass: m.passType,
      enroleePhoto: PLACEHOLDER_PHOTO,
      availSchoolBus: m.availSchoolBus,
      availUniform: m.availUniform,
      availStudentCare: m.availStudentCare,
      // applications.applicationStatus = parent-portal-side. Always 'Registered'
      // for an enrolled student (parent finished registration form). The SIS
      // pipeline status lives on the status row.
      applicationStatus: 'Registered',
      stpApplicationType: m.isStpApplicant ? STP_APPLICATION_TYPE : null,
      residenceHistory: m.isStpApplicant ? STP_RESIDENCE_HISTORY : null,
      paracetamolConsent: true,
      socialMediaConsent: m.socialMediaConsent,
      // Backdate created_at so `daysToEnroll` (updatedAt − createdAt) has
      // realistic positive variance for the conversion-rate cohort drill.
      created_at: personaCreatedAtIso(i),
      ...parentFields,
    };
  });
  const statusInserts = rows.map((r, i) => {
    const fill = personaStageFill(i);
    const m = personaMeta[i];
    return {
      enroleeNumber: `${upperPrefix}-ENR-${String(i + 1).padStart(4, '0')}`,
      // SIS-side pipeline status — Enrolled / Enrolled (Conditional) / Withdrawn
      // per the persona ranges.
      applicationStatus: personaApplicationStatus(i),
      // Mirrors apps.category — same value, same row index.
      enroleeType: m.category,
      levelApplied: r.levelLabel,
      classLevel: r.levelLabel,
      classSection: r.sectionName,
      classStatus: 'Finished',
      applicationUpdatedDate: personaUpdatedDate(i),
      registrationStatus: fill.registrationStatus,
      documentStatus: fill.documentStatus,
      assessmentStatus: fill.assessmentStatus,
      contractStatus: fill.contractStatus,
      feeStatus: fill.feeStatus,
    };
  });

  // Filter out enroleeNumbers that already exist on either table.
  const existingApps = await fetchAllPages<{ enroleeNumber: string | null }>(
    (from, to) =>
      service.from(appsTable).select('enroleeNumber').range(from, to),
  );
  const existingStatus = await fetchAllPages<{ enroleeNumber: string | null }>(
    (from, to) =>
      service.from(statusTable).select('enroleeNumber').range(from, to),
  );
  const existingNums = new Set<string>([
    ...existingApps.map((r) => r.enroleeNumber).filter((n): n is string => !!n),
    ...existingStatus.map((r) => r.enroleeNumber).filter((n): n is string => !!n),
  ]);
  const filteredApps = appInserts.filter(
    (r) => !existingNums.has(r.enroleeNumber),
  );
  const filteredStatus = statusInserts.filter(
    (r) => !existingNums.has(r.enroleeNumber),
  );

  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < filteredApps.length; i += CHUNK) {
    const appSlice = filteredApps.slice(i, i + CHUNK);
    const statusSlice = filteredStatus.slice(i, i + CHUNK);
    const { error: appsErr } = await service.from(appsTable).insert(appSlice);
    if (appsErr) {
      console.error(
        `[populated seeder] ${appsTable} insert failed (chunk ${i}..${i + appSlice.length}):`,
        appsErr.message,
      );
      continue;
    }
    const { error: statusErr } = await service.from(statusTable).insert(statusSlice);
    if (statusErr) {
      console.error(
        `[populated seeder] ${statusTable} insert failed (chunk ${i}..${i + statusSlice.length}):`,
        statusErr.message,
      );
      continue;
    }
    inserted += appSlice.length;
  }

  // Back-write the generated enroleeNumber onto section_students.enrolee_number
  // so downstream consumers (seedMovements transfer eligibility, drill loaders
  // per migration 041) can resolve a student's enrolee identity without
  // joining back to the admissions table. Done as a per-row UPDATE because
  // there's no FK-based bulk path; the row count is ≤200 so N round trips
  // is fine. Skip rows whose enroleeNumber already landed before this run
  // (idempotent — re-running the seeder on a partially-seeded AY won't
  // duplicate work).
  let backwritten = 0;
  for (let i = 0; i < rows.length; i++) {
    const enroleeNumber = `${upperPrefix}-ENR-${String(i + 1).padStart(4, '0')}`;
    const { error } = await service
      .from('section_students')
      .update({ enrolee_number: enroleeNumber })
      .eq('id', rows[i].sectionStudentId)
      .is('enrolee_number', null);
    if (!error) backwritten += 1;
  }
  if (backwritten > 0) {
    console.info(
      `[populated seeder] section_students.enrolee_number back-written for ${backwritten} row(s).`,
    );
  }

  return inserted;
}

// Seeds ay{YY}_enrolment_documents for every row in ay{YY}_enrolment_applications
// (both funnel + enrolled). Document status mix per applicationStatus profile:
//
//   Submitted              — all 12 slots NULL (parent hasn't uploaded yet).
//   Ongoing Verification   — ~5 Valid / ~3 Pending / ~2 Rejected / ~2 NULL.
//   Processing             — ~9 Valid / 1-2 Rejected / 1-2 'To follow' / rest NULL.
//   Cancelled              — partial: ~4 Valid / rest NULL.
//   Withdrawn (pre-enrol)  — Valid through assessment-prereq slots, rest NULL.
//   Enrolled               — most have all 12 Valid; ~5 have 1-2 Rejected.
//   Enrolled (Conditional) — same as Enrolled (registrar bypassed the gate).
//
// Also stamps expiry dates on a subset to populate the P-Files dashboard's
// "expiring documents" buckets:
//   - 10 enrolled students: passportExpiry within next 30 days.
//   - 3 enrolled students:  passportExpiry already in the past.
//   - 5 enrolled students:  passExpiry mixed (3 expiring soon, 2 expired).
//
// Idempotent — fills in document rows only for enroleeNumbers that
// don't have one yet, so re-runs after a partial seed complete the set.
async function seedAdmissionsDocuments(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<number> {
  const prefix = prefixFor(testAy.ay_code);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;
  const docsTable = `${prefix}_enrolment_documents`;

  // Existing enroleeNumbers in the docs table — these already have a row
  // and we leave them alone.
  const existingDocs = await fetchAllPages<{ enroleeNumber: string | null }>(
    (from, to) =>
      service.from(docsTable).select('enroleeNumber').range(from, to),
  );
  const existingDocNums = new Set(
    existingDocs.map((r) => r.enroleeNumber).filter((n): n is string => !!n),
  );

  // Pull every application row + matching status (need applicationStatus to
  // pick the per-row fill profile). Status rows are joined in JS to keep the
  // PostgREST query simple. stpApplicationType gates the 3 STP-conditional
  // slots (icaPhoto / financialSupportDocs / vaccinationInformation) so they
  // only get populated for foreign-student personas.
  const { data: appsData, error: appsErr } = await service
    .from(appsTable)
    .select('enroleeNumber, studentNumber, stpApplicationType');
  if (appsErr || !appsData) {
    console.error(
      `[populated seeder] ${appsTable} read failed for documents seeder:`,
      appsErr?.message,
    );
    return 0;
  }
  const apps = appsData as Array<{
    enroleeNumber: string;
    studentNumber: string | null;
    stpApplicationType: string | null;
  }>;
  if (apps.length === 0) return 0;

  const { data: statusData, error: statusErr } = await service
    .from(statusTable)
    .select('enroleeNumber, applicationStatus');
  if (statusErr) {
    console.error(
      `[populated seeder] ${statusTable} read failed for documents seeder:`,
      statusErr.message,
    );
    return 0;
  }
  const statusByEnrolee = new Map<string, string | null>();
  for (const r of (statusData ?? []) as Array<{
    enroleeNumber: string;
    applicationStatus: string | null;
  }>) {
    statusByEnrolee.set(r.enroleeNumber, r.applicationStatus);
  }

  const rand = mulberry32(hashString(`${testAy.ay_code}:documents`));
  // Real sample assets so the P-Files dashboard shows clickable thumbnails
  // / downloads instead of dead `test://` links. Photo-shaped slots get
  // the image; everything else gets the PDF.
  const IMAGE_URL =
    'https://vnhklhppftebbcuupfjw.supabase.co/storage/v1/object/public/parent-portal/ay2027/documents/1774407491653_favicon.png';
  const PDF_URL =
    'https://vnhklhppftebbcuupfjw.supabase.co/storage/v1/object/public/parent-portal/ay2025/documents/1766798602565_Sample%20document.pdf';
  const PHOTO_SLOT_KEYS = new Set(['idPicture', 'icaPhoto']);
  const urlForSlot = (slotKey: string): string =>
    PHOTO_SLOT_KEYS.has(slotKey) ? IMAGE_URL : PDF_URL;
  const REJECTION_REASONS = [
    'Image too blurry — please re-scan with better lighting.',
    'Document expired — upload the latest version.',
    'Wrong file uploaded — this looks like a different document.',
    'Signature missing — re-upload the signed copy.',
    'Page cut off — please ensure the full page is captured.',
  ];
  const pickRejection = () =>
    REJECTION_REASONS[Math.floor(rand() * REJECTION_REASONS.length)];

  // Builds a slot-by-slot fill plan from a status profile. Returns a Map of
  // slot.key -> { status, url } so the caller can stitch into the insert row.
  type SlotFill = {
    status: string | null;
    url: string | null;
    rejection: string | null;
  };
  const buildSlotFill = (profile: string): Record<string, SlotFill> => {
    // Slot order from DOCUMENT_SLOTS (12 slots). Each profile picks a count
    // distribution and walks slots in order assigning statuses.
    const slots = DOCUMENT_SLOTS;
    const fill: Record<string, SlotFill> = {};
    // Default every slot to null first.
    for (const s of slots) {
      fill[s.key] = { status: null, url: null, rejection: null };
    }

    // Helper: assign statuses to indices [start, start+count) (clamped).
    const assign = (
      indices: number[],
      status: string,
      hasUrl: boolean,
      withRejection: boolean,
    ) => {
      for (const idx of indices) {
        if (idx < 0 || idx >= slots.length) continue;
        const k = slots[idx].key;
        fill[k] = {
          status,
          url: hasUrl ? urlForSlot(k) : null,
          rejection: withRejection ? pickRejection() : null,
        };
      }
    };

    // Pick `n` distinct indices from [0, slots.length) without replacement.
    const pickIndices = (n: number, exclude: Set<number> = new Set()): number[] => {
      const pool: number[] = [];
      for (let i = 0; i < slots.length; i++) {
        if (!exclude.has(i)) pool.push(i);
      }
      // Fisher-Yates shuffle (in-place via swap).
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, Math.min(n, pool.length));
    };

    switch (profile) {
      case 'submitted':
        // All NULL — no work yet.
        return fill;
      case 'ongoing-verification': {
        const validIdx = pickIndices(5);
        assign(validIdx, 'Valid', true, false);
        const used = new Set(validIdx);
        const pendingIdx = pickIndices(3, used);
        // Per KD #60 the canonical per-slot status for "parent uploaded,
        // awaiting registrar review" is 'Uploaded' (not 'Pending', which
        // is a stage-level status used on enrolment_status). Writing
        // 'Pending' here used to leak into the P-Files quick filters as
        // 'valid' instead of 'uploaded' because resolveStatus only
        // recognises the canonical word.
        assign(pendingIdx, 'Uploaded', true, false);
        for (const idx of pendingIdx) used.add(idx);
        const rejectIdx = pickIndices(2, used);
        assign(rejectIdx, 'Rejected', true, true);
        // Remaining 2 stay NULL.
        return fill;
      }
      case 'processing': {
        const validIdx = pickIndices(9);
        assign(validIdx, 'Valid', true, false);
        const used = new Set(validIdx);
        const rejectCount = rand() < 0.5 ? 1 : 2;
        const rejectIdx = pickIndices(rejectCount, used);
        assign(rejectIdx, 'Rejected', true, true);
        for (const idx of rejectIdx) used.add(idx);
        const toFollowCount = rand() < 0.5 ? 1 : 2;
        const toFollowIdx = pickIndices(toFollowCount, used);
        // 'To follow' = parent acknowledged pending; URL stays NULL.
        assign(toFollowIdx, 'To follow', false, false);
        return fill;
      }
      case 'cancelled': {
        // Partial fill — ~4 slots Valid, rest NULL.
        const validIdx = pickIndices(4);
        assign(validIdx, 'Valid', true, false);
        return fill;
      }
      case 'withdrawn-pre-enrolment': {
        // Got most of the way through pre-enrolment docs.
        const validIdx = pickIndices(8);
        assign(validIdx, 'Valid', true, false);
        return fill;
      }
      case 'enrolled-clean': {
        // All 12 slots Valid.
        const allIdx = Array.from({ length: slots.length }, (_, i) => i);
        assign(allIdx, 'Valid', true, false);
        return fill;
      }
      case 'enrolled-needs-revalidation': {
        // All Valid except 1-2 Rejected (awaiting parent re-upload).
        const allIdx = Array.from({ length: slots.length }, (_, i) => i);
        assign(allIdx, 'Valid', true, false);
        const rejectCount = rand() < 0.5 ? 1 : 2;
        const rejectIdx = pickIndices(rejectCount);
        assign(rejectIdx, 'Rejected', true, true);
        return fill;
      }
      case 'enrolled-realistic': {
        // Per-slot independent rolls. Status pool depends on whether the
        // slot is expiring (KD #60). URL is written when status is one of
        // the document-present states; 'To follow' and null leave URL null.
        // Distribution: 50% Valid / 20% (Uploaded|Expired) / 15% To follow /
        // 10% Rejected / 5% null. Optional slots (medical/educCert/form12)
        // get an extra ~30% null skew per KD #60.
        const OPTIONAL = new Set(['medical', 'educCert', 'form12']);
        for (const s of slots) {
          const isExpiring = !!s.expiryCol;
          if (OPTIONAL.has(s.key) && rand() < 0.3) {
            // Already null from the default fill — skip.
            continue;
          }
          const r = rand();
          let status: string | null;
          if (r < 0.5) status = 'Valid';
          else if (r < 0.7) status = isExpiring ? 'Expired' : 'Uploaded';
          else if (r < 0.85) status = 'To follow';
          else if (r < 0.95) status = 'Rejected';
          else status = null;
          if (status === null) continue;
          const hasUrl =
            status === 'Valid' ||
            status === 'Uploaded' ||
            status === 'Expired' ||
            status === 'Rejected';
          fill[s.key] = {
            status,
            url: hasUrl ? urlForSlot(s.key) : null,
            rejection: status === 'Rejected' ? pickRejection() : null,
          };
        }
        return fill;
      }
      default:
        return fill;
    }
  };

  // Map applicationStatus → slot-fill profile.
  const profileForStatus = (status: string | null, idx: number): string => {
    switch (status) {
      case 'Submitted':
        return 'submitted';
      case 'Ongoing Verification':
        return 'ongoing-verification';
      case 'Processing':
        return 'processing';
      case 'Cancelled':
        return 'cancelled';
      case 'Withdrawn':
        return 'withdrawn-pre-enrolment';
      case 'Enrolled':
      case 'Enrolled (Conditional)':
        // Realistic per-slot rolls so the P-Files dashboard (KD #71 enrolled-
        // only scope) shows the full mix of Valid / Uploaded / To follow /
        // Rejected / Expired / null. ~3% of enrolled rows get the legacy
        // needs-revalidation skew (mostly-Valid + 1-2 Rejected) for the
        // pastoral-care chase-strip demo.
        return idx % 30 === 0 ? 'enrolled-needs-revalidation' : 'enrolled-realistic';
      default:
        return 'submitted';
    }
  };

  // Expiry rosters — built from enrolled rows only. Index ranges chosen so
  // the personas don't collide (10 + 3 + 5 = 18 distinct rows; 200 enrolled
  // total leaves plenty of room).
  const enrolledEnroleeNumbers = apps
    .map((a) => a.enroleeNumber)
    .filter((e) => {
      const s = statusByEnrolee.get(e);
      return s === 'Enrolled' || s === 'Enrolled (Conditional)';
    });
  const PASSPORT_EXPIRING_SOON = new Set(enrolledEnroleeNumbers.slice(0, 10));
  const PASSPORT_ALREADY_EXPIRED = new Set(enrolledEnroleeNumbers.slice(10, 13));
  const PASS_EXPIRING_SOON = new Set(enrolledEnroleeNumbers.slice(13, 16));
  const PASS_ALREADY_EXPIRED = new Set(enrolledEnroleeNumbers.slice(16, 18));

  // Generate ISO yyyy-MM-dd offsets relative to today.
  const isoDateOffset = (days: number): string =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const inserts: Array<Record<string, unknown>> = [];
  let enrolledIdx = 0;
  for (const app of apps) {
    const status = statusByEnrolee.get(app.enroleeNumber) ?? null;
    const isEnrolled = status === 'Enrolled' || status === 'Enrolled (Conditional)';
    const profile = profileForStatus(status, isEnrolled ? enrolledIdx++ : 0);
    const slotFill = buildSlotFill(profile);

    const row: Record<string, unknown> = {
      enroleeNumber: app.enroleeNumber,
      studentNumber: app.studentNumber,
    };

    const isStpApplicant = !!app.stpApplicationType;

    for (const slot of DOCUMENT_SLOTS) {
      // STP-conditional slots only populated for foreign-student personas.
      // Non-STP applicants leave these slot+status columns NULL.
      const isStpSlot = (STP_CONDITIONAL_SLOT_KEYS as readonly string[]).includes(slot.key);
      if (isStpSlot && !isStpApplicant) {
        row[slot.statusCol] = null;
        row[slot.urlCol] = null;
        continue;
      }

      const f = slotFill[slot.key];
      // Workflow semantics:
      //   - Non-expiring slots (no expiryCol): null → 'Uploaded' → 'Valid' / 'Rejected'.
      //   - Expiring slots (has expiryCol):    null → 'Valid' → 'Expired' / 'Rejected'.
      // 'Pending' is a legacy-ish state we collapse to 'Uploaded' on
      // non-expiring slots since that's what real production rows use.
      let status = f.status;
      const isExpiring = !!slot.expiryCol;
      if (status === 'Pending' && !isExpiring) {
        status = 'Uploaded';
      }
      row[slot.statusCol] = status;
      row[slot.urlCol] = f.url;
      // Stamp realistic expiry dates per KD #60 — every Valid expiring slot
      // gets a future date; every Expired slot gets a past date. Without
      // this the Records pass-expiry cohort + P-Files expiring buckets
      // would show every enrolled row as "expiry: —".
      if (isExpiring && slot.expiryCol) {
        if (status === 'Valid') {
          row[slot.expiryCol] = isoDateOffset(30 + Math.floor(rand() * 336));
        } else if (status === 'Expired') {
          row[slot.expiryCol] = isoDateOffset(-(1 + Math.floor(rand() * 180)));
        }
      }
      // Note: `${slot.key}RejectionReason` columns are NOT in the AY docs
      // schema (per migration 026 — `ay{YYYY}_enrolment_documents` has only
      // `<slot>` URL + `<slot>Status` + optional `<slot>Expiry`). The
      // `f.rejection` text is computed for status colour/badge purposes
      // elsewhere but deliberately not written to the row — PostgREST
      // returns 400 on unknown column keys and would fail the whole
      // chunked insert. Treat `f.rejection` as compute-time decoration only.
    }

    // Expiry stamps — only on enrolled rows that landed in the rosters.
    // When the date is in the past, the matching status is 'Expired' (the
    // auto-flipped state production produces when the expiry passes).
    if (PASSPORT_EXPIRING_SOON.has(app.enroleeNumber)) {
      row.passportExpiry = isoDateOffset(1 + Math.floor(rand() * 30));
      // Status stays 'Valid' (set by buildSlotFill for enrolled-clean profile).
    } else if (PASSPORT_ALREADY_EXPIRED.has(app.enroleeNumber)) {
      row.passportExpiry = isoDateOffset(-(30 + Math.floor(rand() * 60)));
      row.passportStatus = 'Expired';
    }
    if (PASS_EXPIRING_SOON.has(app.enroleeNumber)) {
      row.passExpiry = isoDateOffset(1 + Math.floor(rand() * 30));
    } else if (PASS_ALREADY_EXPIRED.has(app.enroleeNumber)) {
      row.passExpiry = isoDateOffset(-(30 + Math.floor(rand() * 60)));
      row.passStatus = 'Expired';
    }

    inserts.push(row);
  }

  // Filter out enroleeNumbers that already have a docs row.
  const filteredInserts = inserts.filter(
    (r) => !existingDocNums.has(String(r.enroleeNumber)),
  );

  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < filteredInserts.length; i += CHUNK) {
    const slice = filteredInserts.slice(i, i + CHUNK);
    const { error } = await service.from(docsTable).insert(slice);
    if (error) {
      console.error(
        `[populated seeder] ${docsTable} insert failed (chunk ${i}..${i + slice.length}):`,
        error.message,
      );
      continue;
    }
    inserted += slice.length;
  }

  return inserted;
}
