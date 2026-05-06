import 'server-only';

import { buildCompareCells, type CompareInput, type CompareResult } from '@/lib/dashboard/compare';

import { getAttendanceKpisRange, type AttendanceKpis } from './dashboard';

export type AttendanceCompareKpis = AttendanceKpis;

export async function getAttendanceCompareKpis(
  input: CompareInput,
): Promise<CompareResult<AttendanceCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getAttendanceKpisRange({
        ayCode: cell.ayCode,
        from: cell.range.from,
        to: cell.range.to,
        cmpFrom: null,
        cmpTo: null,
      }),
    ),
  );

  return {
    cells: cells.map((cell, i) => ({ cell, data: results[i].current })),
  };
}
