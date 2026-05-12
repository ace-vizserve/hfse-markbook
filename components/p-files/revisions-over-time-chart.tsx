import { History } from 'lucide-react';

import type { RevisionWeek } from '@/lib/p-files/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TrendChart } from '@/components/dashboard/charts/trend-chart';

export function RevisionsOverTimeChart({ data }: { data: RevisionWeek[] }) {
  const total = data.reduce((sum, w) => sum + w.count, 0);
  const empty = total === 0;
  const recentWeek = data[data.length - 1];
  const priorWeek = data[data.length - 2];
  const delta = recentWeek && priorWeek ? recentWeek.count - priorWeek.count : 0;
  const points = data.map((w) => ({ x: w.weekLabel, y: w.count }));

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Rolling · Last {data.length} weeks
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Document replacements over time
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <History className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
            <History className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No replacements yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              When staff replace documents, each archive appears as a bump on this chart.
            </p>
          </div>
        ) : (
          <TrendChart label="Replacements" current={points} height={280} />
        )}
      </CardContent>
      {!empty && (
        <CardFooter className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold tabular-nums text-foreground">{total}</span> replacements total
            {recentWeek && (
              <>
                {' · '}
                <span className="tabular-nums text-foreground">{recentWeek.count}</span> this week
                {delta !== 0 && (
                  <>
                    {' ('}
                    <span className={delta > 0 ? 'text-brand-amber' : 'text-muted-foreground'}>
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </span>
                    {')'}
                  </>
                )}
              </>
            )}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
