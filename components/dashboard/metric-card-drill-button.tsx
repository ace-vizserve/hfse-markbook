'use client';

import * as React from 'react';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';

/**
 * Thin client wrapper that provides the Sheet open/close state for
 * MetricCard's drillSheet path. By isolating Sheet here, MetricCard itself
 * stays a shared component so server pages can freely pass LucideIcon and
 * render-prop functions as props without hitting the server→client
 * serialization constraint.
 */
export function MetricCardDrillButton({
  children,
  sheet,
}: {
  children: React.ReactNode;
  sheet: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="block w-full text-left">
          {children}
        </button>
      </SheetTrigger>
      {sheet}
    </Sheet>
  );
}
