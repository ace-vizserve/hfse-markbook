import type { SchoolCalendarRow } from '@/lib/attendance/calendar';
import type { DailyEntryRow } from '@/lib/attendance/queries';
import type { WideGridEnrolment } from '@/components/attendance/wide-grid';
import {
  isEncodableDayType,
  type AttendanceStatus,
  type ExReason,
} from '@/lib/schemas/attendance';

// A single student's mark for the day being edited.
export type DailyMark = { status: AttendanceStatus; exReason: ExReason | null };

// One entry in the bulk PATCH /api/attendance/daily payload.
export type SubmitEntry = {
  sectionStudentId: string;
  termId: string;
  date: string;
  status: AttendanceStatus;
  exReason?: ExReason;
};

/** Encodable school-day dates for the term, ascending. */
export function encodableDates(calendar: SchoolCalendarRow[]): string[] {
  return calendar
    .filter((c) => isEncodableDayType(c.dayType, c.hblOverlay))
    .map((c) => c.date)
    .sort();
}

/**
 * Default date to open the view on. `today` is a yyyy-MM-dd string.
 * - today, if encodable
 * - else the nearest encodable day before today
 * - else the first encodable day (today precedes all)
 * - null if there are no encodable days
 */
export function pickDefaultDate(
  encodable: string[],
  today: string
): string | null {
  if (encodable.length === 0) return null;
  if (encodable.includes(today)) return today;
  const before = encodable.filter((d) => d < today);
  if (before.length > 0) return before[before.length - 1];
  return encodable[0];
}

/** Latest mark per student for `date` (input rows are latest-first per the query). */
export function loadedMarksForDate(
  daily: DailyEntryRow[],
  date: string
): Map<string, DailyMark> {
  const map = new Map<string, DailyMark>();
  for (const r of daily) {
    if (r.date !== date) continue;
    if (map.has(r.sectionStudentId)) continue; // first seen = latest (query order)
    map.set(r.sectionStudentId, { status: r.status, exReason: r.exReason });
  }
  return map;
}

/** Is this student markable on `date`? (active, joined on/before the date). */
function isEligible(e: WideGridEnrolment, date: string): boolean {
  if (e.withdrawn) return false;
  if (e.enrollmentDate && e.enrollmentDate > date) return false;
  return true;
}

function sameMark(a: DailyMark | undefined, b: DailyMark): boolean {
  return a != null && a.status === b.status && a.exReason === b.exReason;
}

/**
 * Mark-the-exceptions write set: every eligible student gets `P` unless the
 * teacher set an explicit mark. Students whose target already matches what's
 * on file are skipped (idempotent re-submit — append-only ledger stays clean).
 */
export function computeSubmitEntries(input: {
  roster: WideGridEnrolment[];
  marks: Map<string, DailyMark>;
  loaded: Map<string, DailyMark>;
  termId: string;
  date: string;
}): SubmitEntry[] {
  const { roster, marks, loaded, termId, date } = input;
  const out: SubmitEntry[] = [];
  for (const e of roster) {
    if (!isEligible(e, date)) continue;
    const target: DailyMark = marks.get(e.enrolmentId) ?? {
      status: 'P',
      exReason: null,
    };
    if (sameMark(loaded.get(e.enrolmentId), target)) continue;
    out.push({
      sectionStudentId: e.enrolmentId,
      termId,
      date,
      status: target.status,
      ...(target.status === 'EX' && target.exReason
        ? { exReason: target.exReason }
        : {}),
    });
  }
  return out;
}

/** Live tally for the header strip. Unmarked = eligible students with no explicit mark. */
export function tally(input: {
  roster: WideGridEnrolment[];
  marks: Map<string, DailyMark>;
  date: string;
}): { P: number; L: number; A: number; EX: number; unmarked: number } {
  const { roster, marks, date } = input;
  const t = { P: 0, L: 0, A: 0, EX: 0, unmarked: 0 };
  for (const e of roster) {
    if (!isEligible(e, date)) continue;
    const m = marks.get(e.enrolmentId);
    if (!m) {
      t.unmarked += 1;
      continue;
    }
    t[m.status === 'NC' ? 'unmarked' : m.status] += 1;
  }
  return t;
}
