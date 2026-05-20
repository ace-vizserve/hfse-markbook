import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function HubClassAssignmentCallout({ count, ayLabel }: { count: number; ayLabel?: string }) {
  if (count === 0) return null;

  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>
        {count} enrolled {count === 1 ? 'student' : 'students'} without a section
        {ayLabel ? <span className="font-normal text-muted-foreground"> · {ayLabel}</span> : null}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {count === 1 ? 'This student is' : 'These students are'} fully enrolled but
          haven&apos;t been assigned to a class section yet. They won&apos;t appear in
          attendance, markbook, or evaluation until a section is assigned.
        </span>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href="/records/unsynced">Assign now</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
