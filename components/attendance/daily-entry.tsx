'use client';

import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { SchoolCalendarRow } from '@/lib/attendance/calendar';
import type { DailyEntryRow } from '@/lib/attendance/queries';
import type { WideGridEnrolment } from '@/components/attendance/wide-grid';
import {
  computeSubmitEntries,
  encodableDates,
  loadedMarksForDate,
  pickDefaultDate,
  tally,
  type DailyMark,
} from '@/lib/attendance/daily-entry';
import { EX_REASON_LABELS, type ExReason } from '@/lib/schemas/attendance';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const STATUS_BTN: Record<
  'P' | 'L' | 'A' | 'EX',
  { label: string; on: string }
> = {
  P: {
    label: 'P',
    on: 'bg-gradient-to-b from-brand-mint to-brand-sky text-ink shadow-xs',
  },
  L: {
    label: 'L',
    on: 'bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white shadow-xs',
  },
  A: {
    label: 'A',
    on: 'bg-gradient-to-b from-destructive to-destructive/80 text-white shadow-xs',
  },
  EX: {
    label: 'EX',
    on: 'bg-gradient-to-b from-brand-indigo to-brand-navy text-white shadow-xs',
  },
};
const EX_REASONS: ExReason[] = [
  'mc',
  'compassionate',
  'school_activity',
  'vacation',
];

// Day-summary stat cards — status gradient tiles (§9.3 palette). The number
// is `text-foreground`; the tile carries the colour (matches the page's
// term-level StatCard treatment).
const DAY_STAT: Array<{
  key: 'P' | 'L' | 'A' | 'EX';
  label: string;
  icon: LucideIcon;
  tile: string;
}> = [
  {
    key: 'P',
    label: 'Present',
    icon: CircleCheck,
    tile: 'from-brand-mint to-brand-sky text-ink shadow-brand-tile-mint',
  },
  {
    key: 'L',
    label: 'Late',
    icon: Clock,
    tile: 'from-brand-amber to-brand-amber/80 text-white shadow-brand-tile-amber',
  },
  {
    key: 'A',
    label: 'Absent',
    icon: CircleX,
    tile: 'from-destructive to-destructive/80 text-white shadow-brand-tile-destructive',
  },
  {
    key: 'EX',
    label: 'Excused',
    icon: FileText,
    tile: 'from-brand-indigo to-brand-navy text-white shadow-brand-tile',
  },
];

// ── Parent: owns the selected date + stepper. Delegates marking to a keyed
//    <DailyPanel> child so its mark state re-seeds when the date changes.
export function DailyEntry({
  sectionId,
  termId,
  enrolments,
  calendar,
  initialDaily,
}: {
  sectionId: string;
  termId: string;
  enrolments: WideGridEnrolment[];
  calendar: SchoolCalendarRow[];
  initialDaily: DailyEntryRow[];
}) {
  void sectionId; // not needed for the write (the bulk endpoint keys on sectionStudentId)

  const dates = useMemo(() => encodableDates(calendar), [calendar]);
  const [date, setDate] = useState<string | null>(() =>
    pickDefaultDate(dates, todayLocalIso())
  );

  // Roster shown for marking: active + late-enrollees (withdrawn excluded).
  const roster = useMemo(
    () => enrolments.filter((e) => !e.withdrawn),
    [enrolments]
  );

  const idx = date ? dates.indexOf(date) : -1;
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < dates.length - 1;
  function step(delta: number) {
    if (idx < 0) return;
    const nd = dates[idx + delta];
    if (nd) setDate(nd);
  }

  // Empty state — no encodable day to mark, or no students.
  if (!date || roster.length === 0) {
    return (
      <Card className="items-center gap-2 py-12 text-center">
        <p className="font-serif text-xl font-semibold text-foreground">
          {roster.length === 0
            ? 'No students to mark'
            : 'No school day to mark'}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {roster.length === 0
            ? 'This section has no active students enrolled.'
            : 'There are no encodable school days in this term yet. Configure the school calendar first.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Date stepper */}
      <div className="flex items-center justify-center gap-2 sm:justify-start">
        <Button
          variant="outline"
          size="icon"
          disabled={!canPrev}
          onClick={() => step(-1)}
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-[200px] text-center">
          <p className="font-serif text-lg font-semibold leading-tight text-foreground">
            {formatLongDate(date)}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {date}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          disabled={!canNext}
          onClick={() => step(1)}
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Keyed child — remounts on date change so `marks` re-seeds from the
          new date's on-file marks. */}
      <DailyPanel
        key={date}
        date={date}
        termId={termId}
        roster={roster}
        initialDaily={initialDaily}
      />
    </div>
  );
}

// ── Child: owns the per-date mark state, tally, and submit. Mounted with
//    key={date} by the parent, so useState re-seeds whenever the date changes.
function DailyPanel({
  date,
  termId,
  roster,
  initialDaily,
}: {
  date: string;
  termId: string;
  roster: WideGridEnrolment[];
  initialDaily: DailyEntryRow[];
}) {
  const router = useRouter();

  const loaded = useMemo(
    () => loadedMarksForDate(initialDaily, date),
    [initialDaily, date]
  );
  const [marks, setMarks] = useState<Map<string, DailyMark>>(
    () => new Map(loaded)
  );
  const [saving, setSaving] = useState(false);

  function setMark(enrolmentId: string, m: DailyMark | null) {
    setMarks((cur) => {
      const next = new Map(cur);
      if (m) next.set(enrolmentId, m);
      else next.delete(enrolmentId);
      return next;
    });
  }

  const counts = tally({ roster, marks, date });
  const exMissingReason = [...marks.values()].some(
    (m) => m.status === 'EX' && !m.exReason
  );

  async function submit() {
    const entries = computeSubmitEntries({
      roster,
      marks,
      loaded,
      termId,
      date,
    });
    if (entries.length === 0) {
      toast.info('No changes to submit.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/attendance/daily', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      toast.success(
        `Saved attendance for ${formatLongDate(date)} (${entries.length} updated).`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Day summary cards */}
      <div className="@container/day">
        <div className="grid grid-cols-2 gap-3 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @lg/day:grid-cols-4">
          {DAY_STAT.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.key}>
                <CardHeader>
                  <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                    {s.label}
                  </CardDescription>
                  <CardTitle className="font-serif text-[28px] font-semibold leading-none tabular-nums text-foreground">
                    {counts[s.key]}
                  </CardTitle>
                  <CardAction>
                    <div
                      className={`flex size-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.tile}`}
                    >
                      <Icon className="size-4" />
                    </div>
                  </CardAction>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">
        {counts.unmarked} unmarked → will be saved as Present
      </p>

      {/* Roster */}
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {roster.map((e) => {
            const beforeJoin = !!e.enrollmentDate && e.enrollmentDate > date;
            const m = marks.get(e.enrolmentId);
            const active: 'P' | 'L' | 'A' | 'EX' = m
              ? m.status === 'NC'
                ? 'P'
                : m.status
              : 'P';
            return (
              <li
                key={e.enrolmentId}
                className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  beforeJoin ? 'bg-muted/40 opacity-40' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
                    {e.indexNumber}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {e.studentName}
                  </span>
                </div>

                {beforeJoin ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Before enrolment date
                  </span>
                ) : (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="inline-flex overflow-hidden rounded-lg border border-border">
                      {(['P', 'L', 'A', 'EX'] as const).map((s) => {
                        const isOn = active === s && (m != null || s === 'P');
                        const explicit =
                          m != null &&
                          (m.status === s || (s === 'P' && m.status === 'P'));
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={isOn}
                            onClick={() =>
                              setMark(
                                e.enrolmentId,
                                s === 'EX'
                                  ? {
                                      status: 'EX',
                                      exReason: m?.exReason ?? null,
                                    }
                                  : { status: s, exReason: null }
                              )
                            }
                            className={`w-11 py-1.5 text-center font-mono text-xs font-semibold transition-colors ${
                              isOn && explicit
                                ? STATUS_BTN[s].on
                                : 'text-muted-foreground hover:bg-muted/60'
                            } ${active === s && !explicit ? 'text-foreground' : ''}`}
                          >
                            {STATUS_BTN[s].label}
                          </button>
                        );
                      })}
                    </div>
                    {m?.status === 'EX' && (
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {EX_REASONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              setMark(e.enrolmentId, {
                                status: 'EX',
                                exReason: r,
                              })
                            }
                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              m.exReason === r
                                ? 'bg-brand-indigo text-white'
                                : 'border border-border text-muted-foreground hover:bg-muted/60'
                            }`}
                          >
                            {EX_REASON_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Submit bar */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
        <p className="text-xs text-muted-foreground">
          {exMissingReason
            ? 'Choose a reason for each Excused student to submit.'
            : `${counts.P + counts.unmarked} present · ${counts.L + counts.A + counts.EX} exceptions`}
        </p>
        <Button onClick={submit} disabled={saving || exMissingReason}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Submit attendance
        </Button>
      </div>
    </div>
  );
}
