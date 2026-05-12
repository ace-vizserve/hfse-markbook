import { LayoutGrid } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CompareCellResult } from '@/lib/dashboard/compare';

export type CompareGridMetric<T> = {
  key: string;
  label: string;
  format?: 'number' | 'percent' | 'days';
  /** Pull the numeric value out of T for this metric. null = no data. */
  getValue: (data: T) => number | null;
  /**
   * When true, smaller values are "better" (shaded mint, marked best).
   * Defaults to false (higher = better). Drives both heatmap direction
   * and Δ-tone classification.
   */
  lowerIsBetter?: boolean;
  /**
   * @deprecated Heatmap is now applied to every metric by default. The
   * old "opt-in to highlighting" API stays accepted for back-compat but
   * has no effect on rendering — set `lowerIsBetter` instead when you
   * need direction-awareness.
   */
  highlightExtremes?: boolean;
};

export type CompareGridProps<T> = {
  cells: CompareCellResult<T>[];
  metrics: CompareGridMetric<T>[];
  title: string;
  description?: string;
};

type Bucket = 'best' | 'good' | 'neutral' | 'bad' | 'worst';

function bucketOf(value: number, min: number, max: number, lowerIsBetter: boolean): Bucket {
  if (max === min) return 'neutral';
  // Normalise to 0..1 where 1 = "best direction"
  const ratio = lowerIsBetter
    ? (max - value) / (max - min)
    : (value - min) / (max - min);
  if (ratio === 1) return 'best';
  if (ratio === 0) return 'worst';
  if (ratio >= 0.5) return 'good';
  return 'bad';
}

const BUCKET_CLASS: Record<Bucket, string> = {
  best: 'bg-brand-mint/15 text-brand-mint font-semibold',
  good: 'bg-brand-mint/5 text-foreground',
  neutral: 'text-muted-foreground',
  bad: 'bg-destructive/5 text-foreground',
  worst: 'bg-destructive/15 text-destructive font-semibold',
};

function formatValue(v: number | null, fmt: CompareGridMetric<unknown>['format']): string {
  if (v === null) return '—';
  if (fmt === 'percent') return `${Math.round(v)}%`;
  if (fmt === 'days') return `${Math.round(v)}d`;
  return v.toLocaleString('en-SG');
}

/**
 * Δ vs baseline (first cell). Returns the formatted delta string + the
 * tone bucket so the caller can colour it. Null when the comparison is
 * not meaningful (either side null, or the cell IS the baseline).
 */
function formatDelta(
  value: number | null,
  baseline: number | null,
  fmt: CompareGridMetric<unknown>['format'],
  lowerIsBetter: boolean,
  isBaseline: boolean,
): { text: string; tone: 'good' | 'bad' | 'neutral' } | null {
  if (isBaseline) return null;
  if (value === null || baseline === null) return null;
  if (value === baseline) return { text: '± 0', tone: 'neutral' };
  const direction = value > baseline ? 1 : -1;
  const goodDirection = lowerIsBetter ? -1 : 1;
  const tone: 'good' | 'bad' = direction === goodDirection ? 'good' : 'bad';
  // Percent metrics show absolute percentage points; everything else relative %.
  if (fmt === 'percent') {
    const diff = value - baseline;
    const text = `${diff > 0 ? '+' : ''}${Math.round(diff)}pp`;
    return { text, tone };
  }
  if (baseline === 0) {
    return { text: value > 0 ? 'new' : '—', tone };
  }
  const pct = ((value - baseline) / Math.abs(baseline)) * 100;
  const text = `${pct > 0 ? '+' : ''}${Math.round(pct)}%`;
  return { text, tone };
}

const DELTA_TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-brand-mint',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/**
 * Sub-label for a cell: "T1" for term-kind, "Apr 2026" for month-kind.
 * AY prefix lives in the spanning header above, so we strip it here.
 */
function cellSubLabel(cell: CompareCellResult<unknown>['cell']): string {
  if (cell.kind === 'term' && cell.termNumber !== undefined) {
    return `T${cell.termNumber}`;
  }
  if (cell.kind === 'month' && cell.month) {
    // Format YYYY-MM as "Mon YY" — keep it short for the header
    const [y, m] = cell.month.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('en-SG', { month: 'short', year: '2-digit' });
  }
  // Fallback: strip "AY9999 · " prefix from label
  const idx = cell.label.indexOf('·');
  return idx >= 0 ? cell.label.slice(idx + 1).trim() : cell.label;
}

/**
 * Group cells by AY (preserving order) for the spanning top header row.
 */
function groupByAy<T>(
  cells: CompareCellResult<T>[],
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

export function CompareGrid<T>({ cells, metrics, title, description }: CompareGridProps<T>) {
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Top row: AY-spanning headers */}
              <tr>
                <th
                  rowSpan={2}
                  className="border-b border-hairline bg-muted/30 px-3 py-2 text-left align-bottom font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4"
                >
                  Metric
                </th>
                {ayGroups.map((g) => (
                  <th
                    key={g.ayCode}
                    colSpan={g.span}
                    className="border-b border-l border-hairline bg-gradient-to-b from-brand-indigo/10 to-transparent px-3 py-1.5 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-navy"
                  >
                    {g.ayCode}
                  </th>
                ))}
              </tr>
              {/* Bottom row: per-cell sub-labels */}
              <tr>
                {cells.map((c, i) => (
                  <th
                    key={`${c.cell.ayCode}-${cellSubLabel(c.cell)}-${i}`}
                    className={cn(
                      'border-b border-l border-hairline bg-muted/20 px-3 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground',
                      i === baselineIdx && 'text-foreground',
                    )}
                    title={i === baselineIdx ? 'Baseline cell — Δ values below are measured against this' : undefined}
                  >
                    {cellSubLabel(c.cell)}
                    {i === baselineIdx && (
                      <span className="ml-1 text-[8px] tracking-normal text-muted-foreground/70">
                        BASE
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const values = cells.map((c) => metric.getValue(c.data));
                const numeric = values.filter((v): v is number => v !== null);
                const max = numeric.length > 0 ? Math.max(...numeric) : null;
                const min = numeric.length > 0 ? Math.min(...numeric) : null;
                const lowerIsBetter = Boolean(metric.lowerIsBetter);
                const baselineValue = values[baselineIdx];
                return (
                  <tr key={metric.key}>
                    <td className="border-b border-hairline px-3 py-2.5 text-foreground">
                      <span className="font-medium">{metric.label}</span>
                      {lowerIsBetter && (
                        <span
                          className="ml-1 text-[10px] text-muted-foreground"
                          title="Lower is better"
                        >
                          ↓
                        </span>
                      )}
                    </td>
                    {cells.map((c, i) => {
                      const v = values[i];
                      const bucket: Bucket =
                        v === null || min === null || max === null
                          ? 'neutral'
                          : bucketOf(v, min, max, lowerIsBetter);
                      const delta = formatDelta(
                        v,
                        baselineValue,
                        metric.format,
                        lowerIsBetter,
                        i === baselineIdx,
                      );
                      return (
                        <td
                          key={`${c.cell.label}-${i}`}
                          className={cn(
                            'border-b border-l border-hairline px-3 py-2.5 text-right align-middle font-mono tabular-nums transition-colors',
                            BUCKET_CLASS[bucket],
                          )}
                          title={v === null ? 'No data for this period' : undefined}
                        >
                          <div>{formatValue(v, metric.format)}</div>
                          {delta && (
                            <div
                              className={cn(
                                'mt-0.5 text-[10px] font-normal tracking-tight',
                                DELTA_TONE[delta.tone],
                              )}
                            >
                              {delta.text}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 px-1 text-[11px] text-muted-foreground">
          Cells are shaded by relative magnitude within each row. Mint = best
          direction; red = worst. <span className="font-mono">↓</span> on the
          metric label means lower is better. Δ values are measured against
          the leftmost <span className="font-mono">BASE</span> cell.
        </p>
      </CardContent>
    </Card>
  );
}
