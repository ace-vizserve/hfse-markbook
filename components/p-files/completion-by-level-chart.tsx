'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { LevelCompletionRow } from '@/lib/p-files/dashboard';

const CompletionByLevelChartImpl = dynamic(
  () =>
    import('./completion-by-level-chart.client').then(
      (m) => m.CompletionByLevelChartImpl
    ),
  { ssr: false, loading: () => <ChartSkeleton kind="comparison-bar" /> }
);

export function CompletionByLevelChart({
  data,
  onSegmentClick,
}: {
  data: LevelCompletionRow[];
  onSegmentClick?: (level: string) => void;
}) {
  return (
    <CompletionByLevelChartImpl data={data} onSegmentClick={onSegmentClick} />
  );
}
