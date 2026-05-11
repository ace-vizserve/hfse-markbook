'use client';

import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { ChartLegendChip } from '@/components/dashboard/chart-legend-chip';
import type { CohortStudentRow, CohortScope } from '@/lib/sis/cohorts';

// ─── Re-export the STP row type for consumer convenience ────────────────────

export type { CohortStudentRow as StpCohortRow };

// ─── Stub row shapes for the 3 kinds not yet implemented ────────────────────
// The follow-up dispatch will replace these with real types.

type PromisedRow = unknown;
type PassExpiryRow = unknown;
type MedicalRow = unknown;

// ─── Public API ─────────────────────────────────────────────────────────────

export type CohortKind = 'stp' | 'promised' | 'pass-expiry' | 'medical';
export type { CohortScope };

type CohortRowMap = {
  stp: CohortStudentRow;
  promised: PromisedRow;
  'pass-expiry': PassExpiryRow;
  medical: MedicalRow;
};

export type CohortTableProps<K extends CohortKind> = {
  kind: K;
  scope: CohortScope;
  ayCode: string;
  rows: Array<CohortRowMap[K]>;
};

// ─── STP slot pill ───────────────────────────────────────────────────────────

function slotChipColor(status: string | null | undefined) {
  const s = (status ?? '').trim();
  if (s === 'Valid') return 'fresh' as const;
  if (s === 'Uploaded') return 'primary' as const;
  if (s === 'Rejected' || s === 'Expired') return 'very-stale' as const;
  if (s === 'Pending') return 'stale' as const;
  return 'neutral' as const;
}

function SlotPill({ status, label }: { status: string | null | undefined; label: string }) {
  const display = (status ?? '').trim() || '—';
  return <ChartLegendChip color={slotChipColor(status)} label={`${label} · ${display}`} />;
}

// ─── STP detail href resolver ─────────────────────────────────────────────────

function stpDetailHref(row: CohortStudentRow, scope: CohortScope, ayCode: string): string {
  if (scope === 'enrolled' && row.studentNumber) {
    return `/records/students/${encodeURIComponent(row.studentNumber)}`;
  }
  const params = new URLSearchParams({ ay: ayCode, tab: 'lifecycle' });
  return `/admissions/applications/${encodeURIComponent(row.enroleeNumber)}?${params.toString()}`;
}

// ─── STP column builder ───────────────────────────────────────────────────────

function buildStpColumns(scope: CohortScope, ayCode: string): ColumnDef<CohortStudentRow>[] {
  return [
    {
      id: 'student',
      accessorFn: (r) => r.enroleeFullName ?? r.enroleeNumber,
      header: 'Student',
      cell: ({ row }) => (
        <Link
          href={stpDetailHref(row.original, scope, ayCode)}
          className="block space-y-0.5 hover:underline"
        >
          <div className="font-medium text-foreground">
            {row.original.enroleeFullName ?? '—'}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {row.original.enroleeNumber}
            {row.original.studentNumber ? ` · ${row.original.studentNumber}` : ''}
          </div>
        </Link>
      ),
      enableSorting: true,
    },
    {
      id: 'levelApplied',
      accessorKey: 'levelApplied',
      header: 'Level',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.levelApplied ?? '—'}</span>
      ),
      enableSorting: true,
    },
    {
      id: 'stpType',
      accessorKey: 'stpApplicationType',
      header: 'STP type',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.stpApplicationType ?? '—'}</span>
      ),
      enableSorting: true,
    },
    {
      id: 'icaPhoto',
      accessorKey: 'icaPhotoStatus',
      header: 'ICA Photo',
      cell: ({ row }) => <SlotPill status={row.original.icaPhotoStatus} label="ICA" />,
      enableSorting: true,
    },
    {
      id: 'financialSupport',
      accessorKey: 'financialSupportDocsStatus',
      header: 'Financial support',
      cell: ({ row }) => (
        <SlotPill status={row.original.financialSupportDocsStatus} label="Fin." />
      ),
      enableSorting: true,
    },
    {
      id: 'vaccination',
      accessorKey: 'vaccinationInformationStatus',
      header: 'Vaccination',
      cell: ({ row }) => (
        <SlotPill status={row.original.vaccinationInformationStatus} label="Vac." />
      ),
      enableSorting: true,
    },
    {
      id: 'residence',
      accessorFn: (r) => (r.residenceHistoryFilled ? 1 : 0),
      header: 'Residence',
      cell: ({ row }) =>
        row.original.residenceHistoryFilled ? (
          <Badge variant="success">Filled</Badge>
        ) : (
          <Badge variant="warning">Missing</Badge>
        ),
      enableSorting: true,
    },
    {
      id: 'stpComplete',
      accessorFn: (r) => (r.stpComplete ? 1 : 0),
      header: 'STP complete',
      cell: ({ row }) =>
        row.original.stpComplete ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <Badge variant="blocked">No</Badge>
        ),
      enableSorting: true,
    },
    {
      id: 'applicationStatus',
      accessorKey: 'applicationStatus',
      header: 'App status',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.applicationStatus ?? '—'}</Badge>
      ),
      enableSorting: true,
    },
  ];
}

// ─── Stub column builders — follow-up dispatch fills these in ────────────────

function buildPromisedColumns(_scope: CohortScope, _ayCode: string): ColumnDef<PromisedRow>[] {
  throw new Error('CohortTable kind="promised" not implemented in this dispatch');
}

function buildPassExpiryColumns(_scope: CohortScope, _ayCode: string): ColumnDef<PassExpiryRow>[] {
  throw new Error('CohortTable kind="pass-expiry" not implemented in this dispatch');
}

function buildMedicalColumns(_scope: CohortScope, _ayCode: string): ColumnDef<MedicalRow>[] {
  throw new Error('CohortTable kind="medical" not implemented in this dispatch');
}

// ─── STP status-tab config ────────────────────────────────────────────────────

const STP_STATUS_TABS = [
  {
    value: 'incomplete',
    label: 'Incomplete',
    predicate: (r: CohortStudentRow) => r.stpComplete !== true,
    isDefault: true,
  },
  {
    value: 'complete',
    label: 'Complete',
    predicate: (r: CohortStudentRow) => r.stpComplete === true,
  },
  {
    value: 'all',
    label: 'All',
    predicate: (_r: CohortStudentRow) => true,
  },
] as const;

const STP_FACETS = [
  { columnId: 'levelApplied', label: 'Level' },
  { columnId: 'stpType', label: 'STP type' },
  { columnId: 'applicationStatus', label: 'App status' },
];

const STP_EMPTY_STATE = {
  title: 'No STP applicants yet.',
  body: 'Students whose application requires a Student Pass will appear here.',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function CohortTable<K extends CohortKind>(props: CohortTableProps<K>) {
  const { kind, scope, ayCode, rows } = props;

  if (kind === 'stp') {
    const stpRows = rows as CohortStudentRow[];
    return (
      <DataTable<CohortStudentRow>
        data={stpRows}
        columns={buildStpColumns(scope, ayCode)}
        getRowId={(r) => r.enroleeNumber}
        searchKeys={['enroleeFullName', 'enroleeNumber', 'studentNumber']}
        searchPlaceholder="Search students…"
        facets={STP_FACETS}
        statusTabs={STP_STATUS_TABS as unknown as Array<import('@/components/ui/data-table/types').StatusTabConfig<CohortStudentRow>>}
        pageSize={25}
        csv={{ filename: `stp-cohort-${ayCode}.csv` }}
        url={{ enabled: true }}
        emptyState={STP_EMPTY_STATE}
        emptyFilteredState={{ title: 'No matches for current filters.' }}
      />
    );
  }

  if (kind === 'promised') {
    return (
      <DataTable<PromisedRow>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={rows as any[]}
        columns={buildPromisedColumns(scope, ayCode)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getRowId={(r: any) => r.enroleeNumber}
      />
    );
  }

  if (kind === 'pass-expiry') {
    return (
      <DataTable<PassExpiryRow>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={rows as any[]}
        columns={buildPassExpiryColumns(scope, ayCode)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getRowId={(r: any) => r.enroleeNumber}
      />
    );
  }

  // kind === 'medical'
  return (
    <DataTable<MedicalRow>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data={rows as any[]}
      columns={buildMedicalColumns(scope, ayCode)}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getRowId={(r: any) => r.enroleeNumber}
    />
  );
}
