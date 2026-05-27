'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { GradeDistributionChartProps } from './grade-distribution-chart.client';

const GradeDistributionChartImpl = dynamic(
  () =>
    import('./grade-distribution-chart.client').then(
      (m) => m.GradeDistributionChart
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  }
);

export function GradeDistributionChart(props: GradeDistributionChartProps) {
  return <GradeDistributionChartImpl {...props} />;
}

export type { GradeDistributionChartProps };
