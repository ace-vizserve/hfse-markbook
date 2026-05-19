import { Users } from 'lucide-react';
import Link from 'next/link';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SectionStaffingCoverage } from '@/lib/sis/dashboard';

export function HubSectionStaffingCard({ coverage }: { coverage: SectionStaffingCoverage }) {
  const { total, withAdviser } = coverage;
  const missing = total - withAdviser;
  const pct = total > 0 ? Math.round((withAdviser / total) * 100) : 100;
  const isFull = missing === 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Staffing
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Form adviser coverage
        </CardTitle>
        <CardAction>
          <Link href="/sis/sections" tabIndex={-1}>
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-xl text-white shadow-brand-tile',
                isFull
                  ? 'bg-gradient-to-br from-brand-mint to-chart-5'
                  : 'bg-gradient-to-br from-brand-amber to-brand-amber/70',
              )}
            >
              <Users className="size-4" />
            </div>
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 pb-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-3xl font-bold tabular-nums text-foreground">
            {withAdviser}
            <span className="ml-1 text-base font-normal text-muted-foreground">/ {total}</span>
          </span>
          <span
            className={cn(
              'font-mono text-sm font-semibold tabular-nums',
              isFull ? 'text-brand-mint' : 'text-brand-amber',
            )}
          >
            {pct}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isFull
                ? 'bg-gradient-to-r from-brand-mint to-chart-5'
                : 'bg-gradient-to-r from-brand-amber to-brand-amber/60',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {isFull
            ? `All ${total} sections have a form class adviser assigned.`
            : `${missing} ${missing === 1 ? 'section is' : 'sections are'} missing a form class adviser.`}
        </p>
      </CardContent>
    </Card>
  );
}
