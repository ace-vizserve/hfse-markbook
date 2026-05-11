'use client';

import { Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  className?: string;
};

export function DataTableEmptyState({ icon: Icon = Inbox, title, body, cta, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-accent/20 to-accent/5 text-accent-foreground ring-inset ring-1 ring-accent/30',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-serif text-base text-foreground">{title}</p>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {cta && (
        cta.href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={cta.onClick}>
            {cta.label}
          </Button>
        )
      )}
    </div>
  );
}
