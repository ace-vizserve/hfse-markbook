import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusTone = 'healthy' | 'locked' | 'info' | 'muted' | 'warning';

const TONE_CLASS: Record<StatusTone, string> = {
  healthy:
    'bg-gradient-to-b from-mint/15 to-mint/5 text-mint-foreground ring-inset ring-1 ring-mint/30',
  locked:
    'bg-gradient-to-b from-destructive/15 to-destructive/5 text-destructive ring-inset ring-1 ring-destructive/30',
  info:
    'bg-gradient-to-b from-accent/20 to-accent/5 text-accent-foreground ring-inset ring-1 ring-accent/30',
  muted:
    'bg-muted text-muted-foreground ring-inset ring-1 ring-border',
  warning:
    'bg-gradient-to-b from-amber-500/15 to-amber-500/5 text-amber-700 ring-inset ring-1 ring-amber-500/30 dark:text-amber-400',
};

type StatusBadgeProps = {
  tone: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
};

export function StatusBadge({ tone, icon: Icon, className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      <span>{children}</span>
    </span>
  );
}
