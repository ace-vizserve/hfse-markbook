import { Filter } from 'lucide-react';

import type { FunnelStage } from '@/lib/admissions/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ComparisonBarChart } from '@/components/dashboard/charts/comparison-bar-chart';

export function ConversionFunnelChart({
  data,
  onSegmentClick,
}: {
  data: FunnelStage[];
  onSegmentClick?: (segment: string) => void;
}) {
  const empty = data.every((d) => d.count === 0);
  const chartData = data.map((d) => ({ category: d.stage, current: d.count }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Conversion funnel
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Where do applications drop off?
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Filter className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
            <Filter className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No applications yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Funnel populates once admissions records exist for this academic year.
            </p>
          </div>
        ) : (
          <ComparisonBarChart
            data={chartData}
            orientation="horizontal"
            height={260}
            onSegmentClick={onSegmentClick}
          />
        )}
      </CardContent>
    </Card>
  );
}
