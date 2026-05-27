'use client';

import * as React from 'react';
import { CalendarIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * DatePicker — shadcn popover + calendar, date-only (no time).
 *
 * Replacement for native `<Input type="date" />`. Value is an ISO date string
 * in `yyyy-MM-dd` form (what the SIS schemas expect). Empty string = "no value".
 *
 * For date + time use the sibling `DateTimePicker` in `./date-time-picker.tsx`.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  id,
  disabled,
  className,
  allowClear = true,
}: {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = value ? parseLocalDate(value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-start gap-2 font-normal',
            !parsed && 'text-ink-5',
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 text-ink-4" />
          {parsed ? (
            <span className="font-mono text-[12px] tabular-nums text-foreground">
              {formatDisplay(parsed)}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
          {allowClear && parsed && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              className="ml-auto flex size-5 items-center justify-center rounded-md text-ink-4 hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange('');
                }
              }}
            >
              <XIcon className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsed ?? undefined}
          onSelect={(d) => {
            if (!d) {
              onChange('');
            } else {
              onChange(toISODate(d));
            }
            setOpen(false);
          }}
          captionLayout="dropdown"
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// yyyy-MM-dd → Date (local, midnight). Avoids the UTC-shift trap that
// `new Date('2026-04-20')` falls into (parsed as UTC, displays as prior day
// in timezones west of Greenwich).
function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
