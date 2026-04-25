'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileX,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  DrillDownSheet,
  type DrillDownDensity,
  type DrillDownGroupBy,
} from '@/components/dashboard/drill-down-sheet';
import { DrillSheetSkeleton } from '@/components/dashboard/drill-sheet-skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ALL_DRILL_COLUMNS,
  DRILL_COLUMN_LABELS,
  defaultColumnsForTarget,
  drillHeaderForTarget,
  type DrillColumnKey,
  type DrillScope,
  type PFilesDrillRow,
  type PFilesDrillTarget,
} from '@/lib/p-files/drill';

// ─── Props ──────────────────────────────────────────────────────────────────

export type PFilesDrillSheetProps = {
  target: PFilesDrillTarget;
  segment?: string | null;
  ayCode: string;
  initialScope?: DrillScope;
  initialFrom?: string;
  initialTo?: string;
  initialRows?: PFilesDrillRow[];
};

// ─── Cell badges ────────────────────────────────────────────────────────────

const BADGE_BASE =
  'h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]';

function StatusBadge({ status }: { status: PFilesDrillRow['status'] }) {
  switch (status) {
    case 'On file':
      return (
        <Badge variant="success" className={BADGE_BASE}>
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          On file
        </Badge>
      );
    case 'Pending review':
      return (
        <Badge variant="muted" className={BADGE_BASE}>
          <Clock className="h-3 w-3" aria-hidden />
          Pending
        </Badge>
      );
    case 'Expired':
      return (
        <Badge variant="blocked" className={BADGE_BASE}>
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Expired
        </Badge>
      );
    case 'Missing':
      return (
        <Badge variant="blocked" className={BADGE_BASE}>
          <FileX className="h-3 w-3" aria-hidden />
          Missing
        </Badge>
      );
    case 'N/A':
      return (
        <Badge variant="outline" className={`${BADGE_BASE} border-hairline bg-muted text-ink-3`}>
          <HelpCircle className="h-3 w-3" aria-hidden />
          N/A
        </Badge>
      );
  }
}

function ExpiryCell({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    days < 0 ? 'text-destructive' :
    days <= 14 ? 'text-destructive' :
    days <= 60 ? 'text-foreground' :
    'text-muted-foreground';
  return (
    <span className={`font-mono text-sm tabular-nums ${tone}`}>
      {days < 0 ? `Expired ${-days}d` : `${days}d`}
    </span>
  );
}

// ─── Sort helpers ───────────────────────────────────────────────────────────

const CANONICAL_LEVEL_ORDER = ['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4'];
function compareLevels(a: string | null, b: string | null): number {
  const av = a ?? 'Unknown';
  const bv = b ?? 'Unknown';
  if (av === bv) return 0;
  if (av === 'Unknown') return 1;
  if (bv === 'Unknown') return -1;
  const ai = CANONICAL_LEVEL_ORDER.indexOf(av);
  const bi = CANONICAL_LEVEL_ORDER.indexOf(bv);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return av.localeCompare(bv);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Column factory ─────────────────────────────────────────────────────────

function buildColumns(visible: DrillColumnKey[]): ColumnDef<PFilesDrillRow, unknown>[] {
  const cols: ColumnDef<PFilesDrillRow, unknown>[] = [];
  for (const key of visible) {
    switch (key) {
      case 'fullName':
        cols.push({
          id: 'fullName',
          accessorKey: 'fullName',
          header: DRILL_COLUMN_LABELS.fullName,
          cell: ({ row }) => (
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">{row.original.fullName}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {row.original.enroleeNumber}
              </div>
            </div>
          ),
        });
        break;
      case 'enroleeNumber':
        cols.push({
          id: 'enroleeNumber',
          accessorKey: 'enroleeNumber',
          header: DRILL_COLUMN_LABELS.enroleeNumber,
          cell: ({ row }) => <span className="font-mono text-xs">{row.original.enroleeNumber}</span>,
        });
        break;
      case 'level':
        cols.push({
          id: 'level',
          accessorKey: 'level',
          header: DRILL_COLUMN_LABELS.level,
          cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.level ?? '—'}</span>,
          sortingFn: (a, b) => compareLevels(a.original.level, b.original.level),
        });
        break;
      case 'slotLabel':
        cols.push({
          id: 'slotLabel',
          accessorKey: 'slotLabel',
          header: DRILL_COLUMN_LABELS.slotLabel,
          cell: ({ row }) => <span className="text-sm">{row.original.slotLabel}</span>,
        });
        break;
      case 'status':
        cols.push({
          id: 'status',
          accessorKey: 'status',
          header: DRILL_COLUMN_LABELS.status,
          cell: ({ row }) => <StatusBadge status={row.original.status} />,
        });
        break;
      case 'expiryDate':
        cols.push({
          id: 'expiryDate',
          accessorKey: 'expiryDate',
          header: DRILL_COLUMN_LABELS.expiryDate,
          cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground">{formatDate(row.original.expiryDate)}</span>,
        });
        break;
      case 'daysToExpiry':
        cols.push({
          id: 'daysToExpiry',
          accessorKey: 'daysToExpiry',
          header: DRILL_COLUMN_LABELS.daysToExpiry,
          cell: ({ row }) => <ExpiryCell days={row.original.daysToExpiry} />,
          sortingFn: (a, b) => {
            const av = a.original.daysToExpiry;
            const bv = b.original.daysToExpiry;
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            return av - bv;
          },
        });
        break;
      case 'revisionCount':
        cols.push({
          id: 'revisionCount',
          accessorKey: 'revisionCount',
          header: DRILL_COLUMN_LABELS.revisionCount,
          cell: ({ row }) => <span className="font-mono text-sm tabular-nums">{row.original.revisionCount}</span>,
        });
        break;
      case 'lastRevisionAt':
        cols.push({
          id: 'lastRevisionAt',
          accessorKey: 'lastRevisionAt',
          header: DRILL_COLUMN_LABELS.lastRevisionAt,
          cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground">{formatDate(row.original.lastRevisionAt)}</span>,
        });
        break;
    }
  }
  return cols;
}

// ─── Main component ─────────────────────────────────────────────────────────

export function PFilesDrillSheet(props: PFilesDrillSheetProps) {
  const {
    target,
    segment,
    ayCode,
    initialScope = 'range',
    initialFrom,
    initialTo,
    initialRows,
  } = props;

  const seedRows = initialRows ?? [];

  const [scope, setScope] = React.useState<DrillScope>(initialScope);
  const [rows, setRows] = React.useState<PFilesDrillRow[]>(seedRows);
  const [loading, setLoading] = React.useState(seedRows.length === 0);
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = React.useState<string[]>([]);
  const [groupBy, setGroupBy] = React.useState<DrillDownGroupBy>('none');
  const [density, setDensity] = React.useState<DrillDownDensity>('comfortable');
  const [visibleColumnKeys, setVisibleColumnKeys] = React.useState<DrillColumnKey[]>(
    () => defaultColumnsForTarget(target),
  );

  const skipNextFetchRef = React.useRef(seedRows.length > 0);

  React.useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ ay: ayCode, scope });
    if (initialFrom) params.set('from', initialFrom);
    if (initialTo) params.set('to', initialTo);
    if (segment) params.set('segment', segment);
    fetch(`/api/p-files/drill/${target}?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error('drill_fetch_failed'); return r.json(); })
      .then((data: { rows: PFilesDrillRow[] }) => { if (!cancelled) setRows(data.rows ?? []); })
      .catch(() => { if (!cancelled) toast.error('Failed to load drill data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target, segment, ayCode, scope, initialFrom, initialTo]);

  // Filter options derived from unfiltered rows
  const statusOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.status);
    return Array.from(s).sort();
  }, [rows]);

  const levelOptions = React.useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.level ?? 'Unknown');
    const arr = Array.from(s);
    arr.sort(compareLevels);
    return arr;
  }, [rows]);

  // Single-pass status + level filter
  const preFiltered = React.useMemo(() => {
    if (selectedStatuses.length === 0 && selectedLevels.length === 0) return rows;
    const statusSet = new Set(selectedStatuses);
    const levelSet = new Set(selectedLevels);
    return rows.filter((r) => {
      if (selectedStatuses.length > 0 && !statusSet.has(r.status)) return false;
      if (selectedLevels.length > 0 && !levelSet.has(r.level ?? 'Unknown')) return false;
      return true;
    });
  }, [rows, selectedStatuses, selectedLevels]);

  const columns = React.useMemo(() => buildColumns(visibleColumnKeys), [visibleColumnKeys]);

  const columnOptions = React.useMemo(
    () => ALL_DRILL_COLUMNS.map((k) => ({ key: k, label: DRILL_COLUMN_LABELS[k] ?? k })),
    [],
  );

  const groupAccessor = React.useCallback(
    (row: PFilesDrillRow): string | null => {
      if (groupBy === 'none') return null;
      if (groupBy === 'level') return row.level ?? 'Unknown';
      if (groupBy === 'status') return row.status;
      if (groupBy === 'stage') return row.slotLabel; // re-use 'stage' UI for slot grouping
      return null;
    },
    [groupBy],
  );

  const header = drillHeaderForTarget(target, segment ?? null);

  if (loading && rows.length === 0) {
    return <DrillSheetSkeleton title={header.title} />;
  }

  const csvParams = new URLSearchParams({ ay: ayCode, scope, format: 'csv' });
  if (initialFrom) csvParams.set('from', initialFrom);
  if (initialTo) csvParams.set('to', initialTo);
  if (segment) csvParams.set('segment', segment);
  if (visibleColumnKeys.length) csvParams.set('columns', visibleColumnKeys.join(','));
  const csvHref = `/api/p-files/drill/${target}?${csvParams.toString()}`;

  return (
    <DrillDownSheet<PFilesDrillRow>
      title={header.title}
      eyebrow={header.eyebrow}
      count={preFiltered.length}
      csvHref={csvHref}
      columns={columns}
      rows={preFiltered}
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
      groupAccessor={groupAccessor}
      density={density}
      onDensityChange={setDensity}
      columnOptions={columnOptions}
      visibleColumnKeys={visibleColumnKeys}
      onColumnsChange={(next) => setVisibleColumnKeys(next as DrillColumnKey[])}
    />
  );
}
