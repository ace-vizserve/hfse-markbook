'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MovementKindPill } from '@/components/sis/movement-kind-pill';
import type { MovementEvent, MovementKind } from '@/lib/sis/movements';

// ─── Types ──────────────────────────────────────────────────────────────────

type KindTab = 'all' | MovementKind;

const KIND_TABS: Array<{ value: KindTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'section-transfer', label: 'Transfers' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'late-enrolled', label: 'Late enrolled' },
];

type ColumnKey =
  | 'student'
  | 'ay'
  | 'term'
  | 'kind'
  | 'level'
  | 'change'
  | 'date'
  | 'actor';

const ALL_COLUMNS: ColumnKey[] = [
  'student',
  'ay',
  'term',
  'kind',
  'level',
  'change',
  'date',
  'actor',
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  student: 'Student',
  ay: 'Year',
  term: 'Term',
  kind: 'Kind',
  level: 'Level',
  change: 'Section change',
  date: 'Date',
  actor: 'Recorded by',
};

// ─── Cell helpers ───────────────────────────────────────────────────────────

function studentHref(row: MovementEvent): string {
  if (row.studentNumber) {
    return `/records/students/${encodeURIComponent(row.studentNumber)}`;
  }
  return `/records/students/by-enrolee/${encodeURIComponent(row.enroleeNumber)}`;
}

// ─── Columns ────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<MovementEvent, unknown>[] {
  return ALL_COLUMNS.map((key): ColumnDef<MovementEvent, unknown> => {
    const header = COLUMN_LABELS[key];
    switch (key) {
      case 'student':
        return {
          id: 'student',
          accessorFn: (r) => r.studentName,
          header,
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
        };
      case 'ay':
        return {
          id: 'ay',
          accessorKey: 'ayCode',
          header,
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">{row.original.ayCode || '—'}</span>
          ),
          enableSorting: true,
        };
      case 'term':
        return {
          id: 'term',
          accessorFn: (r) => r.termLabel ?? '',
          header,
          cell: ({ row }) =>
            row.original.termLabel ? (
              <Badge variant="outline">{row.original.termLabel}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          enableSorting: true,
        };
      case 'kind':
        return {
          id: 'kind',
          accessorKey: 'kind',
          header,
          cell: ({ row }) => <MovementKindPill kind={row.original.kind} />,
          enableSorting: false,
          enableColumnFilter: true,
          filterFn: (row, _id, filterValue) => {
            if (!filterValue || filterValue === 'all') return true;
            return row.original.kind === filterValue;
          },
        };
      case 'level':
        return {
          id: 'level',
          accessorKey: 'level',
          header,
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">{row.original.level || '—'}</span>
          ),
          enableSorting: true,
        };
      case 'change':
        return {
          id: 'change',
          header,
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
        };
      case 'date':
        return {
          id: 'date',
          accessorKey: 'date',
          header,
          cell: ({ row }) => (
            <span className="text-sm text-foreground">
              {/* Force local-time parse — bare ISO 'yyyy-mm-dd' strings are
                  parsed as UTC midnight, which can shift one day in non-SGT
                  rendering contexts. Slash form is parsed as local time. */}
              {new Date(row.original.date.replace(/-/g, '/')).toLocaleDateString('en-SG')}
            </span>
          ),
          enableSorting: true,
        };
      case 'actor':
        return {
          id: 'actor',
          accessorFn: (r) => r.actorEmail ?? '',
          header,
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground font-mono max-w-[14rem] truncate inline-block">
              {row.original.actorEmail ?? '—'}
            </span>
          ),
          enableSorting: true,
        };
    }
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

type Props = {
  events: MovementEvent[];
  ayCode: string;
  includeAllAYs: boolean;
};

export function MovementsTable({ events, ayCode, includeAllAYs }: Props) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  const [kindTab, setKindTab] = React.useState<KindTab>('all');
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date', desc: true },
  ]);
  const [visibility, setVisibility] = React.useState<VisibilityState>({});

  const columns = React.useMemo(() => buildColumns(), []);

  const table = useReactTable<MovementEvent>({
    data: events,
    columns,
    state: {
      sorting,
      globalFilter,
      columnVisibility: visibility,
      columnFilters: [{ id: 'kind', value: kindTab }],
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '').trim().toLowerCase();
      if (!q) return true;
      const r = row.original;
      const haystack = [
        r.studentName,
        r.studentNumber ?? '',
        r.enroleeNumber,
        r.actorEmail ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    },
  });

  const visibleRows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const hasGlobalFilter = globalFilter.trim().length > 0;
  const isUnfilteredAndEmpty =
    kindTab === 'all' && !hasGlobalFilter && events.length === 0;

  const handleScopeToggle = (next: boolean) => {
    startTransition(() => {
      router.push(next ? '/records/movements?scope=all' : '/records/movements');
    });
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs value={kindTab} onValueChange={(v) => setKindTab(v as KindTab)}>
          <TabsList>
            {KIND_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search by student, ID, or actor"
          className="h-9 max-w-xs"
        />
        <div className="ml-auto flex items-center gap-3">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={visibility[k] !== false}
                  onCheckedChange={(v) =>
                    setVisibility((prev) => ({ ...prev, [k]: v === true }))
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {COLUMN_LABELS[k]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  const SortIcon =
                    sorted === 'asc'
                      ? ArrowUp
                      : sorted === 'desc'
                        ? ArrowDown
                        : ArrowUpDown;
                  if (!canSort || h.isPlaceholder) {
                    return (
                      <TableHead key={h.id}>
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    );
                  }
                  return (
                    <TableHead key={h.id}>
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4 transition-colors hover:bg-muted"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <SortIcon
                          className={
                            'size-3 ml-1 ' +
                            (sorted ? 'opacity-100 text-foreground' : 'opacity-50')
                          }
                        />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount}>
                  <div className="py-12 text-center">
                    <ArrowRightLeft className="mx-auto mb-3 size-8 text-muted-foreground" />
                    {isUnfilteredAndEmpty ? (
                      <>
                        <h3 className="font-serif text-lg text-foreground">
                          No movements yet
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Section transfers, withdrawals, and late enrolments will appear here as the registrar records them.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-serif text-lg text-foreground">
                          No movements match
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Try a different tab, clear the search, or include prior years.
                        </p>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Trust strip */}
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {ayCode} · {events.length} movement{events.length === 1 ? '' : 's'}
        {includeAllAYs ? '' : ' · current year only'}
      </p>
    </div>
  );
}
