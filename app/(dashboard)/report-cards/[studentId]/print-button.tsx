'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Sole action on the report card detail page — per design system §11.1,
// the single primary action on a page must use Button default variant.
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Print / Save as PDF
    </Button>
  );
}
