import Link from 'next/link';
import { ArrowUpRight, CalendarCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getSectionAttendanceSummary } from '@/lib/attendance/queries';

// Compact attendance rollup card for /markbook/sections/[id]. Reads
// `attendance_records` (shared rollup target, KD #47) and deep-links into
// the Attendance module for editing. Never writes.
export async function SectionAttendanceSummary({
  sectionId,
  termId,
  termLabel,
}: {
  sectionId: string;
  termId: string;
  termLabel: string | null;
}) {
  const summary = await getSectionAttendanceSummary(sectionId, termId);
  const today = todayIso();

  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Attendance · {termLabel ?? 'Current term'}
          </CardDescription>
          <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-foreground">
            {summary.averageAttendancePct != null
              ? `${summary.averageAttendancePct.toFixed(1)}% average`
              : 'No data yet'}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Read-only. Daily marks happen in the Attendance module.
          </p>
        </div>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <CalendarCheck className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          <Stat label="School days" value={summary.schoolDays} />
          <Stat
            label="Present"
            value={summary.totalDaysPresent}
            tone="default"
          />
          <Stat label="Late" value={summary.totalDaysLate} tone="warn" />
          <Stat label="Excused" value={summary.totalDaysExcused} tone="info" />
          <Stat label="Absent" value={summary.totalDaysAbsent} tone="warn" />
          <Stat
            label="Perfect"
            value={summary.perfectAttendanceCount}
            tone="default"
            suffix={` / ${summary.studentCount}`}
          />
          <div className="ml-auto">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/attendance/${sectionId}?date=${today}`}>
                Mark attendance
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  suffix,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warn' | 'info';
  suffix?: string;
}) {
  const color =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-200'
      : tone === 'info'
        ? 'text-sky-700 dark:text-sky-200'
        : 'text-foreground';
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-serif text-[20px] font-semibold tabular-nums ${color}`}
      >
        {value.toLocaleString('en-SG')}
        {suffix && (
          <span className="ml-1 text-[13px] font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
