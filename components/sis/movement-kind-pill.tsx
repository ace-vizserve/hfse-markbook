'use client';

import * as React from 'react';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { MovementKind } from '@/lib/sis/movements';

// Single colored chip labelling an enrolment-movement event kind.
// Delegates to the shared <Badge> variants so the chip speaks the
// project's loud-pill voice (saturated brand gradient + white text +
// shadow) consistently with every other status pill across the SIS.

const LABELS: Record<MovementKind, string> = {
  'section-transfer': 'Transfer',
  withdrawn: 'Withdrawn',
  'late-enrolled': 'Late enrolled',
};

const VARIANT: Record<MovementKind, NonNullable<BadgeProps['variant']>> = {
  // Mint→sky gradient — neutral movement within the school.
  'section-transfer': 'success',
  // Destructive gradient — terminal exit from the school.
  withdrawn: 'blocked',
  // Amber gradient — time-bounded join after term start.
  'late-enrolled': 'warning',
};

export function MovementKindPill({ kind }: { kind: MovementKind }) {
  return <Badge variant={VARIANT[kind]}>{LABELS[kind]}</Badge>;
}
