import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PageShell>
      <Skeleton className="h-3.5 w-24" />

      <header className="space-y-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </header>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>

      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </PageShell>
  );
}
