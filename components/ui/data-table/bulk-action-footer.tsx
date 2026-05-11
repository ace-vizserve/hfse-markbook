'use client';

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type BulkAction<TRow> = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onTrigger: (selectedRows: TRow[]) => void | Promise<void>;
  destructive?: boolean;
};

type BulkActionFooterProps<TRow> = {
  selectedRows: TRow[];
  actions: Array<BulkAction<TRow>>;
  onClear: () => void;
  className?: string;
};

export function BulkActionFooter<TRow>({ selectedRows, actions, onClear, className }: BulkActionFooterProps<TRow>) {
  if (selectedRows.length === 0) return null;
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3 text-xs">
        <span className="font-mono uppercase tracking-[0.1em] text-muted-foreground">{selectedRows.length} selected</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              size="sm"
              variant={action.destructive ? 'destructive' : 'default'}
              onClick={() => action.onTrigger(selectedRows)}
              className="h-8"
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
