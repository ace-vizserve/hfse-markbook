'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Something went wrong
        </p>
        <h1 className="font-serif text-2xl text-foreground">
          An unexpected error occurred
        </h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {error.digest
            ? `Error ID: ${error.digest}`
            : 'Please try refreshing the page. If the problem persists, contact IT support.'}
        </p>
        <button
          onClick={reset}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
