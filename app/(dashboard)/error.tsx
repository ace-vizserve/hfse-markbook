'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-lg" role="alert" aria-live="assertive">
        <CardHeader className="items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <AlertTriangle
              className="h-6 w-6 text-destructive"
              aria-hidden="true"
            />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error stopped this page from loading. This has been
            logged. Try again, or return to the dashboard if the problem
            persists.
          </CardDescription>
        </CardHeader>
        {isDev && (error.message || error.digest) && (
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          </CardContent>
        )}
        <CardFooter className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset} autoFocus>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Back to dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
