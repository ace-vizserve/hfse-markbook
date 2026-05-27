import 'server-only';

import {
  buildCompareCells,
  type CompareInput,
  type CompareResult,
} from '@/lib/dashboard/compare';

import { getAdmissionsKpisRange, type AdmissionsRangeKpis } from './dashboard';

export type AdmissionsCompareKpis = AdmissionsRangeKpis;

export async function getAdmissionsCompareKpis(
  input: CompareInput
): Promise<CompareResult<AdmissionsCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getAdmissionsKpisRange({
        ayCode: cell.ayCode,
        from: cell.range.from,
        to: cell.range.to,
        cmpFrom: null,
        cmpTo: null,
      })
    )
  );

  return {
    cells: cells.map((cell, i) => ({ cell, data: results[i].current })),
  };
}
