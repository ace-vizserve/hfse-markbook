import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <PageShell>
      <header className="space-y-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </header>

      <div className="flex items-center justify-end">
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      <div className="rounded-xl border border-hairline bg-card p-4">
        <Skeleton className="mb-4 h-9 w-72 rounded-md" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
