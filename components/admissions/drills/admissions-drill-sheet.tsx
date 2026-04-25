'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  AlertTriangle,
  Asterisk,
  CheckCircle2,
  ClipboardList,
  Cog,
  FileText,
  GraduationCap,
  HelpCircle,
  UserMinus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  DrillDownSheet,
  type DrillDownDensity,
  type DrillDownGroupBy,
} from '@/components/dashboard/drill-down-sheet';
import { Badge } from '@/components/ui/badge';
import {
  ALL_DRILL_COLUMNS,
  DRILL_COLUMN_LABELS,
  defaultColumnsForTarget,
  drillHeaderForTarget,
  type DrillColumnKey,
  type DrillRow,
  type DrillScope,
  type DrillTarget,
} from '@/lib/admissions/drill';

// ─────────────────────────────────────────────────────────────────────────────
// Props

export type AdmissionsDrillSheetProps = {
  target: DrillTarget;
  segment?: string | null;
  ayCode: string;
  /** Initial scope; the drill manages its own scope state and refetches when it changes. */
  initialScope?: DrillScope;
  /** When initialScope='range', these clamp the dataset. */
  initialFrom?: string;
  initialTo?: string;
  /** Pre-fetched rows — when provided, the drill renders immediately without
   *  a network call. Used by the page (Server Component) to avoid loading
   *  spinners on first open. Subsequent scope changes still hit the API. */
  initialRows?: DrillRow[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Cell badges — visual patterns lifted from outdated-applications-table.tsx so
// every drill table reads as one visual family. When we eventually dedupe these
// into a shared module, both files import from the same place.

const BADGE_BASE =
  'h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]';

type StaleTier = 'unknown' | 'green' | 'amber' | 'red';

function tierFor(days: number | null): StaleTier {
  if (days === null) return 'unknown';
  if (days >= 14) return 'red';
  if (days >= 7) return 'amber';
  return 'green';
}

function StalenessBadge({ days }: { days: number | null }) {
  const tier = tierFor(days);
  if (tier === 'unknown') {
    return (
      <Badge
        variant="outline"
        className={`${BADGE_BASE} border-hairline bg-muted text-ink-3`}
      >
        <HelpCircle className="h-3 w-3" aria-hidden />
        Never updated
      </Badge>
    );
  }
  if (tier === 'red') {
    return (
      <Badge
        variant="outline"
        className={`${BADGE_BASE} border-destructive/40 bg-destructive/10 text-destructive`}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        {days}d stale
      </Badge>
    );
  }
  if (tier === 'amber') {
    return (
      <Badge
        variant="outline"
        className={`${BADGE_BASE} border-chart-4/50 bg-chart-4/15 text-ink`}
      >
        <AlertCircle className="h-3 w-3" aria-hidden />
        {days}d stale
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={`${BADGE_BASE} border-brand-mint bg-brand-mint/30 text-ink`}
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      Fresh · {days}d
    </Badge>
  );
}

type StatusStyle = {
  icon: LucideIcon;
  label: string;
  className: string;
};

const STATUS_STYLES: Record<string, StatusStyle> = {
  Submitted: {
    icon: FileText,
    label: 'Submitted',
    className: 'border-brand-indigo/40 bg-brand-indigo/10 text-brand-indigo',
  },
  'Ongoing Verification': {
    icon: ClipboardList,
    label: 'Verification',
    className: 'border-chart-4/50 bg-chart-4/15 text-ink',
  },
  Processing: {
    icon: Cog,
    label: 'Processing',
    className: 'border-brand-indigo-soft/60 bg-brand-indigo-soft/15 text-ink',
  },
  Enrolled: {
    icon: GraduationCap,
    label: 'Enrolled',
    className: 'border-brand-mint bg-brand-mint/30 text-ink',
  },
  'Enrolled (Conditional)': {
    icon: Asterisk,
    label: 'Conditional',
    className: 'border-brand-mint/60 bg-brand-mint/15 text-ink',
  },
  Withdrawn: {
    icon: UserMinus,
    label: 'Withdrawn',
    className: 'border-destructive/30 bg-destructive/5 text-ink-4',
  },
  Cancelled: {
    icon: XCircle,
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/5 text-ink-4',
  },
};

const UNKNOWN_STATUS: StatusStyle = {
  icon: HelpCircle,
  label: 'No status',
  className: 'border-hairline bg-muted text-ink-3',
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? UNKNOWN_STATUS;
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={`${BADGE_BASE} ${style.className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {style.label}
    </Badge>
  );
}

function AssessmentBadge({ outcome }: { outcome: string }) {
  const normalized = outcome.toLowerCase();
  if (normalized === 'pass') return <Badge variant="success">Pass</Badge>;
  if (normalized === 'fail') return <Badge variant="blocked">Fail</Badge>;
  return <Badge variant="muted">Unknown</Badge>;
}

function DocsCell({ complete, total }: { complete: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);
  let badge: React.ReactNode;
  if (total > 0 && complete === total) {
    badge = <Badge variant="success">{complete}/{total}</Badge>;
  } else if (complete === 0) {
    badge = <Badge variant="blocked">0/{total}</Badge>;
  } else {
    badge = <Badge variant="muted">{complete}/{total}</Badge>;
  }
  // Inline meter under the badge — semantic tokens only, no hardcoded color.
  const fillClass =
    complete === total && total > 0
      ? 'bg-brand-mint'
      : complete === 0
        ? 'bg-destructive/60'
        : 'bg-chart-4';
  return (
    <div className="flex flex-col gap-1">
      {badge}
      <div className="h-px w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${fillClass}`}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const CANONICAL_LEVELS = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4',
] as const;
const CANONICAL_LEVEL_INDEX: Record<string, number> = CANONICAL_LEVELS.reduce(
  (acc, lvl, i) => {
    acc[lvl] = i;
    return acc;
  },
  {} as Record<string, number>,
);

function compareLevels(a: string, b: string): number {
  const aIsUnknown = a === 'Unknown';
  const bIsUnknown = b === 'Unknown';
  if (aIsUnknown && bIsUnknown) return 0;
  if (aIsUnknown) return 1;
  if (bIsUnknown) return -1;
  const aIdx = CANONICAL_LEVEL_INDEX[a];
  const bIdx = CANONICAL_LEVEL_INDEX[b];
  const aIsCanon = aIdx !== undefined;
  const bIsCanon = bIdx !== undefined;
  if (aIsCanon && bIsCanon) return aIdx - bIdx;
  if (aIsCanon) return -1;
  if (bIsCanon) return 1;
  return a.localeCompare(b);
}

function buildDrillUrl(
  target: DrillTarget,
  ayCode: string,
  scope: DrillScope,
  from: string | undefined,
  to: string | undefined,
  segment: string | null | undefined,
  format: 'json' | 'csv',
  visibleColumnKeys?: string[],
): string {
  const params = new URLSearchParams();
  params.set('ay', ayCode);
  params.set('scope', scope);
  if (scope === 'range') {
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  if (segment) params.set('segment', segment);
  if (format === 'csv') {
    params.set('format', 'csv');
    if (visibleColumnKeys && visibleColumnKeys.length > 0) {
      params.set('columns', visibleColumnKeys.join(','));
    }
  }
  return `/api/admissions/drill/${target}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column factory

function buildColumnDef(key: DrillColumnKey): ColumnDef<DrillRow, unknown> {
  const header = DRILL_COLUMN_LABELS[key];
  switch (key) {
    case 'fullName':
      return {
        id: 'fullName',
        accessorKey: 'fullName',
        header,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium text-foreground">{row.original.fullName}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {row.original.enroleeNumber}
            </div>
          </div>
        ),
        enableSorting: true,
      };
    case 'enroleeNumber':
      return {
        id: 'enroleeNumber',
        accessorKey: 'enroleeNumber',
        header,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.enroleeNumber}
          </span>
        ),
        enableSorting: true,
      };
    case 'studentNumber':
      return {
        id: 'studentNumber',
        accessorKey: 'studentNumber',
        header,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.studentNumber ?? '—'}
          </span>
        ),
        enableSorting: true,
      };
    case 'status':
      return {
        id: 'status',
        accessorKey: 'status',
        header,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        enableSorting: true,
      };
    case 'level':
      return {
        id: 'level',
        accessorKey: 'level',
        header,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.level ?? '—'}
          </span>
        ),
        enableSorting: true,
        sortingFn: (a, b) => {
          const av = a.original.level ?? 'Unknown';
          const bv = b.original.level ?? 'Unknown';
          return compareLevels(av, bv);
        },
      };
    case 'stage':
      return {
        id: 'stage',
        accessorKey: 'stage',
        header,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.stage ?? '—'}
          </span>
        ),
        enableSorting: true,
      };
    case 'referralSource':
      return {
        id: 'referralSource',
        accessorKey: 'referralSource',
        header,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.referralSource ?? '—'}
          </span>
        ),
        enableSorting: true,
      };
    case 'assessmentOutcome':
      return {
        id: 'assessmentOutcome',
        accessorKey: 'assessmentOutcome',
        header,
        cell: ({ row }) => (
          <AssessmentBadge outcome={row.original.assessmentOutcome ?? 'unknown'} />
        ),
        enableSorting: true,
      };
    case 'applicationDate':
      return {
        id: 'applicationDate',
        accessorKey: 'applicationDate',
        header,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatDate(row.original.applicationDate)}
          </span>
        ),
        enableSorting: true,
      };
    case 'enrollmentDate':
      return {
        id: 'enrollmentDate',
        accessorKey: 'enrollmentDate',
        header,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatDate(row.original.enrollmentDate)}
          </span>
        ),
        enableSorting: true,
      };
    case 'daysToEnroll':
      return {
        id: 'daysToEnroll',
        accessorKey: 'daysToEnroll',
        header,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-foreground">
            {row.original.daysToEnroll === null
              ? '—'
              : `${row.original.daysToEnroll}d`}
          </span>
        ),
        enableSorting: true,
        sortingFn: (a, b) => {
          const av = a.original.daysToEnroll;
          const bv = b.original.daysToEnroll;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return av - bv;
        },
      };
    case 'daysSinceUpdate':
      return {
        id: 'daysSinceUpdate',
        accessorKey: 'daysSinceUpdate',
        header,
        cell: ({ row }) => <StalenessBadge days={row.original.daysSinceUpdate} />,
        enableSorting: true,
        sortingFn: (a, b) => {
          const av = a.original.daysSinceUpdate;
          const bv = b.original.daysSinceUpdate;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return av - bv;
        },
      };
    case 'daysInPipeline':
      return {
        id: 'daysInPipeline',
        accessorKey: 'daysInPipeline',
        header,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-foreground">
            {row.original.daysInPipeline}d
          </span>
        ),
        enableSorting: true,
      };
    case 'documentsComplete':
      return {
        id: 'documentsComplete',
        accessorKey: 'documentsComplete',
        header,
        cell: ({ row }) => (
          <DocsCell
            complete={row.original.documentsComplete}
            total={row.original.documentsTotal}
          />
        ),
        enableSorting: true,
      };
    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = key;
      throw new Error(`unreachable column key: ${String(_exhaustive)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The wrapper

export function AdmissionsDrillSheet({
  target,
  segment,
  ayCode,
  initialScope = 'range',
  initialFrom,
  initialTo,
  initialRows,
}: AdmissionsDrillSheetProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [scope, setScope] = React.useState<DrillScope>(initialScope);
  const [rows, setRows] = React.useState<DrillRow[]>(initialRows ?? []);
  const [, setLoading] = React.useState<boolean>(
    initialRows === undefined,
  );
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = React.useState<string[]>([]);
  const [groupBy, setGroupBy] = React.useState<DrillDownGroupBy>('none');
  const [density, setDensity] = React.useState<DrillDownDensity>('comfortable');
  const [visibleColumnKeys, setVisibleColumnKeys] = React.useState<DrillColumnKey[]>(
    () => defaultColumnsForTarget(target),
  );

  // ── Fetch on scope change ────────────────────────────────────────────────
  // Skip the first effect run when initialRows is provided AND scope hasn't
  // changed yet — the parent already handed us hydrated rows.
  const skipNextFetchRef = React.useRef<boolean>(
    initialRows !== undefined,
  );

  React.useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const url = buildDrillUrl(
      target,
      ayCode,
      scope,
      initialFrom,
      initialTo,
      segment,
      'json',
    );
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { rows?: DrillRow[] };
        if (cancelled) return;
        setRows(Array.isArray(json.rows) ? json.rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Failed to load drill data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, ayCode, scope, segment, initialFrom, initialTo]);

  // ── Pre-filter rows by status + level ───────────────────────────────────
  // Search (`globalFilter`) is owned by react-table inside DrillDownSheet;
  // we apply the slower client filters here so they reduce the dataset
  // *before* the table builds its row model.
  const preFiltered = React.useMemo<DrillRow[]>(() => {
    if (selectedStatuses.length === 0 && selectedLevels.length === 0) return rows;
    const statusSet = new Set(selectedStatuses);
    const levelSet = new Set(selectedLevels);
    return rows.filter((r) => {
      if (selectedStatuses.length > 0 && !statusSet.has(r.status)) return false;
      if (selectedLevels.length > 0 && !levelSet.has(r.level ?? 'Unknown')) return false;
      return true;
    });
  }, [rows, selectedStatuses, selectedLevels]);

  // ── Filter options derived from the *fetched* row set ────────────────────
  // (Not the pre-filtered set — otherwise selecting a status would empty
  //  the level dropdown for the unselected statuses.)
  const statusOptions = React.useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    return Array.from(set).sort();
  }, [rows]);

  const levelOptions = React.useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.level ?? 'Unknown');
    return Array.from(set).sort(compareLevels);
  }, [rows]);

  // ── Columns ──────────────────────────────────────────────────────────────
  // Build full column set in canonical order; DrillDownSheet handles
  // visibility filtering via `visibleColumnKeys`.
  const columns = React.useMemo<ColumnDef<DrillRow, unknown>[]>(
    () => ALL_DRILL_COLUMNS.map(buildColumnDef),
    [],
  );

  const columnOptions = React.useMemo(
    () =>
      ALL_DRILL_COLUMNS.map((k) => ({
        key: k,
        label: DRILL_COLUMN_LABELS[k],
      })),
    [],
  );

  // ── Group accessor ───────────────────────────────────────────────────────
  const groupAccessor = React.useCallback(
    (row: DrillRow): string | null => {
      switch (groupBy) {
        case 'level':
          return row.level ?? 'Unknown';
        case 'status':
          return row.status;
        case 'stage':
          return row.stage ?? null;
        default:
          return null;
      }
    },
    [groupBy],
  );

  // ── Header + CSV ────────────────────────────────────────────────────────
  const heading = drillHeaderForTarget(target, segment ?? null);
  const csvHref = buildDrillUrl(
    target,
    ayCode,
    scope,
    initialFrom,
    initialTo,
    segment,
    'csv',
    visibleColumnKeys,
  );

  // ── Per-target tweaks ────────────────────────────────────────────────────
  // For target-rows where every status is "Enrolled" / "Enrolled (Conditional)",
  // grouping by stage is meaningless. We still surface the control — the user
  // can flip back to None — but we let the option set degenerate naturally.
  const enrolledOnly =
    target === 'avg-time' ||
    target === 'time-to-enroll-bucket' ||
    target === 'enrolled';
  const showGroupBy = !enrolledOnly || groupBy !== 'none';

  return (
    <DrillDownSheet<DrillRow>
      title={heading.title}
      eyebrow={heading.eyebrow}
      count={preFiltered.length}
      csvHref={csvHref}
      columns={columns}
      rows={preFiltered}
      // Toolkit
      scope={scope}
      onScopeChange={setScope}
      statusOptions={statusOptions}
      selectedStatuses={selectedStatuses}
      onStatusesChange={setSelectedStatuses}
      levelOptions={levelOptions}
      selectedLevels={selectedLevels}
      onLevelsChange={setSelectedLevels}
      groupBy={groupBy}
      onGroupByChange={setGroupBy}
      showGroupBy={showGroupBy}
      groupAccessor={groupAccessor}
      density={density}
      onDensityChange={setDensity}
      columnOptions={columnOptions}
      visibleColumnKeys={visibleColumnKeys}
      onColumnsChange={(next) =>
        setVisibleColumnKeys(next as DrillColumnKey[])
      }
    />
  );
}
