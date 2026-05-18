'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { SheetProgressChartProps } from './sheet-progress-chart.client';

const SheetProgressChartImpl = dynamic(
  () => import('./sheet-progress-chart.client').then((m) => m.SheetProgressChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  },
);

export function SheetProgressChart(props: SheetProgressChartProps) {
  return <SheetProgressChartImpl {...props} />;
}

export type { SheetProgressChartProps };
