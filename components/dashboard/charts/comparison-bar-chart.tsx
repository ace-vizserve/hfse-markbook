'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type {
  ComparisonBarChartProps,
  ComparisonBarPoint,
  YFormat,
} from './comparison-bar-chart.client';

const ComparisonBarChartImpl = dynamic(
  () =>
    import('./comparison-bar-chart.client').then((m) => m.ComparisonBarChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  }
);

export function ComparisonBarChart(props: ComparisonBarChartProps) {
  return <ComparisonBarChartImpl {...props} />;
}

export type { ComparisonBarChartProps, ComparisonBarPoint, YFormat };
