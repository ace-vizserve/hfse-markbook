'use client';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import type { MovementKind } from '@/lib/sis/movements';

// Single colored chip labelling an enrolment-movement event kind.
//
// Centralised here so the table cell, future drill sheets, and any insight
// row that mentions a movement type share one visual recipe. Uses Aurora
// Vault tokens only — no raw colors per Hard Rule #7.

const LABELS: Record<MovementKind, string> = {
  'section-transfer': 'Transfer',
  withdrawn: 'Withdrawn',
  'late-enrolled': 'Late enrolled',
};

const CLASSNAMES: Record<MovementKind, string> = {
  // Mint informational — neutral movement within the school.
  'section-transfer': 'border-brand-mint bg-brand-mint/30 text-ink',
  // Destructive — terminal exit from the school.
  withdrawn: 'border-destructive/40 bg-destructive/10 text-destructive',
  // Amber warning — time-bounded join after term start.
  'late-enrolled': 'border-brand-amber/50 bg-brand-amber/15 text-ink',
};

export function MovementKindPill({ kind }: { kind: MovementKind }) {
  return (
    <Badge variant="outline" className={CLASSNAMES[kind]}>
      {LABELS[kind]}
    </Badge>
  );
}
