import 'server-only';

import { buildCompareCells, type CompareInput, type CompareResult } from '@/lib/dashboard/compare';

import { getPFilesKpisRange, type PFilesRangeKpis } from './dashboard';

export type PFilesCompareKpis = PFilesRangeKpis;

export async function getPFilesCompareKpis(
  input: CompareInput,
): Promise<CompareResult<PFilesCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getPFilesKpisRange({
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
