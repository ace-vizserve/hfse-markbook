import type { SupabaseClient } from '@supabase/supabase-js';

import { seedPopulated, type PopulatedSeedResult } from './seeder/populated';
import { seedPriorYearTestAy } from './seeder/prior-year';
import { seedTestAy, type SeedResult } from './seeder/students';
import { ensureTestStructure, type StructureSeedResult } from './seeder/structural';

// Environment abstraction over the AY switcher. UI-side, users pick
// "Production" or "Test"; internally this maps to flipping is_current
// between the AY2026-style row and the AY9* test row.
//
// Test AY is auto-provisioned on first switch-to-Test via the existing
// create_academic_year RPC (migration 012). Test students are auto-seeded
// when the test AY has zero section_students.

export type Environment = 'production' | 'test' | null;

const TEST_AY_CODE = 'AY9999';
const TEST_AY_LABEL = 'Test Environment';
const PRIOR_TEST_AY_CODE = 'AY9998';
const PRIOR_TEST_AY_LABEL = 'Prior Test Year';
const PROD_AY_CODE = 'AY2026';

function isTestAyCode(code: string | null | undefined): boolean {
  return !!code && /^AY9/.test(code);
}

type AyRow = { id: string; ay_code: string; label: string; is_current: boolean };

export async function listEnvironmentAys(service: SupabaseClient): Promise<{
  current: AyRow | null;
  testAy: AyRow | null;
  priorTestAy: AyRow | null;
  prodAy: AyRow | null;
}> {
  const { data, error } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .order('ay_code', { ascending: false });
  if (error || !data) {
    console.error('[environment] list failed:', error?.message);
    return { current: null, testAy: null, priorTestAy: null, prodAy: null };
  }
  const rows = data as AyRow[];
  const current = rows.find((r) => r.is_current) ?? null;
  const testAy = rows.find((r) => r.ay_code === TEST_AY_CODE) ?? null;
  const priorTestAy = rows.find((r) => r.ay_code === PRIOR_TEST_AY_CODE) ?? null;
  const prodAy =
    rows.find((r) => r.ay_code === PROD_AY_CODE && !isTestAyCode(r.ay_code)) ??
    rows.find((r) => !isTestAyCode(r.ay_code)) ??
    null;
  return { current, testAy, priorTestAy, prodAy };
}

export async function getCurrentEnvironment(
  service: SupabaseClient,
): Promise<{ environment: Environment; current: AyRow | null }> {
  const { current } = await listEnvironmentAys(service);
  if (!current) return { environment: null, current: null };
  return {
    environment: isTestAyCode(current.ay_code) ? 'test' : 'production',
    current,
  };
}

// Ensures the test AY row exists; creates it atomically via the
// create_academic_year RPC (which also provisions terms + copies forward
// sections/subject_configs + creates the 4 ay9999_enrolment_* tables).
async function ensureTestAy(service: SupabaseClient): Promise<AyRow> {
  const { testAy } = await listEnvironmentAys(service);
  if (testAy) return testAy;

  const { error: rpcErr } = await service.rpc('create_academic_year', {
    p_ay_code: TEST_AY_CODE,
    p_label: TEST_AY_LABEL,
  });
  if (rpcErr) {
    throw new Error(`ensureTestAy: RPC failed — ${rpcErr.message}`);
  }

  // Re-read the row (RPC returns a summary jsonb, but for the caller we
  // want the typed AyRow — one more small round-trip).
  const { data: fresh, error: reErr } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .eq('ay_code', TEST_AY_CODE)
    .single();
  if (reErr || !fresh) {
    throw new Error(`ensureTestAy: post-RPC read failed — ${reErr?.message ?? 'no row'}`);
  }
  return fresh as AyRow;
}

/**
 * Ensures the prior-year test AY (AY9998) exists. Created on demand via the
 * same `create_academic_year` RPC. Used by switchEnvironment to provision a
 * second test AY for compare-mode demos. Never marked `is_current` — it's a
 * passive comparison fixture.
 */
async function ensurePriorTestAy(service: SupabaseClient): Promise<AyRow> {
  const { data: existing } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .eq('ay_code', PRIOR_TEST_AY_CODE)
    .maybeSingle();
  if (existing) return existing as AyRow;

  const { error: rpcErr } = await service.rpc('create_academic_year', {
    p_ay_code: PRIOR_TEST_AY_CODE,
    p_label: PRIOR_TEST_AY_LABEL,
  });
  if (rpcErr) {
    throw new Error(`ensurePriorTestAy: RPC failed — ${rpcErr.message}`);
  }

  const { data: fresh, error: reErr } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .eq('ay_code', PRIOR_TEST_AY_CODE)
    .single();
  if (reErr || !fresh) {
    throw new Error(`ensurePriorTestAy: post-RPC read failed — ${reErr?.message ?? 'no row'}`);
  }
  return fresh as AyRow;
}

// Two-step flip mirroring the existing AY Setup PATCH handler: clear all
// is_current=false, then set target=true. Idempotent; converges on re-run.
async function flipIsCurrent(
  service: SupabaseClient,
  targetAyCode: string,
): Promise<{ fromAyCode: string | null; toAyCode: string }> {
  const { data: prev } = await service
    .from('academic_years')
    .select('ay_code')
    .eq('is_current', true)
    .maybeSingle();
  const fromAyCode = (prev as { ay_code: string } | null)?.ay_code ?? null;

  const { error: clearErr } = await service
    .from('academic_years')
    .update({ is_current: false })
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (clearErr) throw new Error(`flipIsCurrent: clear — ${clearErr.message}`);

  const { error: setErr } = await service
    .from('academic_years')
    .update({ is_current: true })
    .eq('ay_code', targetAyCode);
  if (setErr) throw new Error(`flipIsCurrent: set — ${setErr.message}`);

  return { fromAyCode, toAyCode: targetAyCode };
}

export type SwitchResult = {
  fromAyCode: string | null;
  toAyCode: string;
  toEnvironment: Environment;
  seed: SeedResult | null;
  structure: StructureSeedResult | null;
  populated: PopulatedSeedResult | null;
};

export async function switchEnvironment(
  service: SupabaseClient,
  target: Exclude<Environment, null>,
): Promise<SwitchResult> {
  if (target === 'test') {
    const testAy = await ensureTestAy(service);
    const priorTestAy = await ensurePriorTestAy(service);
    const flip = await flipIsCurrent(service, testAy.ay_code);

    const currentYear = new Date().getFullYear();

    // 1) Structural config for current-year test AY (AY9999).
    const structure = await ensureTestStructure(service, {
      id: testAy.id,
      ay_code: testAy.ay_code,
    }, { targetYear: currentYear, forceOverwriteDates: true });

    // 2) Structural config for prior-year test AY (AY9998).
    await ensureTestStructure(service, {
      id: priorTestAy.id,
      ay_code: priorTestAy.ay_code,
    }, { targetYear: currentYear - 1, forceOverwriteDates: true });

    // 3) Student seed for current AY.
    const { data: sectionRows } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', testAy.id);
    const sectionIds = (sectionRows ?? []).map((r) => (r as { id: string }).id);
    let seed: SeedResult | null = null;
    if (sectionIds.length > 0) {
      const { count } = await service
        .from('section_students')
        .select('id', { count: 'exact', head: true })
        .in('section_id', sectionIds);
      if ((count ?? 0) === 0) {
        seed = await seedTestAy(service, testAy.id, testAy.ay_code);
      }
    }

    // 4) Populated layer for AY9999.
    const populated = await seedPopulated(service, testAy);

    // 5) Prior-year fixture: provision AY9998 students + populated data.
    await seedPriorYearTestAy(service, priorTestAy);

    return {
      fromAyCode: flip.fromAyCode,
      toAyCode: flip.toAyCode,
      toEnvironment: 'test',
      seed,
      structure,
      populated,
    };
  }

  // target === 'production'
  const { prodAy } = await listEnvironmentAys(service);
  if (!prodAy) {
    throw new Error(
      'No Production AY found. Create an AY whose code does not start with AY9 before switching.',
    );
  }
  const flip = await flipIsCurrent(service, prodAy.ay_code);
  return {
    fromAyCode: flip.fromAyCode,
    toAyCode: flip.toAyCode,
    toEnvironment: 'production',
    seed: null,
    structure: null,
    populated: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Reset test environment — destructive cascade wipe of AY9* + its children.
// ─────────────────────────────────────────────────────────────────────────
//
// `delete_academic_year` RPC from migration 012 refuses to run when the AY
// has any child data (section_students, grading_sheets, attendance,
// admissions rows, etc.). The test seeder now populates all of those, so
// the normal delete path errors out. This helper does the cascade wipe
// the RPC refuses to do, then calls the RPC to drop the ay{YY}_* tables +
// remove the SIS-side rows.
//
// Superadmin only. Gated in the calling API route — this function trusts
// its caller (service role, no RLS). Only call against AYs matching `^AY9`.

export type ResetResult = {
  ayCode: string;
  switchedFromActive: boolean;
  deleted: {
    grade_entries: number;
    grade_audit_log: number;
    grading_sheets: number;
    attendance_daily: number;
    attendance_records: number;
    school_calendar: number;
    calendar_events: number;
    evaluation_writeups: number;
    evaluation_subject_comments: number;
    evaluation_checklist_responses: number;
    evaluation_ptc_feedback: number;
    evaluation_checklist_items: number;
    evaluation_terms: number;
    report_card_publications: number;
    grade_change_requests: number;
    teacher_assignments: number;
    section_students: number;
    students_test: number;
    p_file_revisions: number;
    admissions_rows: number;
  };
  rpcSummary: unknown;
};

export async function resetTestEnvironment(service: SupabaseClient): Promise<ResetResult> {
  const { testAy, priorTestAy, prodAy, current } = await listEnvironmentAys(service);
  const targets = [testAy, priorTestAy].filter((a): a is AyRow => a !== null);
  if (targets.length === 0) {
    throw new Error('No Test AY (matching ^AY9) found.');
  }
  for (const t of targets) {
    if (!isTestAyCode(t.ay_code)) {
      // Defense in depth — listEnvironmentAys filters but double-check.
      throw new Error(`Refusing to reset non-test AY ${t.ay_code}.`);
    }
  }

  let switchedFromActive = false;
  if (current && targets.some((t) => t.id === current.id)) {
    if (!prodAy) {
      throw new Error('Cannot reset Test AY: no Production AY to switch to.');
    }
    await flipIsCurrent(service, prodAy.ay_code);
    switchedFromActive = true;
  }

  // Aggregate counters across both AYs.
  const aggregateDeleted: ResetResult['deleted'] = {
    grade_entries: 0,
    grade_audit_log: 0,
    grading_sheets: 0,
    attendance_daily: 0,
    attendance_records: 0,
    school_calendar: 0,
    calendar_events: 0,
    evaluation_writeups: 0,
    evaluation_subject_comments: 0,
    evaluation_checklist_responses: 0,
    evaluation_ptc_feedback: 0,
    evaluation_checklist_items: 0,
    evaluation_terms: 0,
    report_card_publications: 0,
    grade_change_requests: 0,
    teacher_assignments: 0,
    section_students: 0,
    students_test: 0,
    p_file_revisions: 0,
    admissions_rows: 0,
  };
  const aggregateRpcSummary: unknown[] = [];

  for (const target of targets) {
    const perAy = await wipeOneTestAy(service, target);
    for (const k of Object.keys(aggregateDeleted) as Array<keyof ResetResult['deleted']>) {
      aggregateDeleted[k] += perAy.deleted[k];
    }
    aggregateRpcSummary.push(perAy.rpcSummary);
  }

  return {
    ayCode: targets.map((t) => t.ay_code).join(','),
    switchedFromActive,
    deleted: aggregateDeleted,
    rpcSummary: aggregateRpcSummary,
  };
}

async function wipeOneTestAy(
  service: SupabaseClient,
  target: AyRow,
): Promise<{ deleted: ResetResult['deleted']; rpcSummary: unknown }> {
  const ayId = target.id;
  const ayCode = target.ay_code;

  // ---- Collect scoped IDs ----
  const [{ data: termRows }, { data: sectionRows }] = await Promise.all([
    service.from('terms').select('id').eq('academic_year_id', ayId),
    service.from('sections').select('id').eq('academic_year_id', ayId),
  ]);
  const termIds = ((termRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  const sectionIds = ((sectionRows ?? []) as Array<{ id: string }>).map((r) => r.id);

  const { data: sheetRows } = await (termIds.length > 0 || sectionIds.length > 0
    ? (() => {
        let q = service.from('grading_sheets').select('id');
        if (termIds.length > 0 && sectionIds.length > 0) {
          q = q.or(
            `term_id.in.(${termIds.join(',')}),section_id.in.(${sectionIds.join(',')})`,
          );
        } else if (termIds.length > 0) {
          q = q.in('term_id', termIds);
        } else {
          q = q.in('section_id', sectionIds);
        }
        return q;
      })()
    : Promise.resolve({ data: [] as Array<{ id: string }> }));
  const sheetIds = ((sheetRows ?? []) as Array<{ id: string }>).map((r) => r.id);

  const deleted: ResetResult['deleted'] = {
    grade_entries: 0,
    grade_audit_log: 0,
    grading_sheets: 0,
    attendance_daily: 0,
    attendance_records: 0,
    school_calendar: 0,
    calendar_events: 0,
    evaluation_writeups: 0,
    evaluation_subject_comments: 0,
    evaluation_checklist_responses: 0,
    evaluation_ptc_feedback: 0,
    evaluation_checklist_items: 0,
    evaluation_terms: 0,
    report_card_publications: 0,
    grade_change_requests: 0,
    teacher_assignments: 0,
    section_students: 0,
    students_test: 0,
    p_file_revisions: 0,
    admissions_rows: 0,
  };

  // Chunk `.in()` filters to stay under PostgREST's ~8 KB URL cap.
  // 50 × 36-char UUID + commas ≈ 1.9 KB per request — comfortable margin.
  // Supabase doesn't expose a POST-body filter variant for .delete(); this
  // is the idiomatic workaround for large ID lists.
  const IN_CHUNK = 50;
  async function wipe(
    key: keyof ResetResult['deleted'],
    table: string,
    column: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    let total = 0;
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const slice = ids.slice(i, i + IN_CHUNK);
      const { count, error } = await service
        .from(table)
        .delete({ count: 'exact' })
        .in(column, slice);
      if (error) {
        console.error(
          `[reset] ${table}.${column} wipe failed (chunk ${i}..${i + slice.length}):`,
          error.message,
        );
        return;
      }
      total += count ?? 0;
    }
    deleted[key] = total;
  }

  // ---- Delete in reverse-dependency order ----
  // Sheet-scoped children first.
  if (sheetIds.length > 0) {
    await wipe('grade_change_requests', 'grade_change_requests', 'grading_sheet_id', sheetIds);
    await wipe('grade_audit_log', 'grade_audit_log', 'grading_sheet_id', sheetIds);
    await wipe('grade_entries', 'grade_entries', 'grading_sheet_id', sheetIds);
  }

  // Term-scoped children.
  if (termIds.length > 0) {
    await wipe('attendance_daily', 'attendance_daily', 'term_id', termIds);
    await wipe('attendance_records', 'attendance_records', 'term_id', termIds);
    await wipe('school_calendar', 'school_calendar', 'term_id', termIds);
    await wipe('calendar_events', 'calendar_events', 'term_id', termIds);
    await wipe('evaluation_writeups', 'evaluation_writeups', 'term_id', termIds);
    await wipe('evaluation_subject_comments', 'evaluation_subject_comments', 'term_id', termIds);
    await wipe(
      'evaluation_checklist_responses',
      'evaluation_checklist_responses',
      'term_id',
      termIds,
    );
    await wipe('evaluation_ptc_feedback', 'evaluation_ptc_feedback', 'term_id', termIds);
    await wipe('evaluation_checklist_items', 'evaluation_checklist_items', 'term_id', termIds);
    await wipe('evaluation_terms', 'evaluation_terms', 'term_id', termIds);
    await wipe('report_card_publications', 'report_card_publications', 'term_id', termIds);
    await wipe('grading_sheets', 'grading_sheets', 'term_id', termIds);
  }

  // Section-scoped children.
  if (sectionIds.length > 0) {
    await wipe('teacher_assignments', 'teacher_assignments', 'section_id', sectionIds);
    await wipe('section_students', 'section_students', 'section_id', sectionIds);
  }

  // Seeded test students (student_number like 'TEST-%').
  {
    const { count, error } = await service
      .from('students')
      .delete({ count: 'exact' })
      .like('student_number', 'TEST-%');
    if (error) {
      console.error('[reset] students TEST-% wipe failed:', error.message);
    } else {
      deleted.students_test = count ?? 0;
    }
  }

  // P-file revisions keyed on ay_code.
  {
    const { count, error } = await service
      .from('p_file_revisions')
      .delete({ count: 'exact' })
      .eq('ay_code', ayCode);
    if (error) {
      console.error('[reset] p_file_revisions wipe failed:', error.message);
    } else {
      deleted.p_file_revisions = count ?? 0;
    }
  }

  // Empty admissions tables so the delete_academic_year RPC passes its
  // emptiness guard. The tables get dropped by the RPC right after.
  const prefix = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
  const admissionsTables = [
    `${prefix}_enrolment_applications`,
    `${prefix}_enrolment_status`,
    `${prefix}_enrolment_documents`,
    `${prefix}_discount_codes`,
  ];
  for (const table of admissionsTables) {
    const { count, error } = await service
      .from(table)
      .delete({ count: 'exact' })
      .gte('id', 0);
    if (error) {
      // Table might not exist on an incomplete test AY — not fatal.
      console.warn(`[reset] ${table} wipe: ${error.message}`);
      continue;
    }
    deleted.admissions_rows += count ?? 0;
  }

  // Final: call the RPC. With all children cleared, its guards pass and
  // it drops the ay{YY}_* tables + removes subject_configs, sections,
  // terms, academic_years rows atomically.
  const { data: rpcResult, error: rpcErr } = await service.rpc('delete_academic_year', {
    p_ay_code: ayCode,
  });
  if (rpcErr) {
    throw new Error(`delete_academic_year RPC failed: ${rpcErr.message}`);
  }

  return {
    deleted,
    rpcSummary: rpcResult,
  };
}

export { isTestAyCode };
