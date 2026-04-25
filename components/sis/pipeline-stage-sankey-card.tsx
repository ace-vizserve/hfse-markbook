'use client';

import { Workflow } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { PipelineStage } from '@/lib/sis/dashboard';

/**
 * PipelineStageSankeyCard — STUB pending Task 4.
 *
 * Will render a Sankey-style stage-flow visualization. For now it renders a
 * placeholder card so Task 3 (drill wrappers) can ship without an unresolved
 * import. Task 4 replaces the body with the real visualization while keeping
 * the same prop contract.
 */
export function PipelineStageSankeyCard({
  data,
  onSegmentClick: _onSegmentClick,
}: {
  data: PipelineStage[];
  onSegmentClick?: (stage: string) => void;
}) {
  const total = data.reduce((sum, s) => sum + s.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Pipeline · Sankey
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Pipeline Stage Sankey — pending
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Workflow className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
          <Workflow className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">Sankey pending</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Stage-flow visualization arrives in Task 4. {total.toLocaleString('en-SG')} students tracked.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
