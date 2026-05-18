"use client";

import {
  ArrowRight,
  CalendarIcon,
  Download,
  History,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { type ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DataTable } from "@/components/ui/data-table";
import { type FacetConfig } from "@/components/ui/data-table/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IdentifierLink } from "@/components/ui/identifier-link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortableHeader } from "@/components/ui/data-table/sortable-header";
import { cn } from "@/lib/utils";

export type MergedRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  context: Record<string, unknown>;
  sheet_id: string | null;
  source: "audit_log" | "grade_audit_log";
};

type PaginationInfo = {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
};

type Props = {
  rows: MergedRow[];
  initialSheetIdFilter?: string | null;
  initialActionFilter?: string | null;
  canExport?: boolean;
  pagination?: PaginationInfo;
};

function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function endOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(23, 59, 59, 999);
  return n;
}

const FACETS: FacetConfig[] = [
  { columnId: "action", label: "Action" },
  { columnId: "actor", label: "Actor" },
];

const COLUMNS: ColumnDef<MergedRow>[] = [
  {
    accessorKey: "at",
    header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {new Date(row.original.at).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "actor",
    header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
    cell: ({ row }) => <span className="text-xs">{row.original.actor}</span>,
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      return Array.isArray(value)
        ? value.includes(row.getValue(id))
        : row.getValue(id) === value;
    },
  },
  {
    accessorKey: "action",
    header: ({ column }) => <SortableHeader column={column}>Action</SortableHeader>,
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono text-[10px]">
        {row.original.action}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      return Array.isArray(value)
        ? value.includes(row.getValue(id))
        : row.getValue(id) === value;
    },
  },
  {
    id: "details",
    header: "Details",
    cell: ({ row }) => (
      <div className="text-xs">
        <ActionDetails row={row.original} />
      </div>
    ),
    enableSorting: false,
  },
  {
    id: "open",
    header: () => <span className="sr-only">Open sheet</span>,
    cell: ({ row }) =>
      row.original.sheet_id ? (
        <div className="text-right">
          <IdentifierLink href={`/markbook/grading/${row.original.sheet_id}`}>
            Sheet
          </IdentifierLink>
        </div>
      ) : (
        <div className="text-right text-xs text-muted-foreground">—</div>
      ),
    enableSorting: false,
    enableHiding: false,
  },
];

export function AuditLogDataTable({
  rows,
  initialSheetIdFilter,
  initialActionFilter,
  canExport = false,
  pagination,
}: Props) {
  const [exportRange, setExportRange] = React.useState<DateRange | undefined>(undefined);
  const [exportOpen, setExportOpen] = React.useState(false);
  const exportHref = React.useMemo(() => {
    if (!exportRange?.from || !exportRange.to) return null;
    return `/api/audit-log/export?from=${toIsoDay(exportRange.from)}&to=${toIsoDay(exportRange.to)}`;
  }, [exportRange]);

  const [sheetIdFilter, setSheetIdFilter] = React.useState<string | null>(
    initialSheetIdFilter ?? null,
  );
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);

  // Apply date + sheet-id pre-filters before passing to DataTable
  const filteredRows = React.useMemo(() => {
    let data = rows;
    if (sheetIdFilter) data = data.filter((r) => r.sheet_id === sheetIdFilter);
    if (dateRange?.from) {
      const from = startOfDay(dateRange.from).getTime();
      const to = dateRange.to ? endOfDay(dateRange.to).getTime() : Infinity;
      data = data.filter((r) => {
        const ts = new Date(r.at).getTime();
        return ts >= from && ts <= to;
      });
    }
    return data;
  }, [rows, sheetIdFilter, dateRange]);

  // Toolbar leading: date-range picker + sheet ID chip
  const toolbarLeading = (
    <>
      {/* Date range filter */}
      <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 gap-2 font-normal", !dateRange?.from && "text-muted-foreground")}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateRange?.from ? (
              <span className="font-mono text-[11px] tabular-nums">
                {formatDay(dateRange.from)}
                {dateRange.to ? ` – ${formatDay(dateRange.to)}` : ""}
              </span>
            ) : (
              <span className="text-sm">Any date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={2}
            captionLayout="dropdown"
          />
          <div className="flex items-center justify-between border-t border-hairline p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDateRange(undefined)}
              disabled={!dateRange?.from}
            >
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => setDateRangeOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Sheet ID chip (from deep-link) */}
      {sheetIdFilter && (
        <Badge
          variant="outline"
          className="h-8 gap-1.5 border-border bg-accent px-2.5 font-mono text-[11px] text-accent-foreground"
        >
          Sheet {sheetIdFilter.slice(0, 8)}…
          <button
            type="button"
            onClick={() => setSheetIdFilter(null)}
            aria-label="Clear sheet filter"
            className="ml-0.5 inline-flex size-4 items-center justify-center rounded hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </>
  );

  // Toolbar trailing: CSV export dialog (server-side date-range export)
  const toolbarTrailing = canExport ? (
    <Dialog
      open={exportOpen}
      onOpenChange={(v) => {
        setExportOpen(v);
        if (!v) setExportRange(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle className="font-serif tracking-tight">Export date range</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            All audit data within the selected date range will be exported as CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-end gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 flex-1 justify-start gap-2 font-normal",
                    !exportRange?.from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="size-3.5" />
                  {exportRange?.from ? (
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatDay(exportRange.from)}
                      {exportRange.to ? ` – ${formatDay(exportRange.to)}` : ""}
                    </span>
                  ) : (
                    <span className="text-sm">Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={exportRange}
                  onSelect={setExportRange}
                  numberOfMonths={2}
                  captionLayout="dropdown"
                />
                {exportRange?.from && (
                  <div className="flex justify-end border-t border-border p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExportRange(undefined)}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <Button
              asChild={!!exportHref}
              disabled={!exportHref}
              className="h-9 shrink-0 gap-2"
              onClick={() => {
                if (exportHref) setExportOpen(false);
              }}
            >
              {exportHref ? (
                <a href={exportHref} download>
                  <Download className="size-3.5" />
                  Download
                </a>
              ) : (
                <span className="flex gap-2">
                  <Download className="size-3.5" />
                  Download
                </span>
              )}
            </Button>
          </div>

          {!exportRange?.from && (
            <p className="text-[12px] text-destructive">
              Please select a start and end date to export.
            </p>
          )}
          {exportRange?.from && !exportRange.to && (
            <p className="text-[12px] text-destructive">
              Please select an end date to complete the range.
            </p>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-brand-amber/40 bg-brand-amber-light/30 p-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-amber/15 text-brand-amber">
              <History className="size-4" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[13px] font-medium leading-tight text-foreground">
                Large exports may take a moment
              </p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                The CSV includes every audit entry within the selected window. For wide ranges
                with heavy activity, the file can be several thousand rows.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  // Seed the action facet from URL params on first render
  const initialColumnFilters = React.useMemo(
    () =>
      initialActionFilter
        ? [{ id: "action", value: [initialActionFilter] }]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <_AuditLogTable
      filteredRows={filteredRows}
      facets={FACETS}
      toolbarLeading={toolbarLeading}
      toolbarTrailing={toolbarTrailing}
      initialColumnFilters={initialColumnFilters}
      pagination={pagination}
    />
  );
}

// Inner component that receives stable props so DataTable URL-state works
// correctly even when the outer wrapper's state changes.
function _AuditLogTable({
  filteredRows,
  facets,
  toolbarLeading,
  toolbarTrailing,
  initialColumnFilters,
  pagination,
}: {
  filteredRows: MergedRow[];
  facets: FacetConfig[];
  toolbarLeading: React.ReactNode;
  toolbarTrailing: React.ReactNode;
  initialColumnFilters: Array<{ id: string; value: string[] }>;
  pagination?: PaginationInfo;
}) {
  const router = useRouter();

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", String(newPage));
      router.push(`?${params.toString()}`);
    },
    [router],
  );

  return (
    <>
      <DataTable<MergedRow>
        data={filteredRows}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        searchKeys={["actor", "action", "entity_type"]}
        searchPlaceholder="Search actor, action, details…"
        facets={facets}
        toolbarLeading={toolbarLeading}
        toolbarTrailing={toolbarTrailing}
        initialSort={[{ id: "at", desc: true }]}
        pageSize={pagination ? Math.max(filteredRows.length, 1) : 25}
        url={{ enabled: true }}
        emptyState={{
          title: "No audit entries yet.",
          body: "Activity — sheet creation, score edits, locks, and more — will appear here.",
        }}
        emptyFilteredState={{
          title: "No audit entries match the current filters.",
          body: "Try clearing the date range or filters.",
        }}
      />
      {pagination && (
        <div className="flex items-center justify-between rounded-b-xl border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            {pagination.total === 0
              ? "No entries"
              : `Showing ${((pagination.page - 1) * pagination.pageSize + 1).toLocaleString("en-SG")}–${Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                ).toLocaleString("en-SG")} of ${pagination.total.toLocaleString("en-SG")}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              ← Prev
            </Button>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {pagination.page.toLocaleString("en-SG")} / {pagination.totalPages.toLocaleString("en-SG")}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function ActionDetails({ row }: { row: MergedRow }) {
  const ctx = row.context;
  const str = (k: string): string | null => {
    const v = ctx[k];
    return v == null ? null : String(v);
  };

  switch (row.action) {
    case "entry.update":
    case "totals.update": {
      const field = str("field") ?? "—";
      const oldV = str("old") ?? "∅";
      const newV = str("new") ?? "∅";
      const locked = ctx["was_locked"] === true;
      const approval = str("approval_reference");
      return (
        <div className="space-y-0.5">
          <div className="inline-flex flex-wrap items-center gap-1.5 font-mono">
            <span className="text-muted-foreground">{field}:</span>
            <span className="text-muted-foreground line-through">{oldV}</span>
            <ArrowRight className="size-3 text-muted-foreground" />
            <span className="font-semibold">{newV}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {locked ? "post-lock" : "pre-lock"}
            {approval ? ` · approval: ${approval}` : ""}
          </div>
        </div>
      );
    }
    case "sheet.create":
      return (
        <span>
          Created grading sheet{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            subject {str("subject_id")?.slice(0, 8)}…
          </code>{" "}
          for section{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("section_id")?.slice(0, 8)}…
          </code>
          {" · seeded "}
          <span className="tabular-nums">{String(ctx["entries_seeded"] ?? 0)}</span>
          {" entries"}
        </span>
      );
    case "sheet.lock":
      return <span>Locked grading sheet {row.sheet_id?.slice(0, 8)}…</span>;
    case "sheet.unlock":
      return <span>Unlocked grading sheet {row.sheet_id?.slice(0, 8)}…</span>;
    case "sheet.unlock_force_with_pending_crs": {
      const pendingCount = Number(ctx["pendingCount"] ?? 0);
      return (
        <span>
          Unlocked grading sheet {row.sheet_id?.slice(0, 8)}…{" "}
          <span className="text-destructive">
            (forced — {pendingCount}{" "}
            pending {pendingCount === 1 ? "request" : "requests"} bypassed)
          </span>
        </span>
      );
    }
    case "student.sync": {
      const added = ctx["added"] ?? 0;
      const updated = ctx["updated"] ?? 0;
      const withdrawn = ctx["withdrawn"] ?? 0;
      const reactivated = ctx["reactivated"] ?? 0;
      const errs = ctx["errors"] ?? 0;
      return (
        <span className="tabular-nums">
          Synced admissions — added <b>{String(added)}</b>, updated <b>{String(updated)}</b>,
          withdrew <b>{String(withdrawn)}</b>, reactivated <b>{String(reactivated)}</b>
          {Number(errs) > 0 && (
            <span className="text-destructive"> · {String(errs)} errors</span>
          )}
        </span>
      );
    }
    case "student.add":
      return (
        <span>
          Manually added student{" "}
          <code className="rounded bg-muted px-1 text-[10px]">{str("student_number")}</code>
          {" ("}
          {str("first_name")} {str("last_name")}
          {") as #"}
          <span className="tabular-nums">{String(ctx["index_number"] ?? "")}</span>
        </span>
      );
    case "assignment.create":
      return (
        <span>
          Created <b>{str("role")}</b> assignment for teacher{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("teacher_user_id")?.slice(0, 8)}…
          </code>{" "}
          on section{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("section_id")?.slice(0, 8)}…
          </code>
          {ctx["subject_id"] ? (
            <>
              {" / subject "}
              <code className="rounded bg-muted px-1 text-[10px]">
                {String(ctx["subject_id"]).slice(0, 8)}…
              </code>
            </>
          ) : null}
        </span>
      );
    case "assignment.delete":
      return (
        <span>
          Removed <b>{str("role")}</b> assignment (teacher{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("teacher_user_id")?.slice(0, 8)}…
          </code>
          )
        </span>
      );
    case "attendance.update": {
      const after = ctx["after"] as Record<string, unknown> | undefined;
      return (
        <span className="tabular-nums">
          Attendance updated for enrolment{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("section_student_id")?.slice(0, 8)}…
          </code>
          {after && (
            <>
              {" · school "}
              <b>{String(after["school_days"] ?? "—")}</b>
              {" · present "}
              <b>{String(after["days_present"] ?? "—")}</b>
              {" · late "}
              <b>{String(after["days_late"] ?? "—")}</b>
            </>
          )}
        </span>
      );
    }
    case "comment.update":
      return (
        <span>
          Updated adviser comment for student{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("student_id")?.slice(0, 8)}…
          </code>
        </span>
      );
    case "publication.create":
      return (
        <span>
          Published report cards for section{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("section_id")?.slice(0, 8)}…
          </code>
          {" · term "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("term_id")?.slice(0, 8)}…
          </code>
          {" · window "}
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {str("publish_from")?.slice(0, 10)}
            <ArrowRight className="size-3 text-muted-foreground" />
            {str("publish_until")?.slice(0, 10)}
          </span>
        </span>
      );
    case "publication.delete":
      return (
        <span>
          Revoked report card publication for section{" "}
          <code className="rounded bg-muted px-1 text-[10px]">
            {str("section_id")?.slice(0, 8)}…
          </code>
        </span>
      );
    case "pfile.upload": {
      const label = str("label") ?? str("slotKey") ?? "document";
      const merged = ctx["merged"] === true;
      const replaced = ctx["replaced"] === true;
      const count = ctx["fileCount"] ? String(ctx["fileCount"]) : "1";
      return (
        <span>
          {replaced ? "Replaced " : "Uploaded "}
          <b>{label}</b> for student{" "}
          <code className="rounded bg-muted px-1 text-[10px]">{row.entity_id}</code>
          {merged && (
            <span className="text-muted-foreground"> · merged {count} PDFs</span>
          )}
          {str("expiryDate") && (
            <span className="text-muted-foreground"> · expires {str("expiryDate")}</span>
          )}
          {str("note") && (
            <span className="text-muted-foreground"> · note: {str("note")}</span>
          )}
        </span>
      );
    }
    default:
      return <span className="text-muted-foreground">{JSON.stringify(ctx)}</span>;
  }
}
