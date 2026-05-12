"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { type FacetConfig } from "@/components/ui/data-table/types";
import { IdentifierLink } from "@/components/ui/identifier-link";
import { SortableHeader } from "@/components/ui/data-table/sortable-header";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TABLE_COPY } from "@/lib/copy/data-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttendanceAuditRow = {
  id: string;
  at: string;
  actor_email: string;
  actor_display: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  context: Record<string, unknown>;
};

type Props = {
  rows: AttendanceAuditRow[];
};

// ---------------------------------------------------------------------------
// Action label config
// ---------------------------------------------------------------------------

type AttendanceActionTone = "default" | "warn" | "info";

type AttendanceActionLabel = {
  label: string;
  tone: AttendanceActionTone;
  tooltip?: string;
};

const ACTION_LABELS: Record<string, AttendanceActionLabel> = {
  "attendance.daily.update": { label: "Daily · mark", tone: "default" },
  "attendance.daily.correct": { label: "Daily · correction", tone: "warn" },
  "attendance.import.bulk": { label: "Bulk import", tone: "info" },
  "attendance.update": {
    label: TABLE_COPY.termSummary,
    tone: "info",
    tooltip: TABLE_COPY.termSummaryTooltip,
  },
};

// §9.3 wash recipes — brand tokens only.
const TONE_CLASS: Record<AttendanceActionTone, string> = {
  default: "",
  warn: "border-brand-amber/40 bg-brand-amber/15 text-brand-amber",
  info: "border-brand-indigo-soft/40 bg-accent text-brand-indigo-deep",
};

// ---------------------------------------------------------------------------
// Helper: derive a section link from a row
// ---------------------------------------------------------------------------

function getSectionLink(row: AttendanceAuditRow): string | null {
  const ctx = row.context;

  if (
    row.action === "attendance.daily.update" ||
    row.action === "attendance.daily.correct"
  ) {
    // entity_type === 'section'; entity_id is the section ID
    const sectionId = row.entity_id ?? (ctx["section_id"] as string | undefined);
    if (!sectionId) return null;
    const date = ctx["date"] as string | undefined;
    return date ? `/attendance/${sectionId}?date=${date}` : `/attendance/${sectionId}`;
  }

  if (row.action === "attendance.import.bulk") {
    const sectionId =
      row.entity_id ??
      (ctx["section_id"] as string | undefined) ??
      (ctx["sectionId"] as string | undefined);
    if (!sectionId) return null;
    return `/attendance/${sectionId}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Context summary (plain-English inline detail)
// ---------------------------------------------------------------------------

function ContextSummary({ row }: { row: AttendanceAuditRow }) {
  const ctx = row.context;
  if (!ctx || Object.keys(ctx).length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const parts: string[] = [];
  if (typeof ctx.date === "string") parts.push(`date: ${ctx.date}`);
  if (typeof ctx.status === "string") parts.push(`status: ${ctx.status}`);
  if (typeof ctx.section_name === "string")
    parts.push(`section: ${ctx.section_name}`);
  if (typeof ctx.rows_written === "number")
    parts.push(`rows: ${ctx.rows_written}`);
  if (typeof ctx.students_matched === "number")
    parts.push(`matched: ${ctx.students_matched}`);
  if (typeof ctx.students_unmatched === "number" && ctx.students_unmatched > 0)
    parts.push(`unmatched: ${ctx.students_unmatched}`);

  if (parts.length === 0) {
    return (
      <code className="font-mono text-[11px] text-muted-foreground">
        {JSON.stringify(ctx)}
      </code>
    );
  }
  return (
    <span className="font-mono text-[11px] text-foreground">
      {parts.join(" · ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action badge cell
// ---------------------------------------------------------------------------

function ActionBadge({ action }: { action: string }) {
  const labelCfg = ACTION_LABELS[action] ?? { label: action, tone: "default" as const };

  const badge =
    labelCfg.tone === "default" ? (
      <Badge variant="secondary">{labelCfg.label}</Badge>
    ) : (
      <Badge variant="outline" className={TONE_CLASS[labelCfg.tone]}>
        {labelCfg.label}
      </Badge>
    );

  if (!labelCfg.tooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        {labelCfg.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const FACETS: FacetConfig[] = [
  { columnId: "action", label: "Action" },
  { columnId: "actor_display", label: "Actor" },
];

const COLUMNS: ColumnDef<AttendanceAuditRow>[] = [
  {
    accessorKey: "at",
    header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
        {new Date(row.original.at).toLocaleString("en-SG", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    ),
  },
  {
    accessorKey: "actor_display",
    header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
    cell: ({ row }) => (
      <div>
        <span className="text-sm text-foreground">{row.original.actor_display}</span>
        {row.original.actor_display !== row.original.actor_email && (
          <p className="font-mono text-[10px] text-muted-foreground">
            {row.original.actor_email}
          </p>
        )}
      </div>
    ),
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
    cell: ({ row }) => <ActionBadge action={row.original.action} />,
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
    cell: ({ row }) => <ContextSummary row={row.original} />,
    enableSorting: false,
  },
  {
    id: "open",
    header: () => <span className="sr-only">Open section</span>,
    cell: ({ row }) => {
      const href = getSectionLink(row.original);
      if (!href)
        return <div className="text-right text-xs text-muted-foreground">—</div>;
      return (
        <div className="text-right">
          <IdentifierLink href={href}>Section</IdentifierLink>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AttendanceAuditLogDataTable({ rows }: Props) {
  return (
    <DataTable<AttendanceAuditRow>
      data={rows}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      searchKeys={["actor_display", "actor_email", "action", "entity_type"]}
      searchPlaceholder="Search actor, action, details…"
      facets={FACETS}
      initialSort={[{ id: "at", desc: true }]}
      pageSize={25}
      url={{ enabled: true }}
      csv={{ filename: "attendance-audit-log.csv" }}
      emptyState={{
        title: "No audit entries yet.",
        body: "Once daily attendance is recorded, entries appear here.",
      }}
      emptyFilteredState={{
        title: "No entries match the current filters.",
        body: "Try clearing the action or actor filter.",
      }}
    />
  );
}
