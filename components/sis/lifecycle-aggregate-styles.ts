import {
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileSignatureIcon,
  FileWarningIcon,
  InboxIcon,
  LayoutGridIcon,
  MailQuestionIcon,
  PlaneIcon,
  SparklesIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

import type { ChartLegendChipColor } from '@/components/dashboard/chart-legend-chip';
import type { LifecycleBlockerBucket } from '@/lib/sis/process';

type Severity = LifecycleBlockerBucket['severity'];

// §7.4 crafted gradient icon tile per severity — matches InsightsPanel exactly.
export const LIFECYCLE_SEVERITY_TILE: Record<Severity, string> = {
  good: 'bg-gradient-to-br from-brand-mint to-brand-sky text-ink shadow-brand-tile-mint',
  warn: 'bg-brand-amber text-ink shadow-brand-tile-amber',
  bad: 'bg-destructive text-destructive-foreground shadow-brand-tile-destructive',
  info: 'bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile',
};

export const LIFECYCLE_SEVERITY_BADGE_COLOR: Record<Severity, ChartLegendChipColor> = {
  good: 'fresh',
  warn: 'stale',
  bad: 'very-stale',
  info: 'primary',
};

export const LIFECYCLE_SEVERITY_LABEL: Record<Severity, string> = {
  good: 'Good',
  warn: 'Watch',
  bad: 'Alert',
  info: 'Info',
};

// Per-bucket Lucide icon — semantic match to the bucket's intent.
export const LIFECYCLE_BUCKET_ICON: Record<string, LucideIcon> = {
  'awaiting-fee-payment': WalletIcon,
  'awaiting-document-revalidation': FileWarningIcon,
  'awaiting-document-validation': ClipboardCheckIcon,
  'awaiting-promised-documents': MailQuestionIcon,
  'awaiting-stp-completion': PlaneIcon,
  'awaiting-assessment-schedule': CalendarClockIcon,
  'awaiting-contract-signature': FileSignatureIcon,
  'missing-class-assignment': LayoutGridIcon,
  'ungated-to-enroll': SparklesIcon,
  'new-applications': InboxIcon,
};
