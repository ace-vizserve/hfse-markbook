import { revalidateTag } from 'next/cache';

export type DrillModule =
  | 'markbook'
  | 'attendance'
  | 'evaluation'
  | 'admissions'
  | 'records'
  | 'p-files';

/**
 * Invalidates the per-AY drill cache tag for a single module. Call after
 * any DB mutation that affects rolled-up dashboard data, before returning
 * the response. The next read rebuilds the cache from fresh DB state.
 *
 * Cross-cutting mutations (e.g. POST /api/sections/[id]/students) call
 * this multiple times — once per affected module.
 */
export function invalidateDrillTags(module: DrillModule, ayCode: string): void {
  revalidateTag(`${module}-drill:${ayCode}`, 'max');
}

/**
 * Cross-cutting convenience for mutations that touch every operational
 * module's rolled-up data — section roster changes, student sync, atomic
 * mid-year section transfers. Calls invalidateDrillTags() once per module.
 */
export function invalidateAllOperationalDrills(ayCode: string): void {
  invalidateDrillTags('markbook', ayCode);
  invalidateDrillTags('attendance', ayCode);
  invalidateDrillTags('evaluation', ayCode);
  invalidateDrillTags('records', ayCode);
  invalidateDrillTags('p-files', ayCode);
}
