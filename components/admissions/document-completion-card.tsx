'use client';

import * as React from 'react';
import { FileCheck2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DocCompletionResult } from '@/lib/admissions/dashboard';
import type { DrillRow } from '@/lib/admissions/drill';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { ChartLegendChip } from '@/components/dashboard/chart-legend-chip';
import { AdmissionsDrillSheet } from '@/components/admissions/drills/admissions-drill-sheet';

export type DocumentCompletionCardProps = {
  data: DocCompletionResult;
  ayCode: string;
  drillRows?: DrillRow[];
};

export function DocumentCompletionCard({
  data,
  ayCode,
  drillRows,
}: DocumentCompletionCardProps) {
  const [openLevel, setOpenLevel] = React.useState<string | null>(null);

  const chartData = React.useMemo(
    () =>
      data.map((row) => ({
        level: row.level,
        complete: row.complete,
        partial: row.partial,
        missing: row.missing,
      })),
    [data],
  );

  const empty = data.length === 0;

  // Defensive payload extraction shared across all three stacked Bar segments —
  // mirrors the comparison-bar-chart.tsx pattern. recharts hands us a payload
  // whose shape isn't typed, so we narrow with a type-guard cast and pull the
  // category (`level`) off either the wrapping payload or the row itself.
  const handleBarClick = React.useCallback((data: unknown) => {
    const payload = data as { payload?: { level?: string }; level?: string };
    const level = payload?.payload?.level ?? payload?.level;
    if (level) setOpenLevel(level);
  }, []);

  return (
    <Sheet
      open={!!openLevel}
      onOpenChange={(o) => {
        if (!o) setOpenLevel(null);
      }}
    >
      <Card className="h-full">
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Documents
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Documents collected by level
          </CardTitle>
          <CardAction>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <FileCheck2 className="size-4" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <FileCheck2 className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">No document data</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Document completion appears once applicants have uploaded files.
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="level"
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    allowDecimals={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-accent)', opacity: 0.5 }}
                    contentStyle={{
                      background: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      color: 'var(--color-popover-foreground)',
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="complete"
                    name="Complete"
                    stackId="a"
                    fill="var(--color-brand-mint)"
                    isAnimationActive={false}
                    onClick={handleBarClick as never}
                    style={{ cursor: 'pointer' }}
                  />
                  <Bar
                    dataKey="partial"
                    name="Partial"
                    stackId="a"
                    fill="var(--color-brand-amber)"
                    isAnimationActive={false}
                    onClick={handleBarClick as never}
                    style={{ cursor: 'pointer' }}
                  />
                  <Bar
                    dataKey="missing"
                    name="Missing"
                    stackId="a"
                    fill="var(--color-destructive)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                    onClick={handleBarClick as never}
                    style={{ cursor: 'pointer' }}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ChartLegendChip color="fresh" label="Complete" />
                <ChartLegendChip color="chart-4" label="Partial" />
                <ChartLegendChip color="very-stale" label="Missing" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {openLevel && (
        <AdmissionsDrillSheet
          target="doc-completion"
          segment={openLevel}
          ayCode={ayCode}
          initialScope="ay"
          initialRows={drillRows}
        />
      )}
    </Sheet>
  );
}
