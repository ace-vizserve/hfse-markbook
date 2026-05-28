'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DatePicker } from '@/components/ui/date-picker';
import { IdentifierLink } from '@/components/ui/identifier-link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SortableHeader } from '@/components/ui/data-table/sortable-header';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TABLE_COPY } from '@/lib/copy/data-table';

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

type PaginationInfo = {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
};

type Props = {
  rows: AttendanceAuditRow[];
  pagination?: PaginationInfo;
  actionOptions: string[];
  actorOptions: string[];
  currentAction: string | null;
  currentActor: string | null;
  currentFrom: string | null;
  currentTo: string | null;
};

// ---------------------------------------------------------------------------
// Action label config
// ---------------------------------------------------------------------------

type AttendanceActionTone = 'default' | 'warn' | 'info';

type AttendanceActionLabel = {
  label: string;
  tone: AttendanceActionTone;
  tooltip?: string;
};

const ACTION_LABELS: Record<string, AttendanceActionLabel> = {
  'attendance.daily.update': { label: 'Daily · mark', tone: 'default' },
  'attendance.daily.correct': { label: 'Daily · correction', tone: 'warn' },
  'attendance.import.bulk': { label: 'Bulk import', tone: 'info' },
  'attendance.update': {
    label: TABLE_COPY.termSummary,
    tone: 'info',
    tooltip: TABLE_COPY.termSummaryTooltip,
  },
  'attendance.calendar.upsert': { label: 'Calendar · update', tone: 'info' },
  'attendance.calendar.delete': { label: 'Calendar · delete', tone: 'warn' },
  'attendance.calendar.autoseed': {
    label: 'Calendar · auto-seed',
    tone: 'info',
  },
  'attendance.calendar.copy_from_prior_ay': {
    label: 'Calendar · copy from prior AY',
    tone: 'info',
  },
  'attendance.event.create': { label: 'Event · create', tone: 'info' },
  'attendance.event.update': { label: 'Event · update', tone: 'info' },
  'attendance.event.delete': { label: 'Event · delete', tone: 'warn' },
};

// Human-readable labels for the action filter dropdown
const ACTION_DISPLAY_LABELS: Record<string, string> = {
  'attendance.update': 'Term summary update',
  'attendance.daily.update': 'Daily mark',
  'attendance.daily.correct': 'Daily correction',
  'attendance.import.bulk': 'Bulk import',
  'attendance.calendar.upsert': 'Calendar update',
  'attendance.calendar.delete': 'Calendar delete',
  'attendance.calendar.autoseed': 'Calendar auto-seed',
  'attendance.calendar.copy_from_prior_ay': 'Calendar copy from prior year',
  'attendance.event.create': 'Event create',
  'attendance.event.update': 'Event update',
  'attendance.event.delete': 'Event delete',
};

// §9.3 wash recipes — brand tokens only.
const TONE_CLASS: Record<AttendanceActionTone, string> = {
  default: '',
  warn: 'border-brand-amber/40 bg-brand-amber/15 text-brand-amber',
  info: 'border-brand-indigo-soft/40 bg-accent text-brand-indigo-deep',
};

// ---------------------------------------------------------------------------
// Helper: derive a section link from a row
// ---------------------------------------------------------------------------

function getSectionLink(row: AttendanceAuditRow): string | null {
  const ctx = row.context;

  if (
    row.action === 'attendance.daily.update' ||
    row.action === 'attendance.daily.correct'
  ) {
    // entity_type === 'section'; entity_id is the section ID
    const sectionId =
      row.entity_id ?? (ctx['section_id'] as string | undefined);
    if (!sectionId) return null;
    const date = ctx['date'] as string | undefined;
    return date
      ? `/attendance/${sectionId}?date=${date}`
      : `/attendance/${sectionId}`;
  }

  if (row.action === 'attendance.import.bulk') {
    const sectionId =
      row.entity_id ??
      (ctx['section_id'] as string | undefined) ??
      (ctx['sectionId'] as string | undefined);
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
  if (typeof ctx.date === 'string') parts.push(`date: ${ctx.date}`);
  if (typeof ctx.status === 'string') parts.push(`status: ${ctx.status}`);
  if (typeof ctx.section_name === 'string')
    parts.push(`section: ${ctx.section_name}`);
  if (typeof ctx.rows_written === 'number')
    parts.push(`rows: ${ctx.rows_written}`);
  if (typeof ctx.students_matched === 'number')
    parts.push(`matched: ${ctx.students_matched}`);
  if (typeof ctx.students_unmatched === 'number' && ctx.students_unmatched > 0)
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
      {parts.join(' · ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action badge cell
// ---------------------------------------------------------------------------

function ActionBadge({ action }: { action: string }) {
  const labelCfg = ACTION_LABELS[action] ?? {
    label: action,
    tone: 'default' as const,
  };

  const badge =
    labelCfg.tone === 'default' ? (
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
// Columns — no client-side facet filtering (server already filtered)
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<AttendanceAuditRow>[] = [
  {
    accessorKey: 'at',
    header: ({ column }) => (
      <SortableHeader column={column}>When</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
        {new Date(row.original.at).toLocaleString('en-SG', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
  },
  {
    accessorKey: 'actor_display',
    header: ({ column }) => (
      <SortableHeader column={column}>Who</SortableHeader>
    ),
    cell: ({ row }) => (
      <div>
        <span className="text-sm text-foreground">
          {row.original.actor_display}
        </span>
        {row.original.actor_display !== row.original.actor_email && (
          <p className="font-mono text-[10px] text-muted-foreground">
            {row.original.actor_email}
          </p>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'action',
    header: ({ column }) => (
      <SortableHeader column={column}>Action</SortableHeader>
    ),
    cell: ({ row }) => <ActionBadge action={row.original.action} />,
  },
  {
    id: 'details',
    header: 'Details',
    cell: ({ row }) => <ContextSummary row={row.original} />,
    enableSorting: false,
  },
  {
    id: 'open',
    header: () => <span className="sr-only">Open section</span>,
    cell: ({ row }) => {
      const href = getSectionLink(row.original);
      if (!href)
        return (
          <div className="text-right text-xs text-muted-foreground">—</div>
        );
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
// Server-filter toolbar
// ---------------------------------------------------------------------------

function AuditFilterToolbar({
  actionOptions,
  actorOptions,
  currentAction,
  currentActor,
  currentFrom,
  currentTo,
}: {
  actionOptions: string[];
  actorOptions: string[];
  currentAction: string | null;
  currentActor: string | null;
  currentFrom: string | null;
  currentTo: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pushFilter = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset page to 1 whenever a filter changes
      params.delete('page');
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const hasAnyFilter = !!(
    currentAction ||
    currentActor ||
    currentFrom ||
    currentTo
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Action filter */}
      <Select
        value={currentAction ?? '__all__'}
        onValueChange={(v) =>
          pushFilter({ action: v === '__all__' ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All actions</SelectItem>
          {actionOptions.map((a) => (
            <SelectItem key={a} value={a} className="font-mono text-[11px]">
              {ACTION_DISPLAY_LABELS[a] ?? a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Actor filter */}
      <Select
        value={currentActor ?? '__all__'}
        onValueChange={(v) => pushFilter({ actor: v === '__all__' ? null : v })}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All staff" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All staff</SelectItem>
          {actorOptions.map((email) => (
            <SelectItem
              key={email}
              value={email}
              className="font-mono text-[11px]"
            >
              {email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date from */}
      <div className="flex items-center gap-1">
        <label className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          From
        </label>
        <DatePicker
          value={currentFrom ?? ''}
          onChange={(v) => pushFilter({ from: v || null })}
          placeholder="From date"
          className="h-8 w-[140px] text-xs"
        />
      </div>

      {/* Date to */}
      <div className="flex items-center gap-1">
        <label className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          To
        </label>
        <DatePicker
          value={currentTo ?? ''}
          onChange={(v) => pushFilter({ to: v || null })}
          placeholder="To date"
          className="h-8 w-[140px] text-xs"
        />
      </div>

      {/* Clear all filters */}
      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={() =>
            pushFilter({ action: null, actor: null, from: null, to: null })
          }
        >
          <X className="h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function AttendanceAuditLogDataTable({
  rows,
  pagination,
  actionOptions,
  actorOptions,
  currentAction,
  currentActor,
  currentFrom,
  currentTo,
}: Props) {
  const router = useRouter();

  const handlePageChange = React.useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(window.location.search);
      params.set('page', String(newPage));
      router.push(`?${params.toString()}`);
    },
    [router]
  );

  const toolbarLeading = (
    <AuditFilterToolbar
      actionOptions={actionOptions}
      actorOptions={actorOptions}
      currentAction={currentAction}
      currentActor={currentActor}
      currentFrom={currentFrom}
      currentTo={currentTo}
    />
  );

  return (
    <>
      <DataTable<AttendanceAuditRow>
        data={rows}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        searchKeys={['actor_display', 'actor_email', 'action', 'entity_type']}
        searchPlaceholder="Search actor, action, details…"
        toolbarLeading={toolbarLeading}
        initialSort={[{ id: 'at', desc: true }]}
        pageSize={pagination ? Math.max(rows.length, 1) : 25}
        url={{ enabled: false }}
        csv={{ filename: 'attendance-audit-log.csv' }}
        emptyState={{
          title: 'No audit entries yet.',
          body: 'Once daily attendance is recorded, entries appear here.',
        }}
        emptyFilteredState={{
          title: 'No entries match the current filters.',
          body: 'Try clearing the action, actor, or date filters.',
        }}
      />
      {pagination && (
        <div className="flex items-center justify-between rounded-b-xl border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            {pagination.total === 0
              ? 'No entries'
              : `Showing ${((pagination.page - 1) * pagination.pageSize + 1).toLocaleString('en-SG')}–${Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total
                ).toLocaleString(
                  'en-SG'
                )} of ${pagination.total.toLocaleString('en-SG')}`}
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
              {pagination.page.toLocaleString('en-SG')} /{' '}
              {pagination.totalPages.toLocaleString('en-SG')}
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
