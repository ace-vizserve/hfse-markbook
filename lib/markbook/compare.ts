import 'server-only';

import { buildCompareCells, type CompareInput, type CompareResult } from '@/lib/dashboard/compare';

import { getMarkbookKpisRange, type MarkbookRangeKpis } from './dashboard';

export type MarkbookCompareKpis = MarkbookRangeKpis;

/**
 * Fans out across CompareInput's cells, calling the existing per-range
 * KPI loader for each (ayCode, range) tuple. Each cell stays cached
 * independently via getMarkbookKpisRange's per-call unstable_cache, so
 * compare mode shares cache slots with the operational dashboard.
 */
export async function getMarkbookCompareKpis(
  input: CompareInput,
): Promise<CompareResult<MarkbookCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getMarkbookKpisRange({
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
