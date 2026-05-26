"use client";

import { CheckCircle2, Eye, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "../ui/scroll-area";
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

export type SlotMeta = {
  label?: string | null;
  date?: string | null;
  page?: string | null;
};

export type SlotLabels = {
  ww?: (SlotMeta | null)[];
  pt?: (SlotMeta | null)[];
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
  /** Teacher-authored activity metadata per column. */
  slotLabels?: SlotLabels;
  /** SOW-sourced labels — used as fallback in the "View activities" dialog when slot_labels haven't been synced yet. */
  sowLabels?: { ww: SlotMeta[]; pt: SlotMeta[] };
  /** Subject weights as decimals (e.g. 0.40 for 40%). Used to compute WS columns. */
  wwWeight: number;
  ptWeight: number;
  qaWeight: number;
  /** When true, renders the Quarterly column as a derived letter (non-examinable subjects). */
  letterDisplay?: boolean;
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
  sowLabels,
  wwWeight,
  ptWeight,
  qaWeight,
  letterDisplay = false,
}: Props) {
  const [rows, setRows] = useState<GradeRow[]>(initialRows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<GridFilters>(DEFAULT_GRID_FILTERS);
  const { requireChangeReference, dialog: approvalDialog } = useChangeReference();

  // Slot labels — managed locally, PATCHed on blur.
  const [labels, setLabels] = useState<Required<SlotLabels>>({
    ww: slotLabels?.ww ?? [],
    pt: slotLabels?.pt ?? [],
    qa: slotLabels?.qa ?? null,
  });

  const locked = readOnly && !requireApproval;

  const wwLen = wwTotals.length;
  const ptLen = ptTotals.length;

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

  // Total column count for empty-state colspan.
  // # + Student | WW slots + (Total PS WS) | PT slots + (Total PS WS) | QA (Exam PS WS) | Initial | Quarterly | N/A
  const totalCols =
    2 + (wwLen + 3) + (ptLen > 0 ? ptLen + 3 : 0) + 3 + 1 + 1 + 1;

  const wwPct = Math.round(wwWeight * 100);
  const ptPct = Math.round(ptWeight * 100);
  const qaPct = Math.round(qaWeight * 100);
  const wwMaxTotal = wwTotals.reduce((a, b) => a + b, 0);
  const ptMaxTotal = ptTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <ScoringGuide
        wwTotals={wwTotals}
        ptTotals={ptTotals}
        labels={labels}
        sowLabels={sowLabels}
      />
      <GridFilterToolbar filters={filters} onChange={setFilters} total={rows.length} visible={visibleRows.length} />

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            {/* Row 1 — group headers */}
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead rowSpan={3} className="sticky left-0 z-10 bg-muted/60 align-bottom text-right text-xs">
                #
              </TableHead>
              <TableHead rowSpan={3} className="sticky left-8 z-10 bg-muted/60 align-bottom text-xs">
                Student
              </TableHead>
              {wwLen > 0 && (
                <TableHead
                  colSpan={wwLen + 3}
                  className="border-r border-border/40 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Written Works ({wwPct}%)
                </TableHead>
              )}
              {ptLen > 0 && (
                <TableHead
                  colSpan={ptLen + 3}
                  className="border-r border-border/40 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Performance Tasks ({ptPct}%)
                </TableHead>
              )}
              <TableHead
                colSpan={3}
                className="border-r border-border/40 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quarterly Assessment ({qaPct}%)
              </TableHead>
              <TableHead rowSpan={3} className="align-bottom text-right text-xs">
                Initial<br />Grade
              </TableHead>
              <TableHead rowSpan={3} className="align-bottom text-right text-xs">
                Quarterly<br />Grade
              </TableHead>
              <TableHead rowSpan={3} className="align-bottom text-center text-xs">
                N/A
              </TableHead>
            </TableRow>

            {/* Row 2 — column labels */}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {wwTotals.map((_, i) => (
                <TableHead key={`ww-lbl-${i}`} className="text-center text-xs">
                  W{i + 1}
                </TableHead>
              ))}
              <TableHead className="text-center text-[10px] text-muted-foreground">Total</TableHead>
              <TableHead className="text-center text-[10px] text-muted-foreground">PS</TableHead>
              <TableHead className="border-r border-border/40 text-center text-[10px] text-muted-foreground">WS</TableHead>
              {ptLen > 0 && (
                <>
                  {ptTotals.map((_, i) => (
                    <TableHead key={`pt-lbl-${i}`} className="text-center text-xs">
                      PT{i + 1}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-[10px] text-muted-foreground">Total</TableHead>
                  <TableHead className="text-center text-[10px] text-muted-foreground">PS</TableHead>
                  <TableHead className="border-r border-border/40 text-center text-[10px] text-muted-foreground">WS</TableHead>
                </>
              )}
              <TableHead className="text-center text-xs">Exam</TableHead>
              <TableHead className="text-center text-[10px] text-muted-foreground">PS</TableHead>
              <TableHead className="border-r border-border/40 text-center text-[10px] text-muted-foreground">WS</TableHead>
            </TableRow>

            {/* Row 3 — max values reference row */}
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {wwTotals.map((max, i) => (
                <TableHead key={`ww-max-${i}`} className="text-center font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {max}
                </TableHead>
              ))}
              <TableHead className="text-center font-mono text-[10px] tabular-nums text-muted-foreground/70">{wwMaxTotal}</TableHead>
              <TableHead className="text-center font-mono text-[10px] text-muted-foreground/70">100%</TableHead>
              <TableHead className="border-r border-border/40 text-center font-mono text-[10px] text-muted-foreground/70">{wwPct}%</TableHead>
              {ptLen > 0 && (
                <>
                  {ptTotals.map((max, i) => (
                    <TableHead key={`pt-max-${i}`} className="text-center font-mono text-[10px] tabular-nums text-muted-foreground/70">
                      {max}
                    </TableHead>
                  ))}
                  <TableHead className="text-center font-mono text-[10px] tabular-nums text-muted-foreground/70">{ptMaxTotal}</TableHead>
                  <TableHead className="text-center font-mono text-[10px] text-muted-foreground/70">100%</TableHead>
                  <TableHead className="border-r border-border/40 text-center font-mono text-[10px] text-muted-foreground/70">{ptPct}%</TableHead>
                </>
              )}
              <TableHead className="text-center font-mono text-[10px] tabular-nums text-muted-foreground/70">
                {qaTotal ?? "—"}
              </TableHead>
              <TableHead className="text-center font-mono text-[10px] text-muted-foreground/70">100%</TableHead>
              <TableHead className="border-r border-border/40 text-center font-mono text-[10px] text-muted-foreground/70">{qaPct}%</TableHead>
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

              const wwTotal = sumScores(r.ww_scores, wwLen);
              const ptTotal = sumScores(r.pt_scores, ptLen);
              const wwWs = r.ww_ps != null ? r.ww_ps * wwWeight : null;
              const ptWs = r.pt_ps != null ? r.pt_ps * ptWeight : null;
              const qaWs = r.qa_ps != null ? r.qa_ps * qaWeight : null;

              return (
                <TableRow key={r.entry_id} className={rowClass}>
                  <TableCell className="sticky left-0 z-10 bg-card text-right tabular-nums text-xs">{r.index_number}</TableCell>
                  <TableCell className="sticky left-8 z-10 bg-card">
                    <div className={r.withdrawn ? "whitespace-nowrap text-sm line-through" : "whitespace-nowrap text-sm"}>
                      {r.student_name}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">{r.student_number}</div>
                    {r.late_enrollee && !r.withdrawn && (
                      <div
                        className="mt-0.5 text-[10px] italic text-brand-amber"
                        title="Earlier assessments stay blank and are excluded from the average — proration is automatic.">
                        Late enrollee
                      </div>
                    )}
                  </TableCell>

                  {wwTotals.map((max, i) => (
                    <TableCell key={`ww-${i}`} className="px-1 py-1">
                      <ScoreInput
                        value={r.ww_scores[i] ?? null}
                        max={max}
                        plaintext={locked}
                        disabled={inputsDisabled}
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
                  <ComputedCell value={wwTotal} dp={0} />
                  <ComputedCell value={r.ww_ps} />
                  <ComputedCell value={wwWs} border />

                  {ptLen > 0 && (
                    <>
                      {ptTotals.map((max, i) => (
                        <TableCell key={`pt-${i}`} className="px-1 py-1">
                          <ScoreInput
                            value={r.pt_scores[i] ?? null}
                            max={max}
                            plaintext={locked}
                            disabled={inputsDisabled}
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
                      <ComputedCell value={ptTotal} dp={0} />
                      <ComputedCell value={r.pt_ps} />
                      <ComputedCell value={ptWs} border />
                    </>
                  )}

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
                  <ComputedCell value={r.qa_ps} />
                  <ComputedCell value={qaWs} border />

                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
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

function ScoringGuide({
  wwTotals,
  ptTotals,
  labels,
  sowLabels,
}: {
  wwTotals: number[];
  ptTotals: number[];
  labels: Required<SlotLabels>;
  sowLabels?: { ww: SlotMeta[]; pt: SlotMeta[] };
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasSlots = wwTotals.length > 0 || ptTotals.length > 0;

  // Prefer the grading-sheet label (slot_labels) if already synced; fall back
  // to the SOW label so the dialog shows activity names even before sync.
  const effectiveWw = (i: number): SlotMeta | null => {
    const sl = labels.ww[i] ?? null;
    if (sl?.label) return sl;
    return sowLabels?.ww[i] ?? null;
  };
  const effectivePt = (i: number): SlotMeta | null => {
    const sl = labels.pt[i] ?? null;
    if (sl?.label) return sl;
    return sowLabels?.pt[i] ?? null;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
          {wwTotals.map((max, i) => (
            <SlotChip key={`ww-${i}`} code={`W${i + 1}`} max={max} meta={effectiveWw(i)} />
          ))}
          {wwTotals.length > 0 && ptTotals.length > 0 && <span className="select-none text-border/60">·</span>}
          {ptTotals.map((max, i) => (
            <SlotChip key={`pt-${i}`} code={`PT${i + 1}`} max={max} meta={effectivePt(i)} />
          ))}
          {hasSlots && <span className="select-none text-border/60">·</span>}
          <SlotChip code="QA" fixedLabel="Exam" />
        </div>
        {hasSlots && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <Eye className="h-3 w-3" />
            View activities
          </button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[min(600px,80vh)] flex-col  sm:max-w-2xl!">
          <ScrollArea className="flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
              <DialogDescription>
                Activity metadata for each scored column.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 pt-6">
              {wwTotals.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Written Work</h3>
                  <div className="space-y-2">
                    {wwTotals.map((max, i) => (
                      <SlotDetailRow key={`ww-${i}`} code={`W${i + 1}`} max={max} meta={effectiveWw(i)} />
                    ))}
                  </div>
                </section>
              )}
              {ptTotals.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Performance Task
                  </h3>
                  <div className="space-y-2">
                    {ptTotals.map((max, i) => (
                      <SlotDetailRow key={`pt-${i}`} code={`PT${i + 1}`} max={max} meta={effectivePt(i)} />
                    ))}
                  </div>
                </section>
              )}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quarterly Assessment
                </h3>
                <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-mint" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">QA — Exam</div>
                    <div className="text-xs text-muted-foreground">Label is fixed for all sheets</div>
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatChipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

function SlotChip({
  code,
  max,
  meta,
  fixedLabel,
}: {
  code: string;
  max?: number;
  meta?: SlotMeta | null;
  fixedLabel?: string;
}) {
  const hasLabel = !!meta?.label || !!fixedLabel;
  const hasDate = !!meta?.date;
  const done = hasLabel && (hasDate || !!fixedLabel);
  const partial = hasLabel && !hasDate && !fixedLabel;

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${
        done
          ? "border-border bg-muted/60 text-foreground"
          : partial
            ? "border-dashed border-border/50 text-muted-foreground/70"
            : "border-dashed border-border/50 text-muted-foreground/60"
      }`}>
      <span className="font-semibold">{code}</span>
      {max != null && <span className="text-[9px] opacity-50">/{max}</span>}
      {hasLabel && (
        <span className={`ml-0.5 font-sans font-normal italic text-muted-foreground`}>{fixedLabel ?? meta?.label}</span>
      )}
      {hasDate && meta?.date && (
        <span className="ml-0.5 font-sans font-normal text-muted-foreground/70">· {formatChipDate(meta.date)}</span>
      )}
      {meta?.page && <span className="ml-0.5 font-sans font-normal text-muted-foreground/60">· {meta.page}</span>}
    </span>
  );
}

function SlotDetailRow({ code, max, meta }: { code: string; max: number; meta: SlotMeta | null }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2">
      <div className="flex h-7 w-12 shrink-0 items-center justify-center rounded border border-border bg-muted/50 font-mono text-xs font-semibold text-ink">
        {code}
        <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">/{max}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-sm text-foreground">
          {meta?.label ?? <span className="italic text-muted-foreground">No label set</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {meta?.date && <span>{formatChipDate(meta.date)}</span>}
          {meta?.page && <span>p. {meta.page}</span>}
          {!meta?.date && !meta?.page && <span className="italic">No date or page set</span>}
        </div>
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

function sumScores(scores: (number | null)[], len: number): number | null {
  const slice = scores.slice(0, len);
  if (slice.every((v) => v === null)) return null;
  return slice.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function ComputedCell({ value, dp = 2, border }: { value: number | null; dp?: number; border?: boolean }) {
  return (
    <TableCell
      className={`px-2 text-right tabular-nums text-xs text-muted-foreground${border ? " border-r border-border/40" : ""}`}>
      {value != null ? value.toFixed(dp) : "—"}
    </TableCell>
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
