'use client';

import * as React from 'react';

import { RATINGS } from '@/lib/evaluation/ratings';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Per-topic 1–5 proficiency rating selector. Replaces the prior binary
// checkbox in the Evaluation Checklists tab.
//
// Layout:
// - sm+ → 5-button segmented control (word labels with tooltips for the
//   plain-English description of each level).
// - below sm → <Select> fallback so narrow phones don't wrap to a 5-row
//   button column.
//
// Both controls render server-side; CSS controls visibility via
// `hidden sm:flex` / `sm:hidden` so the SSR markup is stable.

const CLEAR_SENTINEL = '__clear__';

type Props = {
  value: number | null;
  onSelect: (next: number | null) => void;
  disabled?: boolean;
};

export function RatingSelector({ value, onSelect, disabled }: Props) {
  return (
    <div className="w-full">
      {/* sm+ : segmented buttons */}
      <TooltipProvider delayDuration={250}>
        <div className="hidden flex-wrap gap-1 sm:flex">
          {RATINGS.map((r) => {
            const active = value === r.value;
            return (
              <Tooltip key={r.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(active ? null : r.value)}
                    aria-pressed={active}
                    aria-label={`${r.label} — ${r.description}`}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      active
                        ? cn('border-transparent', r.swatchClassName)
                        : 'border-border bg-transparent text-foreground hover:bg-muted/40'
                    )}
                  >
                    {r.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium text-popover-foreground">
                    {r.label}
                  </p>
                  <p className="text-[10px] text-popover-foreground/80">
                    {r.description}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* below sm : Select fallback */}
      <div className="sm:hidden">
        <Select
          value={value == null ? CLEAR_SENTINEL : String(value)}
          disabled={disabled}
          onValueChange={(v) =>
            onSelect(v === CLEAR_SENTINEL ? null : Number(v))
          }
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Not rated" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLEAR_SENTINEL}>Not rated</SelectItem>
            {RATINGS.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.value} — {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
