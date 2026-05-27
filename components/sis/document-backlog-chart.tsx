'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { DocumentBacklogChartProps } from './document-backlog-chart.client';

const DocumentBacklogChartImpl = dynamic(
  () =>
    import('./document-backlog-chart.client').then(
      (m) => m.DocumentBacklogChart
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  }
);

export function DocumentBacklogChart(props: DocumentBacklogChartProps) {
  return <DocumentBacklogChartImpl {...props} />;
}

export type { DocumentBacklogChartProps };
