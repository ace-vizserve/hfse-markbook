import { Megaphone } from 'lucide-react';

import type { ReferralSource } from '@/lib/admissions/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DonutChart } from '@/components/dashboard/charts/donut-chart';

export function ReferralSourceChart({
  data,
  onSegmentClick,
}: {
  data: ReferralSource[];
  onSegmentClick?: (segment: string) => void;
}) {
  const empty = data.length === 0;
  const total = data.reduce((s, r) => s + r.count, 0);
  const slices = data.map((d) => ({ name: d.source, value: d.count }));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Referral source
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          How parents hear about us
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Megaphone className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
            <Megaphone className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No referral data</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              The referral field on the enrolment form is empty for all applicants in this AY.
            </p>
          </div>
        ) : (
          <DonutChart
            data={slices}
            centerValue={total.toLocaleString('en-SG')}
            centerLabel="Sources"
            onSegmentClick={onSegmentClick}
          />
        )}
      </CardContent>
    </Card>
  );
}
