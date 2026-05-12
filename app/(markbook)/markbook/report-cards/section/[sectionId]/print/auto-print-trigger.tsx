'use client';

import { useEffect } from 'react';

// Auto-fires window.print() once the page has mounted + the report cards
// have laid out. The user can also hit ⌘P / Ctrl+P themselves.
//
// Pain point #10: "batch PDF generation for the whole section in one
// action." The page renders N report cards stacked with page-break-after
// between them; this trigger means the user lands on the page and the
// browser's print dialog opens immediately. Save As PDF in that dialog
// produces a single multi-page PDF for the whole section — no PDF
// service needed.
export function AutoPrintTrigger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    // One frame of layout grace + a microtask so any lazy fonts settle
    // before the print snapshot is taken.
    const id = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(id);
  }, [enabled]);
  return null;
}
