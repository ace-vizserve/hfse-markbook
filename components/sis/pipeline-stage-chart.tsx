import { Workflow } from 'lucide-react';

import type { PipelineStage } from '@/lib/sis/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ComparisonBarChart } from '@/components/dashboard/charts/comparison-bar-chart';

export function PipelineStageChart({
  data,
  onSegmentClick,
}: {
  data: PipelineStage[];
  onSegmentClick?: (segment: string) => void;
}) {
  const total = data.reduce((sum, s) => sum + s.count, 0);
  const empty = total === 0;
  const chartData = data.map((d) => ({ category: d.label, current: d.count }));

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Pipeline
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Where students are in the pipeline
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Workflow className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[340px] flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No students yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Bars appear once applicants exist for this academic year.
            </p>
          </div>
        ) : (
          <ComparisonBarChart
            data={chartData}
            orientation="horizontal"
            height={340}
            onSegmentClick={onSegmentClick}
          />
        )}
      </CardContent>
    </Card>
  );
}
