'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MovementKindPill } from '@/components/sis/movement-kind-pill';
import type { MovementEvent, MovementKind } from '@/lib/sis/movements';

// ─── Types ──────────────────────────────────────────────────────────────────

// actor_email is rendered as-is for now.
// Name resolution would require a client-side staff cache that doesn't exist yet.
// TODO: wire displayName once lib/auth/staff-list.ts getTeacherList is
//       exposed through a client-safe hook or pre-passed from the server.

// ─── Cell helpers ───────────────────────────────────────────────────────────

function studentHref(row: MovementEvent): string {
  if (row.studentNumber) {
    return `/records/students/${encodeURIComponent(row.studentNumber)}`;
  }
  return `/records/students/by-enrolee/${encodeURIComponent(row.enroleeNumber)}`;
}

// ─── Columns ────────────────────────────────────────────────────────────────

function buildColumns(includeAllAYs: boolean): ColumnDef<MovementEvent, unknown>[] {
  return [
    {
      id: 'student',
      accessorFn: (r) => r.studentName,
      header: 'Student',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <Link
            href={studentHref(row.original)}
            className="font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4"
          >
            {row.original.studentName}
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {row.original.studentNumber ?? row.original.enroleeNumber}
          </div>
        </div>
      ),
      enableSorting: true,
      enableHiding: false,
    },
    // AY column: only facetable when scope=all
    {
      id: 'ay',
      accessorKey: 'ayCode',
      header: 'Year',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.ayCode || '—'}</span>
      ),
      enableSorting: true,
    },
    {
      id: 'term',
      accessorFn: (r) => r.termLabel ?? '',
      header: 'Term',
      cell: ({ row }) =>
        row.original.termLabel ? (
          <Badge variant="outline">{row.original.termLabel}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      enableSorting: true,
    },
    {
      id: 'kind',
      accessorKey: 'kind',
      header: 'Kind',
      cell: ({ row }) => <MovementKindPill kind={row.original.kind} />,
      enableSorting: false,
    },
    {
      id: 'level',
      accessorKey: 'level',
      header: 'Level',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.level || '—'}</span>
      ),
      enableSorting: true,
      filterFn: (row, _id, value) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return true;
        return Array.isArray(value) ? value.includes(row.original.level ?? '') : row.original.level === value;
      },
    },
    {
      id: 'change',
      header: 'Section change',
      cell: ({ row }) => {
        if (row.original.kind === 'section-transfer') {
          return (
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              {row.original.fromSection || '—'}
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              {row.original.toSection || '—'}
            </span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
      enableSorting: false,
    },
    {
      id: 'date',
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {/* Force local-time parse — bare ISO 'yyyy-mm-dd' strings are
              parsed as UTC midnight, which can shift one day in non-SGT
              rendering contexts. Slash form is parsed as local time. */}
          {new Date(row.original.date.replace(/-/g, '/')).toLocaleDateString('en-SG')}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: 'actor',
      accessorFn: (r) => r.actorEmail ?? '',
      header: 'Recorded by',
      // actor_email rendered as-is — see TODO above for displayName resolution
      cell: ({ row }) => (
        <span className="inline-block max-w-[14rem] truncate font-mono text-sm text-muted-foreground">
          {row.original.actorEmail ?? '—'}
        </span>
      ),
      enableSorting: true,
    },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────

type Props = {
  events: MovementEvent[];
  ayCode: string;
  includeAllAYs: boolean;
};

const KIND_TABS: Array<{ value: string; label: string; kind?: MovementKind }> = [
  { value: 'all', label: 'All' },
  { value: 'section-transfer', label: 'Transfers', kind: 'section-transfer' },
  { value: 'withdrawn', label: 'Withdrawn', kind: 'withdrawn' },
  { value: 'late-enrolled', label: 'Late enrolled', kind: 'late-enrolled' },
];

export function MovementsTable({ events, ayCode, includeAllAYs }: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  const handleScopeToggle = (next: boolean) => {
    startTransition(() => {
      router.push(next ? '/records/movements?scope=all' : '/records/movements');
    });
  };

  const columns = React.useMemo(() => buildColumns(includeAllAYs), [includeAllAYs]);

  const statusTabs = KIND_TABS.map((t) => ({
    value: t.value,
    label: t.label,
    isDefault: t.value === 'all',
    predicate: (row: MovementEvent) => (t.kind ? row.kind === t.kind : true),
  }));

  const facets = React.useMemo(() => {
    const f: Array<{ columnId: string; label: string }> = [
      { columnId: 'level', label: 'Level' },
    ];
    if (includeAllAYs) {
      f.push({ columnId: 'ay', label: 'Year' });
    }
    return f;
  }, [includeAllAYs]);

  const toolbarLeading = (
    <div className="flex items-center gap-2">
      <Switch
        id="include-all-ays"
        checked={includeAllAYs}
        onCheckedChange={(v) => handleScopeToggle(v)}
      />
      <Label
        htmlFor="include-all-ays"
        className="cursor-pointer text-sm text-muted-foreground"
      >
        Include prior years
      </Label>
    </div>
  );

  return (
    <div className="space-y-3">
      <DataTable<MovementEvent>
        data={events}
        columns={columns}
        getRowId={(row) => `${row.ayCode}-${row.date}-${row.enroleeNumber}-${row.kind}`}
        searchKeys={[
          (r) => r.studentName,
          (r) => r.studentNumber ?? '',
          (r) => r.enroleeNumber,
          (r) => r.actorEmail ?? '',
        ]}
        searchPlaceholder="Search by student, ID, or actor"
        facets={facets}
        statusTabs={statusTabs}
        toolbarLeading={toolbarLeading}
        initialSort={[{ id: 'date', desc: true }]}
        pageSize={25}
        csv={{ filename: `movements-${ayCode}.csv` }}
        emptyState={{
          icon: ArrowRightLeft,
          title: 'No movements yet.',
          body: 'Section transfers, withdrawals, and late enrolments will appear here as the registrar records them.',
        }}
        emptyFilteredState={{
          title: 'No movements match.',
          body: 'Try a different tab, clear the search, or include prior years.',
        }}
      />

      {/* Trust strip */}
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {ayCode} · {events.length} movement{events.length === 1 ? '' : 's'}
        {includeAllAYs ? '' : ' · current year only'}
      </p>
    </div>
  );
}
