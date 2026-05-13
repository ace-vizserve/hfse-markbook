import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';

// Server-side, conditionally renders. Read process.env directly — this
// is a server component, the var is available at SSR. Keeping the read
// inline (rather than going through lib/env.ts's `env` export) makes it
// obvious the banner is gated on exactly this one var.
//
// Uses the shadcn Alert primitive's `warning` variant (amber tokens via
// the design system — Hard Rule #7).
export function SisUrlMissingBanner() {
  const url = process.env.NEXT_PUBLIC_SIS_URL;
  if (url && url.trim() !== '') return null;

  return (
    <Alert variant="warning">
      <AlertIcon variant="warning">
        <AlertTriangle />
      </AlertIcon>
      <AlertTitle>Email links won&apos;t work yet.</AlertTitle>
      <AlertDescription>
        <p>
          The system URL isn&apos;t configured, so email buttons in grade change
          notifications, P-Files reminders, and report card publications will
          not open correctly for recipients. Ask your system administrator to
          set <code className="font-mono text-[12px]">NEXT_PUBLIC_SIS_URL</code>{' '}
          to this app&apos;s URL before the next deployment.
        </p>
      </AlertDescription>
    </Alert>
  );
}
