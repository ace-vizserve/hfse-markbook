'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { RevisionsHeatmapCell } from '@/lib/p-files/dashboard';

const RevisionsHeatmapCardImpl = dynamic(
  () =>
    import('./revisions-heatmap-card.client').then(
      (m) => m.RevisionsHeatmapCardImpl
    ),
  { ssr: false, loading: () => <ChartSkeleton kind="comparison-bar" /> }
);

export function RevisionsHeatmapCard({
  data,
  ayCode,
  weeks,
}: {
  data: RevisionsHeatmapCell[];
  ayCode: string;
  weeks?: number;
}) {
  return <RevisionsHeatmapCardImpl data={data} ayCode={ayCode} weeks={weeks} />;
}
