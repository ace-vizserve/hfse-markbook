import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[[data-slot=alert-icon]]:grid-cols-[auto_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 has-[[data-slot=alert-icon]]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current shadow-sm ring-1 ring-inset',
  {
    variants: {
      variant: {
        default:
          'border-brand-indigo-soft/40 ring-brand-indigo-soft/40 bg-accent text-foreground',
        destructive:
          'border-destructive/30 ring-destructive/30 bg-destructive/5 text-destructive [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/85',
        success:
          'border-brand-mint/60 ring-brand-mint/60 bg-brand-mint/20 text-foreground',
        warning:
          'border-brand-amber/50 ring-brand-amber/50 bg-brand-amber-light text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    data-slot="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 font-serif text-[15px] font-semibold tracking-tight',
        className,
      )}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="alert-description"
    className={cn(
      'col-start-2 grid justify-items-start gap-1 text-sm leading-relaxed text-muted-foreground [&_p]:leading-relaxed',
      className,
    )}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

const alertIconVariants = cva(
  'col-start-1 row-span-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile',
        destructive: 'bg-destructive text-destructive-foreground shadow-brand-tile-destructive',
        success: 'bg-gradient-to-br from-brand-mint to-brand-sky text-ink shadow-brand-tile-mint',
        warning: 'bg-brand-amber text-ink shadow-brand-tile-amber',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const AlertIcon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertIconVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="alert-icon"
    className={cn(alertIconVariants({ variant }), className)}
    {...props}
  />
));
AlertIcon.displayName = 'AlertIcon';

export { Alert, AlertTitle, AlertDescription, AlertIcon };
