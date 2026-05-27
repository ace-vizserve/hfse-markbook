import Link from 'next/link';
import { cn } from '@/lib/utils';

type IdentifierLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  prefetch?: boolean;
};

export function IdentifierLink({
  href,
  children,
  className,
  prefetch,
}: IdentifierLinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        'font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4',
        className
      )}
    >
      {children}
    </Link>
  );
}
