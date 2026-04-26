import {
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import type { BadgeProps } from '@/components/ui/badge';

// Single source of truth for the grade-change-request status badge.
// Both surfaces (admin queue at /markbook/change-requests + teacher's
// own-requests view at /markbook/grading/requests) consume this.
//
// All variants are non-flat (gradient pills with white text + shadow)
// per the 26th-pass design-system "non-flat" primitive refresh — state
// pills carry the brand voice via the gradient, with the icon + label
// disambiguating the specific lifecycle step. No wash overrides; the
// Badge variant prop carries the colour entirely.

export type ChangeRequestStatus =
  | 'pending'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'cancelled';

export type ChangeRequestStatusConfig = {
  label: string;
  icon: LucideIcon;
  variant: NonNullable<BadgeProps['variant']>;
};

export const CHANGE_REQUEST_STATUS_CONFIG: Record<
  ChangeRequestStatus,
  ChangeRequestStatusConfig
> = {
  pending: {
    label: 'Awaiting Review',
    icon: Circle,
    // Amber gradient — calls the admin's eye; this is the row that needs a decision.
    variant: 'warning',
  },
  approved: {
    label: 'Approved · Awaiting Changes',
    icon: CheckCircle2,
    // Indigo gradient — decision made, system processing the change.
    variant: 'default',
  },
  applied: {
    label: 'Changes Applied',
    icon: CircleCheck,
    // Mint→sky gradient — terminal-positive, change is live.
    variant: 'success',
  },
  rejected: {
    label: 'Declined',
    icon: XCircle,
    // Destructive gradient — terminal-negative, request was declined.
    variant: 'blocked',
  },
  cancelled: {
    label: 'Cancelled',
    icon: CircleX,
    // Filled muted — terminal-neutral, teacher pulled the request before review.
    variant: 'muted',
  },
};
