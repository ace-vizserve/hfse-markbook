import * as React from 'react';
import { cn } from '@/lib/utils';

type PageShellProps = React.HTMLAttributes<HTMLDivElement>;

export function PageShell({ className, children, ...props }: PageShellProps) {
  return (
    <div
      className={cn('mx-auto w-full max-w-6xl space-y-8', className)}
      {...props}
    >
      {children}
    </div>
  );
}
