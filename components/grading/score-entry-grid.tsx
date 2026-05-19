"use client";

import { AlertTriangle, CheckCircle2, Loader2, Pencil } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_GRID_FILTERS, GridFilterToolbar, type GridFilters } from "./grid-filter-toolbar";
import { useChangeReference, type ChangeReferenceTarget } from "./use-approval-reference";

export type GradeRow = {
  entry_id: string;
  index_number: number;
  student_name: string;
  student_number: string;
  withdrawn: boolean;
  late_enrollee: boolean;
  is_na: boolean;
  ww_scores: (number | null)[];
  pt_scores: (number | null)[];
  qa_score: number | null;
  ww_ps: number | null;
  pt_ps: number | null;
  qa_ps: number | null;
  initial_grade: number | null;
  quarterly_grade: number | null;
  letter_grade: string | null;
};

export type SlotLabels = {
  ww?: (string | null)[];
  pt?: (string | null)[];
  qa?: string | null;
};

type Props = {
  sheetId: string;
  wwTotals: number[];
  ptTotals: number[];
  qaTotal: number | null;
  rows: GradeRow[];
  readOnly?: boolean;
  requireApproval?: boolean;
  /** Teacher-authored activity labels per column, e.g. WW1 → "Group Report". */
  slotLabels?: SlotLabels;
  /** Whether the current user may edit labels (teacher on own sheet, or registrar+). */
  canEditLabels?: boolean;
};

function parseCell(raw: string): number | null {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function displayCell(v: number | null): string {
  return v == null ? "" : String(v);
}

export function ScoreEntryGrid({
  sheetId,
  wwTotals,
  ptTotals,
  qaTotal,
  rows: initialRows,
  readOnly = false,
  requireApproval = false,
  slotLabels,
  canEditLabels = false,
}: Props) {
  const [rows, setRows] = useState<GradeRow[]>(initialRows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<GridFilters>(DEFAULT_GRID_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { requireChangeReference, dialog: approvalDialog } = useChangeReference();

  // Slot labels — managed locally, PATCHed on blur.
  const [labels, setLabels] = useState<Required<SlotLabels>>({
    ww: slotLabels?.ww ?? [],
    pt: slotLabels?.pt ?? [],
    qa: slotLabels?.qa ?? null,
  });

  const saveLabel = useCallback(
    async (type: "ww" | "pt", slotIndex: number, value: string | null) => {
      const trimmed = value?.trim() || null;
      setLabels((prev) => {
        const arr = [...(prev[type] as (string | null)[])];
        arr[slotIndex] = trimmed;
        return { ...prev, [type]: arr };
      });
      try {
        const body: SlotLabels = {};
        const arr = [...((type === "ww" ? labels.ww : labels.pt) as (string | null)[])];
        arr[slotIndex] = trimmed;
        body[type] = arr;
        const res = await fetch(`/api/grading-sheets/${sheetId}/labels`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error((d as { error?: string })?.error ?? "Failed to save label");
        }
      } catch {
        toast.error("Failed to save label");
      }
    },
    [sheetId, labels],
  );

  const locked = readOnly && !requireApproval;

  const wwLen = wwTotals.length;
  const ptLen = ptTotals.length;

  // A score slot is "gated" (locked until labelled) when the sheet is active
  // and the current user has label-editing rights (i.e. they're the teacher or
  // can manage). Read-only viewers and locked sheets are not gated here.
  const gateByLabel = canEditLabels && !readOnly;
  const wwSlotGated = (i: number) => gateByLabel && !labels.ww[i];
  const ptSlotGated = (i: number) => gateByLabel && !labels.pt[i];

  const missingLabelCount =
    (gateByLabel ? wwTotals.filter((_, i) => !labels.ww[i]).length : 0) +
    (gateByLabel ? ptTotals.filter((_, i) => !labels.pt[i]).length : 0);

  const visibleRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.hideWithdrawn && r.withdrawn) return false;
      if (q) {
        const hay = `${r.student_name} ${r.student_number}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.blanksOnly) {
        if (r.withdrawn || r.is_na) return false;
        const hasBlank =
          r.ww_scores.slice(0, wwLen).some((v) => v == null) ||
          r.pt_scores.slice(0, ptLen).some((v) => v == null) ||
          r.qa_score == null;
        if (!hasBlank) return false;
      }
      return true;
    });
  }, [rows, filters, wwLen, ptLen]);

  const patchEntry = useCallback(
    async (
      entryId: string,
      target: Omit<ChangeReferenceTarget, "sheetId" | "entryId">,
      body: Partial<Pick<GradeRow, "ww_scores" | "pt_scores" | "qa_score" | "is_na">>,
    ) => {
      let extraPayload: Record<string, unknown> = {};
      let bodyOverride: Partial<Pick<GradeRow, "ww_scores" | "pt_scores" | "qa_score" | "is_na">> | null = null;
      if (requireApproval) {
        const ref = await requireChangeReference({ sheetId, entryId, ...target });
        if (!ref) return;
        if (ref.mode === "request") {
          extraPayload = {
            change_request_id: ref.change_request_id,
            patch_target: target,
          };
          bodyOverride = approvedValueToPatchBody(
            target.field,
            target.slotIndex ?? null,
            ref.proposed_value,
            rowsRef.current.find((r) => r.entry_id === entryId) ?? null,
            wwTotals.length,
            ptTotals.length,
          );
        } else {
          extraPayload = {
            correction_reason: ref.correction_reason,
            correction_justification: ref.correction_justification,
            patch_target: target,
          };
        }
      }

      setSavingId(entryId);
      try {
        const payload = { ...body, ...(bodyOverride ?? {}), ...extraPayload };
        const res = await fetch(`/api/grading-sheets/${sheetId}/entries/${entryId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          const row = rowsRef.current.find((r) => r.entry_id === entryId);
          toast.error(
            `Failed to save ${row ? `#${row.index_number} ${row.student_name}` : "entry"}: ${data.error ?? "save failed"}`,
          );
          return;
        }
        setRows((current) =>
          current.map((r) =>
            r.entry_id === entryId
              ? {
                  ...r,
                  ww_scores: data.entry.ww_scores ?? r.ww_scores,
                  pt_scores: data.entry.pt_scores ?? r.pt_scores,
                  qa_score: data.entry.qa_score,
                  ww_ps: data.entry.ww_ps,
                  pt_ps: data.entry.pt_ps,
                  qa_ps: data.entry.qa_ps,
                  initial_grade: data.entry.initial_grade,
                  quarterly_grade: data.entry.quarterly_grade,
                  letter_grade: data.entry.letter_grade ?? null,
                  is_na: data.entry.is_na ?? r.is_na,
                }
              : r,
          ),
        );
        if ("change_request_id" in extraPayload) {
          toast.success("Change request applied — teacher will be notified");
        } else if ("correction_reason" in extraPayload) {
          toast.success("Correction logged on activity history");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save entry");
      } finally {
        setSavingId(null);
      }
    },
    [sheetId, requireApproval, requireChangeReference, wwTotals.length, ptTotals.length],
  );

  const updateLocal = useCallback((entryId: string, patch: (row: GradeRow) => GradeRow) => {
    setRows((current) => current.map((r) => (r.entry_id === entryId ? patch(r) : r)));
  }, []);

  // Total column count for empty-state colspan: # + Student + WW + PT + QA + Initial + Quarterly + N/A
  const totalCols = 2 + wwLen + ptLen + 1 + 1 + 1 + 1;

  return (
    <div className="space-y-3">
      <ScoringGuide
        wwTotals={wwTotals}
        ptTotals={ptTotals}
        labels={labels}
        canEditLabels={canEditLabels}
        missingLabelCount={missingLabelCount}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
        onSave={saveLabel}
      />
      <GridFilterToolbar filters={filters} onChange={setFilters} total={rows.length} visible={visibleRows.length} />

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="sticky left-0 z-10 bg-muted/40 text-right">#</TableHead>
              <TableHead className="sticky left-8 z-10 bg-muted/40">Student</TableHead>
              {wwTotals.map((max, i) => {
                const label = labels.ww[i] ?? null;
                return (
                  <TableHead key={`ww-${i}`} className="text-center">
                    <div>
                      W{i + 1}
                      <sup className="ml-0.5 text-muted-foreground">/{max}</sup>
                    </div>
                    {label && (
                      <span className="mt-0.5 block truncate text-center text-[10px] font-normal italic text-muted-foreground">
                        {label}
                      </span>
                    )}
                  </TableHead>
                );
              })}
              {ptTotals.map((max, i) => {
                const label = labels.pt[i] ?? null;
                return (
                  <TableHead key={`pt-${i}`} className="text-center">
                    <div>
                      PT{i + 1}
                      <sup className="ml-0.5 text-muted-foreground">/{max}</sup>
                    </div>
                    {label && (
                      <span className="mt-0.5 block truncate text-center text-[10px] font-normal italic text-muted-foreground">
                        {label}
                      </span>
                    )}
                  </TableHead>
                );
              })}
              <TableHead className="text-center">
                <div>
                  QA
                  {qaTotal != null && <sup className="ml-0.5 text-muted-foreground">/{qaTotal}</sup>}
                </div>
                <span className="mt-0.5 block text-center text-[10px] font-normal italic text-muted-foreground">
                  Exam
                </span>
              </TableHead>
              <TableHead className="text-right">Initial</TableHead>
              <TableHead className="text-right">Quarterly</TableHead>
              <TableHead className="text-center">N/A</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="py-10 text-center text-sm text-muted-foreground">
                  No students match the current filters.
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((r) => {
              const inputsDisabled = r.withdrawn || r.is_na || readOnly;
              const muted = r.withdrawn || r.is_na || readOnly;
              const rowClass = muted ? "text-muted-foreground" : "";
              return (
                <TableRow key={r.entry_id} className={rowClass}>
                  <TableCell className="sticky left-0 z-10 bg-card text-right tabular-nums">{r.index_number}</TableCell>
                  <TableCell className="sticky left-8 z-10 bg-card">
                    <div className={r.withdrawn ? "whitespace-nowrap line-through" : "whitespace-nowrap"}>
                      {r.student_name}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">{r.student_number}</div>
                    {r.late_enrollee && !r.withdrawn && (
                      <div
                        className="mt-0.5 text-[10px] italic text-brand-amber"
                        title="Earlier assessments stay blank and are excluded from the average — proration is automatic.">
                        Late enrollee — earlier assessments excluded
                      </div>
                    )}
                  </TableCell>

                  {wwTotals.map((max, i) => (
                    <TableCell key={`ww-${i}`} className="px-1 py-1">
                      <ScoreInput
                        value={r.ww_scores[i] ?? null}
                        max={max}
                        plaintext={locked}
                        disabled={inputsDisabled || wwSlotGated(i)}
                        onLocalChange={(v) =>
                          updateLocal(r.entry_id, (row) => ({
                            ...row,
                            ww_scores: replaceAt(row.ww_scores, i, v, wwTotals.length),
                          }))
                        }
                        onCommit={(v) => {
                          const next = replaceAt(r.ww_scores, i, v, wwTotals.length);
                          patchEntry(r.entry_id, { field: "ww_scores", slotIndex: i }, { ww_scores: next });
                        }}
                      />
                    </TableCell>
                  ))}

                  {ptTotals.map((max, i) => (
                    <TableCell key={`pt-${i}`} className="px-1 py-1">
                      <ScoreInput
                        value={r.pt_scores[i] ?? null}
                        max={max}
                        plaintext={locked}
                        disabled={inputsDisabled || ptSlotGated(i)}
                        onLocalChange={(v) =>
                          updateLocal(r.entry_id, (row) => ({
                            ...row,
                            pt_scores: replaceAt(row.pt_scores, i, v, ptTotals.length),
                          }))
                        }
                        onCommit={(v) => {
                          const next = replaceAt(r.pt_scores, i, v, ptTotals.length);
                          patchEntry(r.entry_id, { field: "pt_scores", slotIndex: i }, { pt_scores: next });
                        }}
                      />
                    </TableCell>
                  ))}

                  <TableCell className="px-1 py-1">
                    <ScoreInput
                      value={r.qa_score}
                      max={qaTotal}
                      plaintext={locked}
                      disabled={inputsDisabled}
                      onLocalChange={(v) => updateLocal(r.entry_id, (row) => ({ ...row, qa_score: v }))}
                      onCommit={(v) => patchEntry(r.entry_id, { field: "qa_score", slotIndex: null }, { qa_score: v })}
                    />
                  </TableCell>

                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.initial_grade != null ? r.initial_grade.toFixed(2) : "—"}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    <QuarterlyPill value={r.quarterly_grade} muted={muted} />
                  </TableCell>

                  <TableCell className="text-center">
                    <Checkbox
                      checked={r.is_na}
                      disabled={r.withdrawn || readOnly}
                      aria-label="Mark late enrollee N/A"
                      onCheckedChange={(v) => {
                        const next = v === true;
                        updateLocal(r.entry_id, (row) => ({ ...row, is_na: next }));
                        patchEntry(r.entry_id, { field: "is_na", slotIndex: null }, { is_na: next });
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {savingId && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            saving…
          </span>
        )}
      </div>

      {approvalDialog}
    </div>
  );
}

// Unified strip that shows slot label status + grade legend (non-examinable)
// and provides the edit drawer. Replaces the standalone LetterGradeLegend.
function ScoringGuide({
  wwTotals,
  ptTotals,
  labels,
  canEditLabels,
  missingLabelCount,
  drawerOpen,
  onDrawerOpenChange,
  onSave,
}: {
  wwTotals: number[];
  ptTotals: number[];
  labels: Required<SlotLabels>;
  canEditLabels: boolean;
  missingLabelCount: number;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  onSave: (type: "ww" | "pt", slotIndex: number, value: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-3">
      {/* Slot status row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
          {/* WW slots */}
          {wwTotals.map((max, i) => {
            const label = labels.ww[i] ?? null;
            return <SlotChip key={`ww-${i}`} code={`W${i + 1}`} max={max} label={label} />;
          })}
          {wwTotals.length > 0 && ptTotals.length > 0 && <span className="mx-1 text-border">|</span>}
          {/* PT slots */}
          {ptTotals.map((max, i) => {
            const label = labels.pt[i] ?? null;
            return <SlotChip key={`pt-${i}`} code={`PT${i + 1}`} max={max} label={label} />;
          })}
          {(wwTotals.length > 0 || ptTotals.length > 0) && <span className="mx-1 text-border">|</span>}
          {/* QA — always Exam */}
          <SlotChip code="QA" label="Exam" fixed />
        </div>

        {canEditLabels && (
          <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
            <SheetTrigger asChild>
              <Button className="h-7 shrink-0 gap-1.5 px-2 text-xs">
                <Pencil className="h-3 w-3" />
                Edit Labels
                {missingLabelCount > 0 && <Badge variant="secondary">{missingLabelCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-96 sm:w-[440px]">
              <SheetHeader>
                <SheetTitle>Activity Labels</SheetTitle>
                <SheetDescription>
                  Describe each activity column. Slots without a description are disabled until labelled.
                </SheetDescription>
              </SheetHeader>
              <ActivityLabelsForm wwTotals={wwTotals} ptTotals={ptTotals} labels={labels} onSave={onSave} />
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}

function SlotChip({
  code,
  max,
  label,
  fixed = false,
}: {
  code: string;
  max?: number;
  label: string | null;
  fixed?: boolean;
}) {
  const hasLabel = !!label;
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] border ${
        hasLabel || fixed
          ? "border-border bg-muted/60 text-foreground"
          : "border-dashed border-border/50 text-muted-foreground/60"
      }`}>
      <span className="font-semibold">{code}</span>
      {max != null && <span className="text-[9px] text-muted-foreground/50">/{max}</span>}
      {(hasLabel || fixed) && label && (
        <span
          className={`ml-0.5 font-sans font-normal not-italic ${fixed ? "text-muted-foreground" : "italic text-muted-foreground"}`}>
          {label}
        </span>
      )}
    </span>
  );
}

// Side drawer for editing WW and PT activity labels.
function ActivityLabelsForm({
  wwTotals,
  ptTotals,
  labels,
  onSave,
}: {
  wwTotals: number[];
  ptTotals: number[];
  labels: Required<SlotLabels>;
  onSave: (type: "ww" | "pt", slotIndex: number, value: string | null) => void;
}) {
  return (
    <div className="mt-6 space-y-6 overflow-y-auto">
      {wwTotals.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Written Work</h3>
          <div className="space-y-2">
            {wwTotals.map((max, i) => {
              const label = labels.ww[i] ?? null;
              return (
                <LabelRow
                  key={`ww-${i}`}
                  slotName={`W${i + 1}`}
                  maxScore={max}
                  value={label}
                  onSave={(v) => onSave("ww", i, v)}
                />
              );
            })}
          </div>
        </section>
      )}

      {ptTotals.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance Task</h3>
          <div className="space-y-2">
            {ptTotals.map((max, i) => {
              const label = labels.pt[i] ?? null;
              return (
                <LabelRow
                  key={`pt-${i}`}
                  slotName={`PT${i + 1}`}
                  maxScore={max}
                  value={label}
                  onSave={(v) => onSave("pt", i, v)}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quarterly Assessment</h3>
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-mint" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">QA — Exam</div>
            <div className="text-xs text-muted-foreground">Label is fixed for all sheets</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LabelRow({
  slotName,
  maxScore,
  value,
  onSave,
}: {
  slotName: string;
  maxScore: number;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const savedRef = useRef(value ?? "");
  const hasLabel = !!value;

  const commit = () => {
    const trimmed = text.trim() || null;
    const saved = savedRef.current.trim() || null;
    if (trimmed === saved) return;
    savedRef.current = text;
    onSave(trimmed);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded border border-border bg-muted/50 text-xs font-mono font-semibold text-ink">
        {slotName}
        <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">/{maxScore}</span>
      </div>
      <div className="relative flex-1">
        <input
          type="text"
          value={text}
          maxLength={120}
          placeholder="Describe this activity…"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-8 w-full rounded-md border border-input bg-background px-2.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>
      <div className="shrink-0">
        {hasLabel ? (
          <CheckCircle2 className="h-4 w-4 text-brand-mint" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
      </div>
    </div>
  );
}

function QuarterlyPill({ value, muted }: { value: number | null; muted: boolean }) {
  if (value == null) {
    return <span className="text-base font-semibold text-muted-foreground">—</span>;
  }
  if (muted) {
    return <span className="text-base font-semibold tabular-nums text-muted-foreground">{value}</span>;
  }
  const tone =
    value < 75
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : value < 85
        ? "border-hairline bg-muted text-ink"
        : "border-brand-mint bg-brand-mint/30 text-ink";
  return (
    <Badge variant="outline" className={`h-7 justify-end px-2 text-sm font-semibold tabular-nums ${tone}`}>
      {value}
    </Badge>
  );
}

function replaceAt(arr: (number | null)[], i: number, v: number | null, length: number): (number | null)[] {
  const out = new Array<number | null>(length).fill(null);
  for (let k = 0; k < length; k++) out[k] = arr[k] ?? null;
  out[i] = v;
  return out;
}

function approvedValueToPatchBody(
  field: "ww_scores" | "pt_scores" | "qa_score" | "letter_grade" | "is_na",
  slotIndex: number | null,
  proposed: string,
  row: GradeRow | null,
  wwLength: number,
  ptLength: number,
): Partial<Pick<GradeRow, "ww_scores" | "pt_scores" | "qa_score" | "is_na">> | null {
  switch (field) {
    case "ww_scores": {
      if (slotIndex == null || row == null) return null;
      return {
        ww_scores: replaceAt(row.ww_scores, slotIndex, parseCell(proposed), wwLength),
      };
    }
    case "pt_scores": {
      if (slotIndex == null || row == null) return null;
      return {
        pt_scores: replaceAt(row.pt_scores, slotIndex, parseCell(proposed), ptLength),
      };
    }
    case "qa_score":
      return { qa_score: parseCell(proposed) };
    case "is_na":
      return { is_na: proposed.trim().toLowerCase() === "true" };
    default:
      return null;
  }
}

function ScoreInput({
  value,
  max,
  disabled,
  plaintext,
  onLocalChange,
  onCommit,
}: {
  value: number | null;
  max?: number | null;
  disabled?: boolean;
  plaintext?: boolean;
  onLocalChange: (v: number | null) => void;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState<string>(displayCell(value));

  if (plaintext) {
    return (
      <span className="inline-block h-8 w-14 px-1.5 py-1 text-right text-sm tabular-nums text-ink">
        {displayCell(value) || "—"}
      </span>
    );
  }

  const parsed = parseCell(text);
  const isExceeded = parsed != null && max != null && parsed > max;

  return (
    <input
      type="number"
      inputMode="decimal"
      disabled={disabled}
      aria-invalid={isExceeded || undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onLocalChange(parseCell(e.target.value));
      }}
      onBlur={() => {
        onCommit(parseCell(text));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="h-8 w-14 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive/5 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/20"
    />
  );
}
