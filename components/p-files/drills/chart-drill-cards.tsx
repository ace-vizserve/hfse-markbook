'use client';

import * as React from 'react';
import { Download } from 'lucide-react';

import { DonutChart } from '@/components/dashboard/charts/donut-chart';
import { CompletionByLevelChart } from '@/components/p-files/completion-by-level-chart';
import { PFilesDrillSheet } from '@/components/p-files/drills/pfiles-drill-sheet';
import { TopMissingPanel } from '@/components/p-files/top-missing-panel';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import type { LevelCompletionRow, SlotStatusMix } from '@/lib/p-files/dashboard';
import type { DocumentBacklogRow } from '@/lib/sis/dashboard';

// Per-target client wrappers for P-Files chart cards. Drill sheets lazy-fetch
// rows via /api/p-files/drill (per spec §6.2 — P-Files row volume is too
// large to pre-fetch). Each wrapper owns its own Sheet open-state.

type CommonProps = {
  ayCode: string;
};

// ─── Slot Status Mix → slot-by-status ───────────────────────────────────────

export function SlotStatusDrillCard({
  slotMix,
  ayCode,
}: CommonProps & { slotMix: SlotStatusMix }) {
  const [status, setStatus] = React.useState<string | null>(null);
  const slices = [
    { name: 'On file', value: slotMix.valid },
    { name: 'Pending review', value: slotMix.pending },
    { name: 'Expired', value: slotMix.rejected },
    { name: 'Missing', value: slotMix.missing },
  ];
  const total = slotMix.valid + slotMix.pending + slotMix.rejected + slotMix.missing;
  return (
    <Sheet open={!!status} onOpenChange={(o) => !o && setStatus(null)}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Slot status mix
          </CardDescription>
          <CardTitle className="font-serif text-xl">Where documents stand</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart
            data={slices}
            centerValue={total}
            centerLabel="Total"
            onSegmentClick={setStatus}
          />
        </CardContent>
      </Card>
      {status && (
        <PFilesDrillSheet
          target="slot-by-status"
          segment={status}
          ayCode={ayCode}
          initialScope="ay"
        />
      )}
    </Sheet>
  );
}

// ─── Top Missing Panel → missing-by-slot ────────────────────────────────────

export function TopMissingDrillCard({
  data,
  ayCode,
}: CommonProps & { data: DocumentBacklogRow[] }) {
  const [slotKey, setSlotKey] = React.useState<string | null>(null);
  return (
    <Sheet open={!!slotKey} onOpenChange={(o) => !o && setSlotKey(null)}>
      <TopMissingPanel data={data} limit={6} onSegmentClick={setSlotKey} />
      {slotKey && (
        <PFilesDrillSheet
          target="missing-by-slot"
          segment={slotKey}
          ayCode={ayCode}
          initialScope="ay"
        />
      )}
    </Sheet>
  );
}

// ─── Completion by Level → level-applicants ─────────────────────────────────

export function CompletionByLevelDrillCard({
  data,
  ayCode,
}: CommonProps & { data: LevelCompletionRow[] }) {
  const [level, setLevel] = React.useState<string | null>(null);
  return (
    <Sheet open={!!level} onOpenChange={(o) => !o && setLevel(null)}>
      <CompletionByLevelChart data={data} onSegmentClick={setLevel} />
      {level && (
        <PFilesDrillSheet
          target="level-applicants"
          segment={level}
          ayCode={ayCode}
          initialScope="ay"
        />
      )}
    </Sheet>
  );
}

// ─── Completeness Table CSV button ──────────────────────────────────────────
// The Completeness Table already drills via row link to /p-files/[enroleeNumber].
// This wrapper just adds an Export CSV button above the existing table.

export function CompletenessCsvButton({ ayCode }: CommonProps) {
  const csvHref = `/api/p-files/drill/all-docs?ay=${ayCode}&scope=ay&format=csv`;
  return (
    <div className="flex justify-end">
      <Button asChild variant="outline" size="sm">
        <a href={csvHref} download>
          <Download className="size-3.5" />
          Export CSV
        </a>
      </Button>
    </div>
  );
}
