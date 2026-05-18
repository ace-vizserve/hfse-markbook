"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MasterfilePayload, MasterfileStudentRow, MasterfileSubjectRow } from "@/lib/markbook/masterfile";
import { cn } from "@/lib/utils";

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

export function MasterfileGrid({ payload }: { payload: MasterfilePayload }) {
  const examinableSubjects = useMemo(
    () => payload.subjects.filter((s) => s.isExaminable),
    [payload.subjects],
  );
  const nonExaminableSubjects = useMemo(
    () => payload.subjects.filter((s) => !s.isExaminable),
    [payload.subjects],
  );

  if (payload.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        No students in this view yet. Pick a different class or check that the roster has been synced.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          {/* Two-row header — first row is subject groupings, second is per-term sub-headers */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                S/N
              </th>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Student
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Section
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Form Class Adviser
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border bg-card px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </th>

              {examinableSubjects.map((sub) => (
                <th
                  key={sub.id}
                  colSpan={6}
                  className="border-b border-r border-border bg-primary/5 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                  {sub.name}
                </th>
              ))}

              {nonExaminableSubjects.map((sub) => (
                <th
                  key={sub.id}
                  colSpan={5}
                  className="border-b border-r border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {sub.name}
                </th>
              ))}

              <th
                colSpan={2}
                className="border-b border-r border-border bg-primary/10 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                Overall Award
              </th>

              <th
                colSpan={4}
                className="border-b border-r border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Attendance per term
              </th>
              <th
                colSpan={3}
                className="border-b border-border bg-muted/30 px-2 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Attendance total
              </th>
            </tr>

            <tr>
              {examinableSubjects.map((sub) =>
                payload.terms
                  .map((t) => (
                    <th
                      key={`${sub.id}-${t.id}`}
                      className="border-b border-r border-border bg-primary/5 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      T{t.termNumber}
                    </th>
                  ))
                  .concat(
                    <th
                      key={`${sub.id}-overall`}
                      className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">
                      Overall
                    </th>,
                    <th
                      key={`${sub.id}-award`}
                      className="border-b border-r border-border bg-primary/10 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">
                      Award
                    </th>,
                  ),
              )}
              {nonExaminableSubjects.map((sub) => [
                ...payload.terms.map((t) => (
                  <th
                    key={`${sub.id}-${t.id}`}
                    className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    T{t.termNumber}
                  </th>
                )),
                <th
                  key={`${sub.id}-final`}
                  className="border-b border-r border-border bg-muted/50 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-foreground">
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
                  className="border-b border-r border-border bg-muted/30 px-2 py-1 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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
            {payload.rows.map((row, idx) => (
              <StudentRowView
                key={row.studentId}
                row={row}
                index={idx + 1}
                examinableSubjects={examinableSubjects}
                nonExaminableSubjects={nonExaminableSubjects}
                termsCount={payload.terms.length}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
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
  const isWithdrawn = row.enrollmentStatus === "withdrawn";
  const subjectRowById = useMemo(() => {
    const m = new Map<string, MasterfileSubjectRow>();
    for (const sr of row.subjectRows) m.set(sr.subjectId, sr);
    return m;
  }, [row.subjectRows]);

  const baseCellClass = cn(
    "border-b border-r border-border px-2 py-1.5 text-center text-sm tabular-nums",
    isWithdrawn && "text-muted-foreground/70",
  );
  const fixedCellClass = cn(
    "border-b border-r border-border px-3 py-2 text-sm",
    isWithdrawn && "text-muted-foreground/70",
  );

  const statusLabel =
    row.enrollmentStatus === "late_enrollee"
      ? "Late Enrolment"
      : row.enrollmentStatus === "withdrawn"
        ? "Withdrawn"
        : "Active";

  return (
    <tr className={cn(isWithdrawn && "bg-muted/20")}>
      <td className={fixedCellClass}>{index}</td>
      <td className={cn(fixedCellClass, "sticky left-0 z-[1] bg-card")}>
        <Link
          href={`/records/students/${encodeURIComponent(row.studentNumber)}`}
          className="font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4">
          {row.fullName || row.studentNumber}
        </Link>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {row.studentNumber}
        </div>
      </td>
      <td className={fixedCellClass}>{row.sectionName}</td>
      <td className={cn(fixedCellClass, "text-muted-foreground")}>{row.formClassAdviser ?? "—"}</td>
      <td className={fixedCellClass}>
        <StatusPill status={row.enrollmentStatus} label={statusLabel} />
      </td>

      {/* Examinable subjects: T1-T4 + Overall + Award */}
      {examinableSubjects.map((sub) => {
        const sr = subjectRowById.get(sub.id);
        if (!sr) {
          return (
            <td key={sub.id} colSpan={termsCount + 2} className={cn(baseCellClass, "text-muted-foreground")}>
              —
            </td>
          );
        }
        return (
          <ExaminableSubjectCells key={sub.id} subjectRow={sr} cellClass={baseCellClass} isWithdrawn={isWithdrawn} />
        );
      })}

      {/* Non-examinable subjects: T1-T4 letter cells + Final input */}
      {nonExaminableSubjects.map((sub) => {
        const sr = subjectRowById.get(sub.id);
        if (!sr) {
          return (
            <td key={sub.id} colSpan={termsCount + 1} className={cn(baseCellClass, "text-muted-foreground")}>
              —
            </td>
          );
        }
        return [
          ...sr.cells.map((cell, ci) => (
            <td key={`${sub.id}-${ci}`} className={cn(baseCellClass, "bg-muted/10")}>
              <NonExaminableCell letter={cell.letter} isNa={cell.isNa} />
            </td>
          )),
          <td key={`${sub.id}-final`} className={cn(baseCellClass, "bg-muted/20 p-1")}>
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
                <TooltipContent>No T4 entry — the T4 grading sheet may not exist yet.</TooltipContent>
              </Tooltip>
            )}
          </td>,
        ];
      })}

      {/* Overall Academic Award */}
      <td className={cn(baseCellClass, "bg-primary/5 font-medium")}>
        {row.generalAverage != null ? row.generalAverage.toFixed(1) : "—"}
      </td>
      <td className={cn(baseCellClass, "bg-primary/5")}>
        <OverallAwardBadge label={row.overallAward} />
      </td>

      {/* Attendance per term */}
      {row.attendanceByTerm.map((cell) => (
        <td key={cell.termId} className={cn(baseCellClass, "text-muted-foreground")}>
          {cell.present != null && cell.schoolDays != null ? `${cell.present}/${cell.schoolDays}` : "—"}
        </td>
      ))}

      {/* Attendance total */}
      <td className={cn(baseCellClass, "text-muted-foreground")}>{row.attendanceTotal.schoolDays || "—"}</td>
      <td className={cn(baseCellClass, "text-muted-foreground")}>{row.attendanceTotal.present || "—"}</td>
      <td className={cn(baseCellClass, "text-muted-foreground")}>{row.attendanceTotal.late || "—"}</td>
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
            <span className="font-mono text-[11px] uppercase text-muted-foreground">N.A.</span>
          ) : cell.quarterly != null ? (
            <span className={cn("font-medium", isWithdrawn && "font-normal")}>{cell.quarterly}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      ))}
      <td className={cn(cellClass, "bg-primary/5 font-medium")}>
        {subjectRow.overall != null ? subjectRow.overall.toFixed(2) : "—"}
      </td>
      <td className={cn(cellClass, "bg-primary/5")}>
        <SubjectAwardBadge label={subjectRow.award} />
      </td>
    </>
  );
}

function NonExaminableCell({ letter, isNa }: { letter: string | null; isNa: boolean }) {
  if (isNa) {
    return <span className="font-mono text-[11px] uppercase text-muted-foreground">N.A.</span>;
  }
  if (letter) {
    return <span className="font-medium">{letter}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function AnnualLetterInput({
  sheetId,
  entryId,
  initialValue,
}: {
  sheetId: string;
  entryId: string;
  initialValue: string | null;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saved, setSaved] = useState(initialValue ?? "");

  async function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === saved.trim()) return;
    try {
      const res = await fetch(
        `/api/grading-sheets/${sheetId}/entries/${entryId}/annual-letter`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ annual_letter_grade: trimmed || null }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string })?.error ?? "Failed to save");
        setValue(saved);
        return;
      }
      setSaved(trimmed);
    } catch {
      toast.error("Failed to save");
      setValue(saved);
    }
  }

  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      placeholder="—"
      className="h-7 w-16 text-center font-mono text-[11px] tabular-nums"
    />
  );
}

function SubjectAwardBadge({ label }: { label: MasterfileSubjectRow["award"] }) {
  if (label == null) return <span className="text-muted-foreground">—</span>;
  if (label === "Gold")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white">
        Gold
      </Badge>
    );
  if (label === "Silver")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-sky to-brand-indigo text-white">
        Silver
      </Badge>
    );
  if (label === "Bronze")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-mint to-brand-mint/70 text-white">
        Bronze
      </Badge>
    );
  return <Badge variant="muted">Not eligible</Badge>;
}

function OverallAwardBadge({ label }: { label: MasterfileStudentRow["overallAward"] }) {
  if (label == null) return <span className="text-muted-foreground">—</span>;
  if (label === "Gold")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-amber to-brand-amber/80 text-white">
        Gold
      </Badge>
    );
  if (label === "Silver")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-sky to-brand-indigo text-white">
        Silver
      </Badge>
    );
  if (label === "Bronze")
    return (
      <Badge variant="default" className="bg-gradient-to-b from-brand-mint to-brand-mint/70 text-white">
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
  if (status === "withdrawn") {
    return (
      <Badge variant="muted" className="text-muted-foreground">
        {label}
      </Badge>
    );
  }
  if (status === "late_enrollee") {
    return <Badge variant="warning">{label}</Badge>;
  }
  return <Badge variant="success">{label}</Badge>;
}
