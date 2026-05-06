'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type {
  MultiSeriesTrendChartProps,
  MultiSeriesTrendPoint,
  MultiSeriesTrendSeries,
  YFormat,
} from './multi-series-trend-chart.client';

const MultiSeriesTrendChartImpl = dynamic(
  () => import('./multi-series-trend-chart.client').then((m) => m.MultiSeriesTrendChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="multi-trend" />,
  },
);

export function MultiSeriesTrendChart(props: MultiSeriesTrendChartProps) {
  return <MultiSeriesTrendChartImpl {...props} />;
}

export type {
  MultiSeriesTrendChartProps,
  MultiSeriesTrendPoint,
  MultiSeriesTrendSeries,
  YFormat,
};
