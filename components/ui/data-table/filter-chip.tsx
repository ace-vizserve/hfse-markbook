'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FilterChipProps = {
  label: string;
  value: string;
  onClear: () => void;
  className?: string;
};

export function FilterChip({ label, value, onClear, className }: FilterChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-2 pr-1 text-xs',
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-5 w-5 rounded-full"
        aria-label={`Clear ${label}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}
