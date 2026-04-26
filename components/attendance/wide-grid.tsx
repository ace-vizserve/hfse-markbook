"use client";

import Link from "next/link";

// Attendance wide grid. Rows = students (~30), columns = term school-days
// (~47). Cell count at HFSE scale: ~1,410 per render.
//
// Render-perf invariants — do not regress:
//   1. Each cell uses a NATIVE <select>, not shadcn/Radix Select. Radix
//      Select mounts a Portal per instance; 1,410 portals is catastrophic.
//   2. State lives in a single `cells` Map keyed by `${enrolmentId}|${date}`.
//      Avoid prop-drilling per-cell state — a parent re-render on unrelated
//      state (a new useState added to the parent page, say) cascades into
//      1,410 cell re-renders. The parent today is a pure server component
//      so there's no client state to leak. Keep it that way.
//   3. `columns` and `monthGroups` are `useMemo`'d on (calendar, events).
//      The calendar array identity comes from a server fetch — it only
//      changes on `router.refresh()`. Don't wrap the calendar prop in
//      something that changes reference per render.
//
// If 47 days grows to ~180 (period-level Phase 2), revisit: the grid would
// jump to ~5,400 cells and native selects start to feel sluggish on low-end
// Chromebooks. At that point look at column virtualization (react-window)
// or a paginated-by-week view.

import { Bus, CalendarDays, CheckCircle2, Loader2, Star, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// Local-tz ISO for today. Inline helper — the file doesn't pull from
// lib/attendance/calendar.ts to stay a pure client leaf.
function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CalendarEventRow, SchoolCalendarRow } from "@/lib/attendance/calendar";
import type { DailyEntryRow } from "@/lib/attendance/queries";
import {
  ATTENDANCE_STATUS_LABELS,
  DAY_TYPE_LABELS,
  EX_REASON_LABELS,
  isEncodableDayType,
  type AttendanceStatus,
  type DayType,
  type ExReason,
} from "@/lib/schemas/attendance";

// Column header + cell tinting by day_type. Matches the calendar admin
// legend (see components/attendance/calendar-admin-client.tsx DAY_TYPE_STYLES).
// Scaled down for the dense 1,410-cell grid — lower opacity than the
// month view so the status letter stays readable.
const DAY_TYPE_HEADER_BG: Record<DayType, string> = {
  school_day: "bg-muted/60 text-foreground",
  public_holiday: "bg-destructive/10 text-destructive",
  school_holiday: "bg-brand-amber/15 text-brand-amber",
  hbl: "bg-primary/10 text-primary",
  no_class: "bg-muted/40 text-muted-foreground",
};
const DAY_TYPE_CELL_BG: Record<DayType, string> = {
  school_day: "",
  public_holiday: "bg-destructive/5",
  school_holiday: "bg-brand-amber/5",
  hbl: "bg-primary/5",
  no_class: "bg-muted/20",
};

export type WideGridEnrolment = {
  enrolmentId: string;
  indexNumber: number;
  studentNumber: string;
  studentName: string;
  busNo: string | null;
  classroomOfficerRole: string | null;
  withdrawn: boolean;
  compassionateUsed: number;
  compassionateAllowance: number;
};

// Dropdown option value shape: "P" | "L" | "EX:mc" | "EX:compassionate" |
// "EX:school_activity" | "A" | "NC" | "" (unmarked)
type OptionValue = "" | "P" | "L" | "EX:mc" | "EX:compassionate" | "EX:school_activity" | "A" | "NC";

const TEACHER_OPTIONS: Array<{ value: OptionValue; label: string }> = [
  { value: "", label: "—" },
  { value: "P", label: "P · Present" },
  { value: "L", label: "L · Late" },
  { value: "EX:mc", label: "EX · MC" },
  { value: "EX:compassionate", label: "EX · Compassionate" },
  { value: "EX:school_activity", label: "EX · School activity" },
  { value: "A", label: "A · Absent" },
];

const REGISTRAR_OPTIONS: Array<{ value: OptionValue; label: string }> = [
  ...TEACHER_OPTIONS,
  { value: "NC", label: "NC · No class" },
];

function decodeOption(value: OptionValue): { status: AttendanceStatus; exReason: ExReason | null } | null {
  if (!value) return null;
  if (value.startsWith("EX:")) {
    return { status: "EX", exReason: value.slice(3) as ExReason };
  }
  return { status: value as AttendanceStatus, exReason: null };
}

function encodeOption(status: AttendanceStatus | null, exReason: ExReason | null): OptionValue {
  if (status == null) return "";
  if (status === "EX") return `EX:${exReason ?? "mc"}` as OptionValue;
  return status;
}

function statusColor(status: AttendanceStatus | null): string {
  switch (status) {
    case "P":
      return "bg-brand-mint/40 text-ink";
    case "L":
      return "bg-brand-amber-light text-ink";
    case "EX":
      return "bg-primary/10 text-primary";
    case "A":
      return "bg-destructive/15 text-destructive";
    case "NC":
      return "bg-muted/60 text-muted-foreground";
    default:
      return "bg-transparent text-muted-foreground";
  }
}

type CellState = {
  status: AttendanceStatus | null;
  exReason: ExReason | null;
  saving: boolean;
  savedAt: number | null;
};

type GridKey = string; // `${enrolmentId}|${date}`

function keyFor(enrolmentId: string, date: string): GridKey {
  return `${enrolmentId}|${date}`;
}

export function AttendanceWideGrid({
  sectionId,
  termId,
  enrolments,
  calendar,
  events,
  initialDaily,
  canWriteNc,
}: {
  sectionId: string;
  termId: string;
  enrolments: WideGridEnrolment[];
  calendar: SchoolCalendarRow[];
  events: CalendarEventRow[];
  initialDaily: DailyEntryRow[];
  canWriteNc: boolean;
}) {
  // Seed cell state map from the latest-per-(date) rows we already fetched.
  const seed = useMemo(() => {
    const m = new Map<GridKey, CellState>();
    for (const r of initialDaily) {
      const k = keyFor(r.sectionStudentId, r.date);
      // initialDaily is filtered to latest-per-key by the query already.
      m.set(k, {
        status: r.status,
        exReason: r.exReason,
        saving: false,
        savedAt: null,
      });
    }
    return m;
  }, [initialDaily]);

  const [cells, setCells] = useState<Map<GridKey, CellState>>(() => new Map(seed));

  function updateCell(k: GridKey, patch: Partial<CellState>) {
    setCells((current) => {
      const next = new Map(current);
      const prev = next.get(k) ?? { status: null, exReason: null, saving: false, savedAt: null };
      next.set(k, { ...prev, ...patch });
      return next;
    });
  }

  async function writeCell(enrolmentId: string, date: string, status: AttendanceStatus, exReason: ExReason | null) {
    void sectionId; // reserved: future bulk endpoint may use it
    const k = keyFor(enrolmentId, date);
    const prev = cells.get(k) ?? { status: null, exReason: null, saving: false, savedAt: null };
    updateCell(k, { status, exReason, saving: true });
    try {
      const res = await fetch("/api/attendance/daily", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sectionStudentId: enrolmentId,
          termId,
          date,
          status,
          exReason,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "save failed");
      updateCell(k, { saving: false, savedAt: Date.now() });
      setTimeout(() => {
        setCells((current) => {
          const c = current.get(k);
          if (!c || !c.savedAt || Date.now() - c.savedAt < 1400) return current;
          const next = new Map(current);
          next.set(k, { ...c, savedAt: null });
          return next;
        });
      }, 1500);
    } catch (e) {
      updateCell(k, { status: prev.status, exReason: prev.exReason, saving: false });
      toast.error(`Could not save: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  // Today's column — ref + ISO captured once at mount so the auto-scroll
  // effect fires exactly once. On a date change (registrar leaves the tab
  // open past midnight) the ref still points at yesterday's column; not
  // worth complicating for that edge case.
  const todayIso = useMemo(() => todayLocalIso(), []);
  const todayHeaderRef = useRef<HTMLTableCellElement | null>(null);
  useEffect(() => {
    todayHeaderRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, []);

  // Calendar columns in order; each flagged with day_type + event labels.
  // `drawMonthBoundary` is true for month-starts EXCEPT the first column —
  // the first column already has the roster pane's right border as its
  // visual boundary.
  const columns = useMemo(() => {
    const evBy = (iso: string) => events.filter((e) => iso >= e.startDate && iso <= e.endDate);
    let prevMonth = "";
    return calendar.map((c, idx) => {
      const monthKey = c.date.slice(0, 7);
      const isMonthStart = monthKey !== prevMonth;
      prevMonth = monthKey;
      return {
        iso: c.date,
        dayType: c.dayType,
        encodable: isEncodableDayType(c.dayType),
        label: c.label,
        events: evBy(c.date),
        drawMonthBoundary: isMonthStart && idx > 0,
      };
    });
  }, [calendar, events]);

  // Group by month for banner rows.
  const monthGroups = useMemo(() => {
    const groups: Array<{ month: string; label: string; dates: typeof columns }> = [];
    for (const col of columns) {
      const key = col.iso.slice(0, 7);
      let g = groups[groups.length - 1];
      if (!g || g.month !== key) {
        const [y, m] = key.split("-");
        const d = new Date(Number(y), Number(m) - 1, 1);
        g = {
          month: key,
          label: d.toLocaleDateString("en-SG", { month: "short", year: "numeric" }),
          dates: [],
        };
        groups.push(g);
      }
      g.dates.push(col);
    }
    return groups;
  }, [columns]);

  const options = canWriteNc ? REGISTRAR_OPTIONS : TEACHER_OPTIONS;

  if (columns.length === 0) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <CardTitle className="font-serif">No calendar configured</CardTitle>
          <CardDescription className="mx-auto max-w-md">
            Attendance can&apos;t be recorded until the registrar configures the school calendar for this term. Seed the
            weekdays to start encoding.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/sis/calendar">Open School Calendar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Row heights locked so the roster pane and calendar pane stay aligned
  // vertically. Both panes use identical <tr style={{height}}> values.
  const ROW_HEIGHT = { monthBanner: 28, dateRow: 48, body: 40 };

  return (
    <div className="space-y-3">
      <Card className="p-0 overflow-hidden">
        {enrolments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Users className="size-5" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">No students enrolled in this section yet.</p>
          </div>
        ) : (
          // Two-pane flex layout — roster on the left (fixed width, no
          // horizontal scroll), calendar on the right (scrolls horizontally
          // independently). Replaces the legacy single-table sticky-column
          // design which had browser bugs with position: sticky inside
          // border-collapse tables, causing the first date to be covered
          // by the last sticky roster column. Two tables, row heights
          // locked, alignment is deterministic.
          <div className="flex">
            {/* ─── Roster pane — fixed width, no horizontal scroll ─── */}
            <div className="shrink-0 border-r border-border">
              <Table noWrapper className="border-separate border-spacing-0 text-[11px]">
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col style={{ width: 180 }} />
                </colgroup>
                <TableHeader>
                  <TableRow style={{ height: ROW_HEIGHT.monthBanner }} className="hover:bg-transparent">
                    <TableHead
                      colSpan={2}
                      className="h-auto border-b border-border bg-muted/60 px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Roster
                    </TableHead>
                  </TableRow>
                  <TableRow style={{ height: ROW_HEIGHT.dateRow }} className="hover:bg-transparent">
                    <TableHead className="h-auto border-b border-r border-border bg-muted/60 px-1 py-1 text-right font-mono text-[10px] font-semibold text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead className="h-auto border-b border-border bg-muted/60 px-2 py-1 text-left font-mono text-[10px] font-semibold text-muted-foreground">
                      Student
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrolments.map((e) => (
                    <TableRow
                      key={e.enrolmentId}
                      style={{ height: ROW_HEIGHT.body }}
                      className={
                        e.withdrawn
                          ? "bg-muted/10 text-muted-foreground hover:bg-muted/10"
                          : "odd:bg-muted/[0.04] hover:bg-muted/20"
                      }>
                      <TableCell className="overflow-hidden border-r border-border px-1 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {e.indexNumber}
                      </TableCell>
                      <TableCell className="overflow-hidden px-2 py-1">
                        <div
                          className={
                            "truncate text-[12px] font-medium " + (e.withdrawn ? "line-through" : "text-foreground")
                          }
                          title={e.studentName}>
                          {e.studentName}
                        </div>
                        <div className="flex items-center gap-1.5 truncate font-mono text-[10px] text-muted-foreground">
                          <span>{e.studentNumber}</span>
                          {e.busNo && (
                            <Badge
                              variant="secondary"
                              className="gap-0.5 border-0 px-1.5 py-0 text-[10px] font-normal shadow-none"
                              title="Bus number">
                              <Bus aria-hidden /> {e.busNo}
                            </Badge>
                          )}
                          {e.classroomOfficerRole && (
                            <Badge
                              variant="secondary"
                              className="gap-0.5 border-0 px-1.5 py-0 text-[10px] font-normal shadow-none"
                              title="Classroom officer">
                              <Star aria-hidden /> {e.classroomOfficerRole}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* ─── Calendar pane — scrolls horizontally ─── */}
            <div className="flex-1 overflow-x-auto">
              <Table noWrapper className="border-separate border-spacing-0 table-fixed text-[11px]">
                <colgroup>
                  {columns.map((c) => (
                    <col key={c.iso} style={{ width: 36 }} />
                  ))}
                  <col style={{ width: 40 }} />
                </colgroup>
                <TableHeader>
                  <TableRow style={{ height: ROW_HEIGHT.monthBanner }} className="hover:bg-transparent">
                    {monthGroups.map((g) => (
                      <TableHead
                        key={g.month}
                        colSpan={g.dates.length}
                        className="h-auto border-b border-r border-border bg-muted/60 px-2 py-1.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {g.label}
                      </TableHead>
                    ))}
                    <TableHead className="h-auto border-b border-border bg-muted/60 p-0" />
                  </TableRow>
                  <TableRow style={{ height: ROW_HEIGHT.dateRow }} className="hover:bg-transparent">
                    {columns.map((c) => {
                      const weekday = new Date(
                        Number(c.iso.slice(0, 4)),
                        Number(c.iso.slice(5, 7)) - 1,
                        Number(c.iso.slice(8, 10)),
                      ).toLocaleDateString("en-SG", { weekday: "short" });
                      const eventLabel = c.events.map((e) => e.label).join(" · ");
                      const dayTypeTitle = `${DAY_TYPE_LABELS[c.dayType]}${
                        c.label ? ` · ${c.label}` : ""
                      }${eventLabel ? ` · ${eventLabel}` : ""}`;
                      const isToday = c.iso === todayIso;
                      return (
                        <TableHead
                          key={c.iso}
                          ref={isToday ? todayHeaderRef : undefined}
                          title={isToday ? `Today · ${dayTypeTitle}` : dayTypeTitle}
                          className={
                            "h-auto overflow-hidden border-b border-border px-1 py-1 text-center font-mono text-[10px] font-semibold " +
                            DAY_TYPE_HEADER_BG[c.dayType] +
                            (c.drawMonthBoundary ? " border-l-2 border-l-border" : "") +
                            (isToday ? " relative ring-2 ring-inset ring-brand-indigo" : "")
                          }>
                          <div className="leading-tight">{c.iso.slice(-2)}</div>
                          <div className="text-[9px] font-normal opacity-70">{weekday.slice(0, 3)}</div>
                          {c.dayType === "hbl" && (
                            <div className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-wider">HBL</div>
                          )}
                          {c.events.length > 0 && (
                            <div className="mt-0.5 truncate text-[9px] font-normal text-primary">★</div>
                          )}
                        </TableHead>
                      );
                    })}
                    <TableHead className="h-auto border-b border-border bg-muted/60 p-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrolments.map((e) => (
                    <TableRow
                      key={e.enrolmentId}
                      style={{ height: ROW_HEIGHT.body }}
                      className={
                        e.withdrawn
                          ? "bg-muted/10 text-muted-foreground hover:bg-muted/10"
                          : "odd:bg-muted/[0.04] hover:bg-muted/20"
                      }>
                      {columns.map((c) => {
                        const cell = cells.get(keyFor(e.enrolmentId, c.iso));
                        const status = cell?.status ?? null;
                        const exReason = cell?.exReason ?? null;
                        const currentValue = encodeOption(status, exReason);
                        const disabled = e.withdrawn || !c.encodable;

                        return (
                          <TableCell
                            key={c.iso}
                            className={
                              "overflow-hidden p-0 text-center align-middle " +
                              DAY_TYPE_CELL_BG[c.dayType] +
                              (c.drawMonthBoundary ? " border-l-2 border-l-border" : "")
                            }>
                            {!c.encodable ? (
                              <span
                                className="block px-1 py-1 text-[10px] text-muted-foreground"
                                title={`${DAY_TYPE_LABELS[c.dayType]}${c.label ? ` · ${c.label}` : ""}`}>
                                —
                              </span>
                            ) : (
                              <div className={"relative " + statusColor(status)}>
                                <select
                                  value={currentValue}
                                  disabled={disabled}
                                  onChange={(ev) => {
                                    const decoded = decodeOption(ev.target.value as OptionValue);
                                    if (!decoded) return;
                                    void writeCell(e.enrolmentId, c.iso, decoded.status, decoded.exReason);
                                  }}
                                  className="w-full appearance-none bg-transparent px-1 py-1 text-center font-mono text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                                  title={
                                    status
                                      ? `${ATTENDANCE_STATUS_LABELS[status]}${
                                          status === "EX" && exReason ? ` · ${EX_REASON_LABELS[exReason]}` : ""
                                        }`
                                      : "Unmarked"
                                  }>
                                  {options.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.value === ""
                                        ? "—"
                                        : o.value.startsWith("EX:")
                                          ? `E${o.value.slice(3, 4).toUpperCase()}`
                                          : o.value}
                                    </option>
                                  ))}
                                </select>
                                {cell?.saving && (
                                  <Loader2 className="absolute right-0 top-0 size-2.5 animate-spin text-muted-foreground" />
                                )}
                                {cell?.savedAt && (
                                  <CheckCircle2 className="absolute right-0 top-0 size-2.5 text-primary" />
                                )}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="bg-background p-0" />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      {/* Legend */}
      <Card className="p-4 text-xs text-muted-foreground">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-indigo-deep">
          Status · cell colour
        </p>
        {/* Legend swatches use the same statusColor() the grid cells use,
            so this is a true visual key — what you see here is exactly what
            appears in the grid. Status letters mirror the dropdown values
            (P / L / EX / A / NC); EX collapses the three sub-reasons since
            they share one cell colour. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-foreground">
          <StatusLegendItem status="P" description="Present" />
          <StatusLegendItem status="L" description="Late" />
          <StatusLegendItem
            status="EX"
            description="Excused"
            sub="MC / Compassionate / School activity"
          />
          <StatusLegendItem status="A" description="Absent" />
          {canWriteNc && <StatusLegendItem status="NC" description="No class" />}
        </div>
        <p className="mt-3 mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-indigo-deep">
          Calendar · column tint
        </p>
        {/* Day-type swatches mirror DAY_TYPE_HEADER_BG so the chip's tint
            matches the column header tint exactly — a true visual key, same
            craft as the status row above. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-foreground">
          <DayTypeLegendItem dayType="school_day" />
          <DayTypeLegendItem dayType="public_holiday" />
          <DayTypeLegendItem dayType="school_holiday" />
          <DayTypeLegendItem dayType="hbl" sub="Encodable" />
          <DayTypeLegendItem dayType="no_class" />
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Dropdown shows EX · MC / EX · Compassionate / EX · School activity.
          <span className="ml-2">★ marks dates with a calendar event.</span>
        </p>
      </Card>
    </div>
  );
}

// Status chip + label used in the Legend card. Renders the status letter
// inside a colored square sized to match the grid's visual weight so the
// legend reads as a true key ("this is what P looks like in the grid"),
// not a washed-out colored dot. The swatch's colors come from the same
// statusColor() the grid cells use — single source of truth, per the
// "true visual key" rule in docs/context/09a-design-patterns.md §10.
function StatusLegendItem({
  status,
  description,
  sub,
}: {
  status: AttendanceStatus;
  description: string;
  sub?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={
          "inline-flex size-7 items-center justify-center rounded-md font-mono text-[12px] font-semibold shadow-input " +
          statusColor(status)
        }
        aria-hidden
      >
        {status}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[12px] font-medium text-foreground">{description}</span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}

// Day-type chip + label, sibling to StatusLegendItem. The swatch's tint
// is pulled from the same DAY_TYPE_HEADER_BG map the grid uses for column
// headers, so the legend reads as a true visual key ("this is what a
// public-holiday column looks like in the grid"). Single source of truth
// for the day-type → tint mapping; no duplicate ChartLegendChip palette.
// Same "true visual key" rule as StatusLegendItem — see
// docs/context/09a-design-patterns.md §10.
function DayTypeLegendItem({
  dayType,
  sub,
}: {
  dayType: DayType;
  sub?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={
          "inline-flex size-7 items-center justify-center rounded-md shadow-input " +
          DAY_TYPE_HEADER_BG[dayType]
        }
        aria-hidden
      />
      <span className="flex flex-col leading-tight">
        <span className="text-[12px] font-medium text-foreground">
          {DAY_TYPE_LABELS[dayType]}
        </span>
        {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}
