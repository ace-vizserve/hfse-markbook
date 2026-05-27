'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { RevisionWeek } from '@/lib/p-files/dashboard';

const RevisionsOverTimeChartImpl = dynamic(
  () =>
    import('./revisions-over-time-chart.client').then(
      (m) => m.RevisionsOverTimeChartImpl
    ),
  { ssr: false, loading: () => <ChartSkeleton kind="trend" /> }
);

export function RevisionsOverTimeChart({ data }: { data: RevisionWeek[] }) {
  return <RevisionsOverTimeChartImpl data={data} />;
}
