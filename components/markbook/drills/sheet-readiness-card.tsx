'use client';

import * as React from 'react';
import { ListTodo, Lock } from 'lucide-react';

import { MarkbookDrillSheet } from '@/components/markbook/drills/markbook-drill-sheet';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { SheetRow } from '@/lib/markbook/drill';

const BADGE_BASE = 'h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]';

type SectionRollup = {
  sectionName: string;
  level: string | null;
  total: number;
  locked: number;
  open: number;
  pctLocked: number;
};

const CANONICAL_LEVEL_ORDER = ['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4'];
function levelRank(code: string | null): number {
  if (!code) return 99;
  const i = CANONICAL_LEVEL_ORDER.indexOf(code);
  return i === -1 ? 98 : i;
}

/**
 * SheetReadinessCard — per-section grading progress. Each section is one row
 * with a stacked progress bar showing locked (mint) vs open (amber) sheets,
 * plus the absolute counts. Sorted descending by open count so the largest
 * backlog surfaces first.
 *
 * Why a per-row meter and not a bar chart: a section with "8 open" reads very
 * differently when it's 8/8 vs 8/40. The meter shows both the absolute
 * backlog and the completion ratio in the same glyph. Click any row to drill
 * into that section's open sheets.
 */
export function SheetReadinessCard({
  sheets,
  ayCode,
}: {
  sheets: SheetRow[];
  ayCode: string;
}) {
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  const rollup = React.useMemo<SectionRollup[]>(() => {
    type Acc = { sectionName: string; level: string | null; total: number; locked: number };
    const map = new Map<string, Acc>();
    for (const s of sheets) {
      let acc = map.get(s.sectionName);
      if (!acc) {
        acc = { sectionName: s.sectionName, level: s.level, total: 0, locked: 0 };
        map.set(s.sectionName, acc);
      }
      acc.total += 1;
      if (s.isLocked) acc.locked += 1;
    }
    const rows: SectionRollup[] = [];
    for (const a of map.values()) {
      const open = a.total - a.locked;
      rows.push({
        sectionName: a.sectionName,
        level: a.level,
        total: a.total,
        locked: a.locked,
        open,
        pctLocked: a.total > 0 ? Math.round((a.locked / a.total) * 100) : 0,
      });
    }
    // Sort: most open first, then by level for tie-breaks.
    rows.sort((a, b) => b.open - a.open || levelRank(a.level) - levelRank(b.level));
    return rows;
  }, [sheets]);

  const totalOpen = rollup.reduce((s, r) => s + r.open, 0);
  const totalLocked = rollup.reduce((s, r) => s + r.locked, 0);
  const totalTotal = totalOpen + totalLocked;
  const overallPct = totalTotal > 0 ? Math.round((totalLocked / totalTotal) * 100) : 0;
  const empty = rollup.length === 0;
  // Sections with 0 open sheets get visually de-emphasized (they're done).
  const visibleRows = rollup.filter((r) => r.open > 0).slice(0, 12);
  const doneCount = rollup.filter((r) => r.open === 0).length;

  return (
    <Sheet open={!!openSection} onOpenChange={(o) => !o && setOpenSection(null)}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Sheet readiness
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Locked vs open by section
          </CardTitle>
          <CardAction>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <ListTodo className="size-4" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Severity strip */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="success" className={BADGE_BASE}>
              <Lock className="h-3 w-3" /> {overallPct}% locked
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
              {totalLocked.toLocaleString('en-SG')} of {totalTotal.toLocaleString('en-SG')} sheets
            </span>
            {doneCount > 0 && (
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em]">
                {doneCount} {doneCount === 1 ? 'section' : 'sections'} fully locked
              </span>
            )}
          </div>

          {empty ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              No grading sheets yet for this AY.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              Every section is fully locked.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibleRows.map((r) => (
                <li key={r.sectionName}>
                  <button
                    type="button"
                    onClick={() => setOpenSection(r.sectionName)}
                    className="flex w-full items-center gap-3 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    {/* Section name + level chip */}
                    <div className="w-28 shrink-0 space-y-0.5">
                      <div className="font-medium text-foreground">{r.sectionName}</div>
                      {r.level && (
                        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {r.level}
                        </div>
                      )}
                    </div>

                    {/* Progress meter */}
                    <div className="flex-1 space-y-1">
                      <div className="flex h-2 overflow-hidden rounded-full border border-hairline bg-muted">
                        <div
                          className="h-full bg-gradient-to-r from-brand-mint to-brand-sky"
                          style={{ width: `${r.pctLocked}%` }}
                          aria-hidden
                        />
                        <div
                          className={cn(
                            'h-full',
                            r.open > 0 && r.pctLocked < 50
                              ? 'bg-destructive/70'
                              : r.open > 0
                                ? 'bg-chart-4'
                                : 'bg-transparent',
                          )}
                          style={{ width: `${100 - r.pctLocked}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span>{r.pctLocked}% locked</span>
                        <span className="tabular-nums text-foreground">
                          {r.open} of {r.total} open
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {totalOpen > 0 && rollup.length > visibleRows.length + doneCount && (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {rollup.length - visibleRows.length - doneCount} more {rollup.length - visibleRows.length - doneCount === 1 ? 'section' : 'sections'} below the cutoff —
              click any row to drill.
            </p>
          )}
        </CardContent>
      </Card>
      {openSection && (
        <MarkbookDrillSheet
          target="sheet-readiness-section"
          segment={openSection}
          ayCode={ayCode}
          initialScope="ay"
          initialSheets={sheets}
        />
      )}
    </Sheet>
  );
}
