import { GraduationCap } from 'lucide-react';

import type { LevelCount } from '@/lib/sis/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DonutChart } from '@/components/dashboard/charts/donut-chart';

export function LevelDistributionChart({
  data,
  onSegmentClick,
}: {
  data: LevelCount[];
  onSegmentClick?: (level: string) => void;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const empty = total === 0;
  const slices = data.map((d) => ({ name: d.level, value: d.count }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Enrolment · Levels
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Students by level
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <GraduationCap className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
            <GraduationCap className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No level data</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Bars appear once applications carry a level.
            </p>
          </div>
        ) : (
          <DonutChart
            data={slices}
            centerValue={total.toLocaleString('en-SG')}
            centerLabel="Students"
            height={240}
            onSegmentClick={onSegmentClick}
          />
        )}
      </CardContent>
    </Card>
  );
}
