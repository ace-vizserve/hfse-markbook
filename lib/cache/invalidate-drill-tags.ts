import { revalidateTag } from 'next/cache';

export type DrillModule =
  | 'markbook'
  | 'attendance'
  | 'evaluation'
  | 'admissions'
  | 'records'
  | 'p-files';

/**
 * Per-module cache tag set. Each module's drill loader and dashboard
 * loader cache under DIFFERENT tags (legacy from when they were written
 * separately) — busting only the drill tag leaves the chart cache stale,
 * which produces card-vs-drill row-count mismatches that look like
 * filter bugs but are actually 60-300s of stale cached numbers.
 *
 * Per-module conventions (read from each `lib/<module>/{dashboard,drill,
 * priority}.ts::tag()` helper):
 * - markbook   drill: `markbook-drill:${ay}`     dashboard: `markbook:${ay}`
 * - attendance drill: `attendance-drill:${ay}`   dashboard: `attendance-dashboard:${ay}`
 * - evaluation drill: `evaluation-drill:${ay}`   dashboard: `evaluation-dashboard:${ay}`
 * - admissions drill: `admissions-drill:${ay}`   dashboard: `admissions-dashboard:${ay}`
 * - records    drill: `records-drill:${ay}`      dashboard: `sis:${ay}` (Records reuses the SIS tag)
 * - p-files    drill: `p-files-drill:${ay}`      dashboard: `p-files-dashboard:${ay}`  freshen: `p-files-freshen:${ay}`
 */
const MODULE_TAGS: Record<DrillModule, (ayCode: string) => string[]> = {
  markbook: (ay) => [`markbook-drill:${ay}`, `markbook:${ay}`],
  attendance: (ay) => [`attendance-drill:${ay}`, `attendance-dashboard:${ay}`],
  evaluation: (ay) => [`evaluation-drill:${ay}`, `evaluation-dashboard:${ay}`],
  admissions: (ay) => [`admissions-drill:${ay}`, `admissions-dashboard:${ay}`],
  records: (ay) => [`records-drill:${ay}`, `sis:${ay}`],
  'p-files': (ay) => [`p-files-drill:${ay}`, `p-files-dashboard:${ay}`, `p-files-freshen:${ay}`],
};

/**
 * Invalidates BOTH the drill and dashboard cache tags for a single module
 * for the given AY. Call after any DB mutation that affects rolled-up
 * dashboard data, before returning the response. The next read rebuilds
 * caches from fresh DB state — chart and drill stay in lockstep.
 *
 * Naming is legacy ('drill tags' originally only) — the function busts
 * the full per-module cache surface today. Name kept stable to avoid
 * touching the 30+ existing call sites; semantics expanded.
 *
 * Cross-cutting mutations (e.g. POST /api/sections/[id]/students) call
 * this multiple times — once per affected module.
 */
export function invalidateDrillTags(module: DrillModule, ayCode: string): void {
  for (const tag of MODULE_TAGS[module](ayCode)) {
    revalidateTag(tag, 'max');
  }
}

/**
 * Cross-cutting convenience for mutations that touch every operational
 * module's rolled-up data — section roster changes, student sync, atomic
 * mid-year section transfers, and the populated seeder's final pass.
 * Calls invalidateDrillTags() once per module — busting both drill and
 * dashboard tags for each.
 */
export function invalidateAllOperationalDrills(ayCode: string): void {
  invalidateDrillTags('markbook', ayCode);
  invalidateDrillTags('attendance', ayCode);
  invalidateDrillTags('evaluation', ayCode);
  invalidateDrillTags('records', ayCode);
  invalidateDrillTags('p-files', ayCode);
  invalidateDrillTags('admissions', ayCode);
}
