// Currently unused — will be revived in a follow-up pass for cross-year
// drill testing (AY9998 prior-year data). Do not call until then.

import type { SupabaseClient } from '@supabase/supabase-js';

import { seedPopulated } from './populated';
import { seedTestAy } from './students';

/**
 * Provisions the prior-year test AY (AY9998) so compare-mode has two test
 * AYs to demonstrate against. Assumes structural config has already been
 * laid down by switchEnvironment via ensureTestStructure(..., { targetYear:
 * currentYear - 1 }) — sections, terms, subject_configs, school_calendar,
 * grading_sheets all exist before this runs.
 *
 * Layers students + populated data (grade_entries, attendance_daily,
 * evaluation_writeups, admissions funnel, discount_codes, publication,
 * teacher_assignments, enrolled admissions, admissions docs). Because
 * AY9998's terms all sit in the prior calendar year (T1-T4 all closed),
 * the populated seeder fills every term with full data — no temporal
 * split needed (that's only for AY9999's active T2).
 */
export async function seedPriorYearTestAy(
  service: SupabaseClient,
  priorTestAy: { id: string; ay_code: string }
): Promise<void> {
  // Students — only seed if AY9998's sections are empty.
  const { data: sectionRows } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', priorTestAy.id);
  const sectionIds = (sectionRows ?? []).map((r) => (r as { id: string }).id);
  if (sectionIds.length > 0) {
    await seedTestAy(service, priorTestAy.id, priorTestAy.ay_code, {
      perSection: sectionIds.map((id) => ({ sectionId: id, count: 10 })),
    });
  }

  // Populated data — seedPopulated is idempotent (per-row filters) so safe
  // to re-run. The `mulberry32(hashString(...))` deterministic seed uses
  // ayCode as input, so AY9998 produces a different but stable data set
  // than AY9999.
  //
  // `allTermsFull: true` is the closed-AY mode (KD #95) — every term gets
  // full grades + attendance + evaluation writeups so the Masterfile award
  // badges, T4 report card General Average, and compare-mode prior-period
  // panel render with real numbers rather than "Not eligible" placeholders.
  await seedPopulated(service, priorTestAy, { allTermsFull: true });
}
