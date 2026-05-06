'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type { TrendChartProps, TrendPoint, YFormat } from './trend-chart.client';

const TrendChartImpl = dynamic(
  () => import('./trend-chart.client').then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="trend" />,
  },
);

export function TrendChart(props: TrendChartProps) {
  return <TrendChartImpl {...props} />;
}

export type { TrendChartProps, TrendPoint, YFormat };
