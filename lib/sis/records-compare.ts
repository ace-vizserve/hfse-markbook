import 'server-only';

import {
  buildCompareCells,
  type CompareInput,
  type CompareResult,
} from '@/lib/dashboard/compare';

import { getRecordsKpisRange, type RecordsRangeKpis } from './dashboard';

export type RecordsCompareKpis = RecordsRangeKpis;

export async function getRecordsCompareKpis(
  input: CompareInput
): Promise<CompareResult<RecordsCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getRecordsKpisRange({
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
