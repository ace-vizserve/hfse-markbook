'use client';

import dynamic from 'next/dynamic';

import { ChartSkeleton } from '@/components/dashboard/charts/chart-skeleton';
import type { DocumentCompletionCardProps } from './document-completion-card.client';

const DocumentCompletionCardImpl = dynamic(
  () => import('./document-completion-card.client').then((m) => m.DocumentCompletionCard),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="comparison-bar" />,
  },
);

export function DocumentCompletionCard(props: DocumentCompletionCardProps) {
  return <DocumentCompletionCardImpl {...props} />;
}

export type { DocumentCompletionCardProps };
