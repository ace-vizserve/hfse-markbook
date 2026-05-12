'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { type Column } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SortableHeaderProps<TRow> = {
  column: Column<TRow, unknown>;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
};

export function SortableHeader<TRow>({ column, children, className, align = 'left' }: SortableHeaderProps<TRow>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className={cn(
        '-ml-3 h-7 gap-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
        align === 'right' && 'ml-0 mr-0',
        className,
      )}
    >
      {children}
      <Icon className="h-3 w-3 opacity-60" aria-hidden />
    </Button>
  );
}
