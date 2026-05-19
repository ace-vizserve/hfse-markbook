import { TrendingUp } from 'lucide-react';

import { TrendChart } from '@/components/dashboard/charts/trend-chart';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { TrendPoint } from '@/components/dashboard/charts/trend-chart.client';

export function AuditDailyTrendCard({
  current,
  comparison,
}: {
  current: TrendPoint[];
  comparison: TrendPoint[] | null;
}) {
  const empty = current.length === 0 || current.every((p) => p.y === 0);

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Activity over time
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Daily audit events
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <TrendingUp className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
            <TrendingUp className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No activity in this range</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              The trend line appears once audit events are logged in the selected period.
            </p>
          </div>
        ) : (
          <TrendChart
            label="Audit events"
            current={current}
            comparison={comparison}
            height={220}
            yFormat="number"
          />
        )}
      </CardContent>
    </Card>
  );
}
