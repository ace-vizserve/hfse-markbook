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
  /** Highlight the highest cell ('best') in this row green, lowest red. Default false. */
  highlightExtremes?: boolean;
};

export type CompareGridProps<T> = {
  cells: CompareCellResult<T>[];
  metrics: CompareGridMetric<T>[];
  title: string;
  description?: string;
};

export function CompareGrid<T>({ cells, metrics, title, description }: CompareGridProps<T>) {
  const formatValue = (v: number | null, fmt: CompareGridMetric<T>['format']): string => {
    if (v === null) return '—';
    if (fmt === 'percent') return `${Math.round(v)}%`;
    if (fmt === 'days') return `${Math.round(v)}d`;
    return v.toLocaleString('en-SG');
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Compare
        </CardDescription>
        <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-hairline bg-muted/30 px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                  Metric
                </th>
                {cells.map((cell) => (
                  <th
                    key={cell.cell.label}
                    className="border-b border-l border-hairline bg-muted/30 px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground"
                  >
                    {cell.cell.label}
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
                return (
                  <tr key={metric.key}>
                    <td className="border-b border-hairline px-3 py-2.5 font-medium text-foreground">
                      {metric.label}
                    </td>
                    {cells.map((cell, i) => {
                      const v = values[i];
                      const isMax =
                        metric.highlightExtremes && v !== null && v === max && max !== min;
                      const isMin =
                        metric.highlightExtremes && v !== null && v === min && max !== min;
                      return (
                        <td
                          key={cell.cell.label}
                          className={cn(
                            'border-b border-l border-hairline px-3 py-2.5 text-right font-mono tabular-nums',
                            isMax && 'bg-brand-mint/10 text-brand-mint',
                            isMin && 'bg-destructive/10 text-destructive',
                          )}
                        >
                          {formatValue(v, metric.format)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
