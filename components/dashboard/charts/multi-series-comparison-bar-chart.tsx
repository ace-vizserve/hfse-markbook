'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type {
  MultiSeriesBarPoint,
  MultiSeriesBarSeries,
  MultiSeriesComparisonBarChartProps,
  YFormat,
} from './multi-series-comparison-bar-chart.client';

const MultiSeriesComparisonBarChartImpl = dynamic(
  () =>
    import('./multi-series-comparison-bar-chart.client').then(
      (m) => m.MultiSeriesComparisonBarChart,
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="multi-bar" />,
  },
);

export function MultiSeriesComparisonBarChart(props: MultiSeriesComparisonBarChartProps) {
  return <MultiSeriesComparisonBarChartImpl {...props} />;
}

export type {
  MultiSeriesBarPoint,
  MultiSeriesBarSeries,
  MultiSeriesComparisonBarChartProps,
  YFormat,
};
