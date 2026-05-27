import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md border border-hairline bg-white from-muted via-muted/60 to-muted',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
