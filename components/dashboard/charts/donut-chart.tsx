'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type { DonutChartProps, DonutSlice } from './donut-chart.client';

const DonutChartImpl = dynamic(
  () => import('./donut-chart.client').then((m) => m.DonutChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="donut" />,
  }
);

export function DonutChart(props: DonutChartProps) {
  return <DonutChartImpl {...props} />;
}

export type { DonutChartProps, DonutSlice };
