import { cn } from '@/lib/utils';
import * as React from 'react';

type PageShellProps = React.HTMLAttributes<HTMLDivElement>;

export function PageShell({ className, children, ...props }: PageShellProps) {
  return (
    <div
      className={cn('mx-auto w-full max-w-360 space-y-8', className)}
      {...props}
    >
      {children}
    </div>
  );
}
