import { AlertTriangle, ArrowRight, CalendarRange } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { getCurrentAcademicYear } from '@/lib/academic-year';
import { isTestAyCode } from '@/lib/sis/environment';
import { createClient } from '@/lib/supabase/server';

// Always-present strip at the top of every authenticated module shell.
// Two visual modes:
//
//  - **Test environment** (ay_code matches `^AY9`): amber strip with the
//    AlertTriangle icon, "Disposable data" copy, and a "Switch to
//    Production" CTA. Same alarming treatment as before — operators must
//    not mistake test data for real student records.
//
//  - **Production AY** (any other ay_code): neutral strip with the
//    CalendarRange icon and the AY code + label inline. No CTA — this is
//    just a passive context label so admins always know which AY they're
//    operating on without scrolling to a header badge.
//
// Renders null only if `getCurrentAcademicYear()` returns null (no AY
// row marked is_current — broken setup state, banner can't help).
//
// Server component — does its own AY lookup so module layouts don't have
// to plumb anything through. One cheap round-trip per rendered page,
// deduped within the request via the React.cache wrapper inside
// getCurrentAcademicYear().
export async function AyBanner() {
  const supabase = await createClient();
  const ay = await getCurrentAcademicYear(supabase);
  if (!ay) return null;

  if (isTestAyCode(ay.ay_code)) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex shrink-0 items-center justify-center gap-3 border-b border-brand-amber/40 bg-brand-amber-light px-4 py-2 text-ink print:hidden"
      >
        <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-amber to-brand-amber/80 text-white shadow-sm">
          <AlertTriangle className="size-3" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-mono font-semibold uppercase tracking-[0.14em] text-ink">
            Test environment
          </span>
          <span className="font-mono text-ink-4" aria-hidden="true">
            ·
          </span>
          <span className="font-mono font-semibold tabular-nums text-ink-2">{ay.ay_code}</span>
          <span className="font-mono text-ink-4" aria-hidden="true">
            ·
          </span>
          <span className="text-ink-3">Disposable data</span>
        </div>
        <Button
          asChild
          variant="warning"
          size="sm"
          className="ml-1 h-7 px-2.5 text-[11px] font-semibold tracking-tight"
        >
          <Link href="/sis/admin/settings">
            Switch to Production
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-3 border-b border-hairline bg-muted/40 px-4 py-2 text-ink print:hidden"
    >
      <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-sm">
        <CalendarRange className="size-3" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-mono font-semibold uppercase tracking-[0.14em] text-ink">
          Academic year
        </span>
        <span className="font-mono text-ink-4" aria-hidden="true">
          ·
        </span>
        <span className="font-mono font-semibold tabular-nums text-ink-2">{ay.ay_code}</span>
        <span className="font-mono text-ink-4" aria-hidden="true">
          ·
        </span>
        <span className="text-ink-3">{ay.label}</span>
      </div>
    </div>
  );
}
