'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AnnualLetterInput } from '@/components/grading/annual-letter-input';
import type {
  MasterfilePayload,
  MasterfileStudentRow,
  MasterfileSubjectRow,
} from '@/lib/markbook/masterfile';
import type { OverallAwardLabel } from '@/lib/compute/awards';
import { cn } from '@/lib/utils';
import { resolveNonExaminableLetter } from '@/lib/compute/letter-grade';

// HFSE Masterfile grid (KD #95). Wide cross-subject roster mirroring the
// AY2025 Final Report Book Masterfile sheet.
//
// Column model (per row):
//   Fixed left:  S/N · Student · Section · FCA · Status
//   Subjects:    examinable subjects (T1/T2/T3/T4 · Overall · Award)
//                followed by non-examinable (T1/T2/T3/T4 · Final — registrar
//                enters year-end letter via an inline input per KD #95)
//   Right tail:  General Average · Overall Award · Attendance per term + total
//
// The grid is intentionally simple HTML <table> with horizontal scroll —
// not the unified <DataTable> shell — because the column set is dynamic per
// level and varies by examinable/non-examinable, which doesn't map onto the
// shell's static column-def shape. Precedent: attendance wide-grid.

type AwardFilter = OverallAwardLabel | 'all';
type StatusFilter = 'all' | 'active' | 'late_enrollee' | 'withdrawn';

export function MasterfileGrid({ payload }: { payload: MasterfilePayload }) {
  const [awardFilter, setAwardFilter] = useState<AwardFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [nameSearch, setNameSearch] = useState('');

  const examinableSubjects = useMemo(
    () => payload.subjects.filter((s) => s.isExaminable),
    [payload.subjects]
  );
  const nonExaminableSubjects = useMemo(
    () => payload.subjects.filter((s) => !s.isExaminable),
    [payload.subjects]
  );

  const goldCount = useMemo(
    () => payload.rows.filter((r) => r.overallAward === 'Gold').length,
    [payload.rows]
  );
  const silverCount = useMemo(
    () => payload.rows.filter((r) => r.overallAward === 'Silver').length,
    [payload.rows]
  );
  const bronzeCount = useMemo(
    () => payload.rows.filter((r) => r.overallAward === 'Bronze').length,
    [payload.rows]
  );
  const neCount = useMemo(
    () =>
      payload.rows.filter(
        (r) =>
          r.overallAward === 'Not eligible for Overall Award' ||
          r.overallAward == null
      ).length,
    [payload.rows]
  );

  const filteredRows = useMemo(() => {
    let rows = payload.rows;
    if (awardFilter !== 'all') {
      if (awardFilter === 'Not eligible for Overall Award') {
        rows = rows.filter(
          (r) =>
            r.overallAward === 'Not eligible for Overall Award' ||
            r.overallAward == null
        );
      } else {
        rows = rows.filter((r) => r.overallAward === awardFilter);
      }
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        rows = rows.filter(
          (r) =>
            r.enrollmentStatus !== 'withdrawn' &&
            r.enrollmentStatus !== 'late_enrollee'
        );
      } else {
        rows = rows.filter((r) => r.enrollmentStatus === statusFilter);
      }
    }
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.fullName ?? '').toLowerCase().includes(q) ||
          r.studentNumber.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [payload.rows, awardFilter, statusFilter, nameSearch]);

  const activeCount = useMemo(
    () =>
      payload.rows.filter(
        (r) =>
          r.enrollmentStatus !== 'withdrawn' &&
          r.enrollmentStatus !== 'late_enrollee'
      ).length,
    [payload.rows]
  );
  const lateCount = useMemo(
    () =>
      payload.rows.filter((r) => r.enrollmentStatus === 'late_enrollee').length,
    [payload.rows]
  );
  const withdrawnCount = useMemo(
    () => payload.rows.filter((r) => r.enrollmentStatus === 'withdrawn').length,
    [payload.rows]
  );

  if (payload.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        No students in this view yet. Pick a different class or check that the
        roster has been synced.
      </div>
    );
  }

  return (
    <TooltipProvider>
      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        {/* Name search */}
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search by name or student no."
            className="h-8 pl-8 pr-7 text-xs"
          />
          {nameSearch && (
            <button
              onClick={() => setNameSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Award chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Award:
          </span>
          <AwardFilterChip
            label="All"
            count={payload.rows.length}
            active={awardFilter === 'all'}
            onClick={() => setAwardFilter('all')}
            colorClass="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground"
          />
          <AwardFilterChip
            label="Gold"
            count={goldCount}
            active={awardFilter === 'Gold'}
            onClick={() => setAwardFilter('Gold')}
            colorClass="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white"
          />
          <AwardFilterChip
            label="Silver"
            count={silverCount}
            active={awardFilter === 'Silver'}
            onClick={() => setAwardFilter('Silver')}
            colorClass="bg-gradient-to-b from-brand-sky to-brand-indigo text-white"
          />
          <AwardFilterChip
            label="Bronze"
            count={bronzeCount}
            active={awardFilter === 'Bronze'}
            onClick={() => setAwardFilter('Bronze')}
            colorClass="bg-gradient-to-b from-brand-mint to-brand-mint/70 text-white"
          />
          <AwardFilterChip
            label="Not eligible"
            count={neCount}
            active={awardFilter === 'Not eligible for Overall Award'}
            onClick={() => setAwardFilter('Not eligible for Overall Award')}
            colorClass="bg-gradient-to-b from-muted-foreground to-muted-foreground/80 text-white"
          />
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Status:
          </span>
          <AwardFilterChip
            label="All"
            count={payload.rows.length}
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            colorClass="bg-gradient-to-b from-primary to-primary/80 text-primary-foreground"
          />
          <AwardFilterChip
            label="Active"
            count={activeCount}
            active={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            colorClass="bg-gradient-to-b from-brand-mint to-brand-mint/80 text-white"
          />
          <AwardFilterChip
            label="Late Enrolment"
            count={lateCount}
            active={statusFilter === 'late_enrollee'}
            onClick={() => setStatusFilter('late_enrollee')}
            colorClass="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white"
          />
          {withdrawnCount > 0 && (
            <AwardFilterChip
              label="Withdrawn"
              count={withdrawnCount}
              active={statusFilter === 'withdrawn'}
              onClick={() => setStatusFilter('withdrawn')}
              colorClass="bg-gradient-to-b from-muted-foreground to-muted-foreground/80 text-white"
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          {/* Two-row header — first row is subject groupings, second is per-term sub-headers */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                S/N
              </th>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Student
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Section
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Form Class Adviser
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Status
              </th>

              {examinableSubjects.map((sub) => (
                <th
                  key={sub.id}
                  colSpan={6}
                  className="border-b border-r border-border bg-primary/5 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
                >
                  {sub.name}
                </th>
              ))}

              {nonExaminableSubjects.map((sub) => (
                <th
                  key={sub.id}
                  colSpan={5}
                  className="border-b border-r border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {sub.name}
                </th>
              ))}

              <th
                colSpan={2}
                className="border-b border-r border-border bg-primary/10 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
              >
                Overall Award
              </th>

              <th
                colSpan={4}
                className="border-b border-r border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Attendance per term
              </th>
              <th
                colSpan={3}
                className="border-b border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Attendance total
              </th>
            </tr>

            <tr>
              {examinableSubjects.map((sub) =>
                payload.terms
                  .map((t) => (
                    <th
                      key={`${sub.id}-${t.id}`}
                      className="border-b border-r border-border bg-primary/5 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      T{t.termNumber}
                    </th>
                  ))
                  .concat(
                    <th
                      key={`${sub.id}-overall`}
                      className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground"
                    >
                      Overall
                    </th>,
                    <th
                      key={`${sub.id}-award`}
                      className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground"
                    >
                      Award
                    </th>
                  )
              )}
              {nonExaminableSubjects.map((sub) => [
                ...payload.terms.map((t) => (
                  <th
                    key={`${sub.id}-${t.id}`}
                    className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    T{t.termNumber}
                  </th>
                )),
                <th
                  key={`${sub.id}-final`}
                  className="border-b border-r border-border bg-muted/50 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground"
                >
                  Final
                </th>,
              ])}
              <th className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">
                G.A.
              </th>
              <th className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">
                Award
              </th>
              {payload.terms.map((t) => (
                <th
                  key={`att-${t.id}`}
                  className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  T{t.termNumber}
                </th>
              ))}
              <th className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Days
              </th>
              <th className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Present
              </th>
              <th className="border-b border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Late
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row, idx) => (
              <StudentRowView
                key={row.studentId}
                row={row}
                index={idx + 1}
                examinableSubjects={examinableSubjects}
                nonExaminableSubjects={nonExaminableSubjects}
                termsCount={payload.terms.length}
              />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={999}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No students match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

function AwardFilterChip({
  label,
  count,
  active,
  onClick,
  colorClass,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all',
        active
          ? colorClass
          : 'border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-px font-mono text-[10px]',
          active ? 'bg-white/20' : 'bg-muted'
        )}
      >
        {count}
      </span>
    </button>
  );
}

const StudentRowView = memo(function StudentRowView({
  row,
  index,
  examinableSubjects,
  nonExaminableSubjects,
  termsCount,
}: {
  row: MasterfileStudentRow;
  index: number;
  examinableSubjects: Array<{ id: string }>;
  nonExaminableSubjects: Array<{ id: string }>;
  termsCount: number;
}) {
  const isWithdrawn = row.enrollmentStatus === 'withdrawn';
  const subjectRowById = useMemo(() => {
    const m = new Map<string, MasterfileSubjectRow>();
    for (const sr of row.subjectRows) m.set(sr.subjectId, sr);
    return m;
  }, [row.subjectRows]);

  const baseCellClass = cn(
    'border-b border-r border-border px-2 py-1.5 text-center text-sm tabular-nums',
    isWithdrawn && 'text-muted-foreground/70'
  );
  const fixedCellClass = cn(
    'border-b border-r border-border px-3 py-2 text-sm',
    isWithdrawn && 'text-muted-foreground/70'
  );

  const statusLabel =
    row.enrollmentStatus === 'late_enrollee'
      ? 'Late Enrolment'
      : row.enrollmentStatus === 'withdrawn'
        ? 'Withdrawn'
        : 'Active';

  return (
    <tr className={cn(isWithdrawn && 'bg-muted/20')}>
      <td className={fixedCellClass}>{index}</td>
      <td className={cn(fixedCellClass, 'sticky left-0 z-[1] bg-card')}>
        <Link
          href={`/records/students/${encodeURIComponent(row.studentNumber)}`}
          className="font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4"
        >
          {row.fullName || row.studentNumber}
        </Link>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {row.studentNumber}
        </div>
      </td>
      <td className={fixedCellClass}>{row.sectionName}</td>
      <td className={cn(fixedCellClass, 'text-muted-foreground')}>
        {row.formClassAdviser ?? '—'}
      </td>
      <td className={fixedCellClass}>
        <StatusPill status={row.enrollmentStatus} label={statusLabel} />
      </td>

      {/* Examinable subjects: T1-T4 + Overall + Award */}
      {examinableSubjects.map((sub) => {
        const sr = subjectRowById.get(sub.id);
        if (!sr) {
          return (
            <td
              key={sub.id}
              colSpan={termsCount + 2}
              className={cn(baseCellClass, 'text-muted-foreground')}
            >
              —
            </td>
          );
        }
        return (
          <ExaminableSubjectCells
            key={sub.id}
            subjectRow={sr}
            cellClass={baseCellClass}
            isWithdrawn={isWithdrawn}
          />
        );
      })}

      {/* Non-examinable subjects: T1-T4 letter cells + Final input */}
      {nonExaminableSubjects.map((sub) => {
        const sr = subjectRowById.get(sub.id);
        if (!sr) {
          return (
            <td
              key={sub.id}
              colSpan={termsCount + 1}
              className={cn(baseCellClass, 'text-muted-foreground')}
            >
              —
            </td>
          );
        }
        return [
          ...sr.cells.map((cell, ci) => (
            <td
              key={`${sub.id}-${ci}`}
              className={cn(baseCellClass, 'bg-muted/10')}
            >
              <NonExaminableCell
                letter={cell.letter}
                isNa={cell.isNa}
                quarterly={cell.quarterly}
              />
            </td>
          )),
          <td
            key={`${sub.id}-final`}
            className={cn(baseCellClass, 'bg-muted/20 p-1')}
          >
            {sr.annualLetterSheetId && sr.annualLetterEntryId ? (
              <AnnualLetterInput
                sheetId={sr.annualLetterSheetId}
                entryId={sr.annualLetterEntryId}
                initialValue={sr.annualLetter}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-muted-foreground">—</span>
                </TooltipTrigger>
                <TooltipContent>
                  No T4 entry — the T4 grading sheet may not exist yet.
                </TooltipContent>
              </Tooltip>
            )}
          </td>,
        ];
      })}

      {/* Overall Academic Award */}
      <td className={cn(baseCellClass, 'bg-primary/5 font-medium')}>
        {row.generalAverage != null ? row.generalAverage.toFixed(1) : '—'}
      </td>
      <td className={cn(baseCellClass, 'bg-primary/5')}>
        <OverallAwardBadge label={row.overallAward} />
      </td>

      {/* Attendance per term */}
      {row.attendanceByTerm.map((cell) => (
        <td
          key={cell.termId}
          className={cn(baseCellClass, 'text-muted-foreground')}
        >
          {cell.present != null && cell.schoolDays != null
            ? `${cell.present}/${cell.schoolDays}`
            : '—'}
        </td>
      ))}

      {/* Attendance total */}
      <td className={cn(baseCellClass, 'text-muted-foreground')}>
        {row.attendanceTotal.schoolDays || '—'}
      </td>
      <td className={cn(baseCellClass, 'text-muted-foreground')}>
        {row.attendanceTotal.present || '—'}
      </td>
      <td className={cn(baseCellClass, 'text-muted-foreground')}>
        {row.attendanceTotal.late || '—'}
      </td>
    </tr>
  );
});

function ExaminableSubjectCells({
  subjectRow,
  cellClass,
  isWithdrawn,
}: {
  subjectRow: MasterfileSubjectRow;
  cellClass: string;
  isWithdrawn: boolean;
}) {
  return (
    <>
      {subjectRow.cells.map((cell, ci) => (
        <td key={ci} className={cellClass}>
          {cell.isNa ? (
            <span className="font-mono text-[11px] uppercase text-muted-foreground">
              N.A.
            </span>
          ) : cell.quarterly != null ? (
            <span className={cn('font-medium', isWithdrawn && 'font-normal')}>
              {cell.quarterly}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      ))}
      <td className={cn(cellClass, 'bg-primary/5 font-medium')}>
        {subjectRow.overall != null ? subjectRow.overall.toFixed(2) : '—'}
      </td>
      <td className={cn(cellClass, 'bg-primary/5')}>
        <SubjectAwardBadge label={subjectRow.award} />
      </td>
    </>
  );
}

function NonExaminableCell({
  letter,
  isNa,
  quarterly,
}: {
  letter: string | null;
  isNa: boolean;
  quarterly: number | null;
}) {
  const resolved = resolveNonExaminableLetter({
    isNa,
    letterOverride: letter,
    quarterly,
  });
  if (resolved === 'NA') {
    return (
      <span className="font-mono text-[11px] uppercase text-muted-foreground">
        N.A.
      </span>
    );
  }
  if (resolved) {
    return <span className="font-medium">{resolved}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function SubjectAwardBadge({
  label,
}: {
  label: MasterfileSubjectRow['award'];
}) {
  if (label == null) return <span className="text-muted-foreground">—</span>;
  if (label === 'Gold')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white"
      >
        Gold
      </Badge>
    );
  if (label === 'Silver')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-sky to-brand-indigo text-white"
      >
        Silver
      </Badge>
    );
  if (label === 'Bronze')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-mint to-brand-mint/70 text-white"
      >
        Bronze
      </Badge>
    );
  return <Badge variant="muted">Not eligible</Badge>;
}

function OverallAwardBadge({
  label,
}: {
  label: MasterfileStudentRow['overallAward'];
}) {
  if (label == null) return <span className="text-muted-foreground">—</span>;
  if (label === 'Gold')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white"
      >
        Gold
      </Badge>
    );
  if (label === 'Silver')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-sky to-brand-indigo text-white"
      >
        Silver
      </Badge>
    );
  if (label === 'Bronze')
    return (
      <Badge
        variant="default"
        className="bg-gradient-to-b from-brand-mint to-brand-mint/70 text-white"
      >
        Bronze
      </Badge>
    );
  return (
    <Badge variant="muted" className="text-muted-foreground">
      Not eligible
    </Badge>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  if (status === 'withdrawn') {
    return (
      <Badge variant="muted" className="text-muted-foreground">
        {label}
      </Badge>
    );
  }
  if (status === 'late_enrollee') {
    return <Badge variant="warning">{label}</Badge>;
  }
  return <Badge variant="success">{label}</Badge>;
}
