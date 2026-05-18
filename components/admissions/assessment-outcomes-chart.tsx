'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { AssessmentOutcomesChartProps } from './assessment-outcomes-chart.client';

const AssessmentOutcomesChartImpl = dynamic(
  () => import('./assessment-outcomes-chart.client').then((m) => m.AssessmentOutcomesChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  },
);

export function AssessmentOutcomesChart(props: AssessmentOutcomesChartProps) {
  return <AssessmentOutcomesChartImpl {...props} />;
}

export type { AssessmentOutcomesChartProps };
