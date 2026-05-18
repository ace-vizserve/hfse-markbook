'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from './chart-skeleton';
import type { SparkPoint } from './sparkline-chart.client';

const SparklineChartImpl = dynamic(
  () => import('./sparkline-chart.client').then((m) => m.SparklineChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="sparkline" />,
  },
);

export function SparklineChart({ points }: { points: SparkPoint[] }) {
  return <SparklineChartImpl points={points} />;
}

export type { SparkPoint };
