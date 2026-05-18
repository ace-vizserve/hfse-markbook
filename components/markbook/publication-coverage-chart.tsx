'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { PublicationCoverageChartProps } from './publication-coverage-chart.client';

const PublicationCoverageChartImpl = dynamic(
  () => import('./publication-coverage-chart.client').then((m) => m.PublicationCoverageChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  },
);

export function PublicationCoverageChart(props: PublicationCoverageChartProps) {
  return <PublicationCoverageChartImpl {...props} />;
}

export type { PublicationCoverageChartProps };
