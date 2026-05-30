import { LayoutGrid } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CompareCellResult } from '@/lib/dashboard/compare';

export type CompareGridMetric<T> = {
  key: string;
  label: string;
  format?: 'number' | 'percent' | 'days';
  /** Pull the numeric value out of T for this metric. null = no data. */
  getValue: (data: T) => number | null;
  /**
   * 'higherIsBetter' | 'lowerIsBetter' — drives delta colour and min/max dot.
   * Omit for ambiguous metrics (transfers, expected counts, etc.) — delta
   * and dot are suppressed to avoid misleading direction signals.
   */
  direction?: 'higherIsBetter' | 'lowerIsBetter';
};

export type CompareGridProps<T> = {
  cells: CompareCellResult<T>[];
  metrics: CompareGridMetric<T>[];
  title: string;
  description?: string;
};

function formatValue(
  v: number | null,
  fmt: CompareGridMetric<unknown>['format']
): string {
  if (v === null) return '—';
  if (fmt === 'percent') return `${Math.round(v)}%`;
  if (fmt === 'days') return `${Math.round(v)}d`;
  return v.toLocaleString('en-SG');
}

function formatDelta(
  value: number | null,
  baseline: number | null,
  fmt: CompareGridMetric<unknown>['format'],
  direction: CompareGridMetric<unknown>['direction'],
  isBaseline: boolean
): { text: string; tone: 'good' | 'bad' | 'neutral' } | null {
  if (isBaseline) return null;
  if (value === null || baseline === null) return null;
  if (value === baseline) return { text: '± 0', tone: 'neutral' };

  const isPositive = value > baseline;
  let tone: 'good' | 'bad' | 'neutral' = 'neutral';
  if (direction === 'higherIsBetter') tone = isPositive ? 'good' : 'bad';
  if (direction === 'lowerIsBetter') tone = isPositive ? 'bad' : 'good';

  if (fmt === 'percent') {
    const diff = value - baseline;
    return { text: `${diff > 0 ? '+' : ''}${Math.round(diff)}pp`, tone };
  }
  if (baseline === 0) {
    return { text: value > 0 ? 'new' : '—', tone };
  }
  const pct = ((value - baseline) / Math.abs(baseline)) * 100;
  return { text: `${pct > 0 ? '+' : ''}${Math.round(pct)}%`, tone };
}

const DELTA_TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-brand-mint',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

function cellSubLabel(cell: CompareCellResult<unknown>['cell']): string {
  if (cell.kind === 'term' && cell.termNumber !== undefined) {
    return `T${cell.termNumber}`;
  }
  if (cell.kind === 'month' && cell.month) {
    const [y, m] = cell.month.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('en-SG', {
      month: 'short',
      year: '2-digit',
    });
  }
  const idx = cell.label.indexOf('·');
  return idx >= 0 ? cell.label.slice(idx + 1).trim() : cell.label;
}

/**
 * Find best and worst cell indices for a metric row.
 * Returns null for both when direction is unset (neutral metric) or all values equal.
 */
function findBestWorst(
  values: (number | null)[],
  direction: CompareGridMetric<unknown>['direction']
): { bestIdx: number | null; worstIdx: number | null } {
  if (!direction) return { bestIdx: null, worstIdx: null };
  const numeric = values
    .map((v, i) => (v !== null ? { v, i } : null))
    .filter((x): x is { v: number; i: number } => x !== null);
  if (numeric.length < 2) return { bestIdx: null, worstIdx: null };
  const sorted = [...numeric].sort((a, b) => a.v - b.v);
  const minItem = sorted[0];
  const maxItem = sorted[sorted.length - 1];
  if (minItem.v === maxItem.v) return { bestIdx: null, worstIdx: null };
  return direction === 'lowerIsBetter'
    ? { bestIdx: minItem.i, worstIdx: maxItem.i }
    : { bestIdx: maxItem.i, worstIdx: minItem.i };
}

/**
 * Group cells by AY (preserving order) for the spanning top header row.
 */
function groupByAy<T>(
  cells: CompareCellResult<T>[]
): Array<{ ayCode: string; startIdx: number; span: number }> {
  const groups: Array<{ ayCode: string; startIdx: number; span: number }> = [];
  for (let i = 0; i < cells.length; i++) {
    const code = cells[i].cell.ayCode;
    const last = groups[groups.length - 1];
    if (last && last.ayCode === code) {
      last.span += 1;
    } else {
      groups.push({ ayCode: code, startIdx: i, span: 1 });
    }
  }
  return groups;
}

export function CompareGrid<T>({
  cells,
  metrics,
  title,
  description,
}: CompareGridProps<T>) {
  const ayGroups = groupByAy(cells);
  const baselineIdx = 0;

  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile"
          aria-hidden
        >
          <LayoutGrid className="h-5 w-5" />
        </span>
        <div className="flex-1 space-y-1">
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Compare
          </CardDescription>
          <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-foreground">
            {title}
          </CardTitle>
          {description && (
            <p className="text-[13px] text-muted-foreground">{description}</p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <Table>
            <TableHeader>
              {/* AY group row — 2px indigo top border groups columns by year */}
              <TableRow className="hover:bg-transparent">
                <TableHead
                  rowSpan={2}
                  className="sticky left-0 z-20 border-r border-hairline bg-muted/30 align-bottom"
                >
                  Metric
                </TableHead>
                {ayGroups.map((g) => (
                  <TableHead
                    key={g.ayCode}
                    colSpan={g.span}
                    className="border-l border-t-2 border-l-hairline border-t-brand-indigo/30 bg-card text-center text-[11px] font-semibold text-brand-navy"
                  >
                    {g.ayCode}
                  </TableHead>
                ))}
              </TableRow>
              {/* Per-cell sub-labels */}
              <TableRow className="hover:bg-transparent">
                {cells.map((c, i) => (
                  <TableHead
                    key={`${c.cell.ayCode}-${cellSubLabel(c.cell)}-${i}`}
                    className={cn(
                      'h-9 border-l border-hairline bg-muted/20 text-center text-muted-foreground',
                      i === baselineIdx && 'font-semibold text-foreground'
                    )}
                    title={
                      i === baselineIdx
                        ? 'Baseline — Δ values are measured against this cell'
                        : undefined
                    }
                  >
                    {cellSubLabel(c.cell)}
                    {i === baselineIdx && (
                      <span className="ml-1 text-[8px] tracking-normal text-muted-foreground/70">
                        BASE
                      </span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => {
                const values = cells.map((c) => metric.getValue(c.data));
                const baselineValue = values[baselineIdx];
                const { bestIdx, worstIdx } = findBestWorst(
                  values,
                  metric.direction
                );
                return (
                  <TableRow key={metric.key}>
                    {/* Sticky metric label column */}
                    <TableCell className="sticky left-0 z-10 border-r border-hairline bg-card text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{metric.label}</span>
                        {metric.direction === 'lowerIsBetter' && (
                          <span
                            className="text-[10px] text-muted-foreground"
                            title="Lower is better"
                          >
                            ↓
                          </span>
                        )}
                        {bestIdx !== null && worstIdx !== null && (
                          <span className="ml-auto flex gap-0.5 text-[10px]">
                            <span
                              className="text-brand-mint"
                              title={`Best: ${cells[bestIdx].cell.label}`}
                            >
                              ●
                            </span>
                            <span
                              className="text-destructive"
                              title={`Worst: ${cells[worstIdx].cell.label}`}
                            >
                              ●
                            </span>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {cells.map((c, i) => {
                      const v = values[i];
                      const delta = formatDelta(
                        v,
                        baselineValue,
                        metric.format,
                        metric.direction,
                        i === baselineIdx
                      );
                      return (
                        <TableCell
                          key={`${c.cell.label}-${i}`}
                          className="border-l border-hairline text-right align-middle font-mono tabular-nums"
                          title={
                            v === null ? 'No data for this period' : undefined
                          }
                        >
                          <div className="font-semibold text-foreground">
                            {formatValue(v, metric.format)}
                          </div>
                          {delta && (
                            <div
                              className={cn(
                                'mt-0.5 text-[10px] font-normal tracking-tight',
                                DELTA_TONE[delta.tone]
                              )}
                            >
                              {delta.text}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 px-1 text-[11px] text-muted-foreground">
          Δ values are measured against the leftmost{' '}
          <span className="font-mono">BASE</span> cell.{' '}
          <span className="font-mono">↓</span> on the metric label means lower
          is better. ● mint = best, ● red = worst (only shown for directional
          metrics).
        </p>
      </CardContent>
    </Card>
  );
}
