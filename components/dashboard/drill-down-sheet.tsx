'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * DrillDownSheet — generic Sheet body rendered inside the `drillSheet` slot of
 * `MetricCard`. The parent provides the `<Sheet>` + `<SheetTrigger>`; this
 * component renders the `<SheetContent>` with a header / filters / table
 * layout. Columns + rows are supplied per drill-down target.
 *
 * The component ships with a universal toolkit of filter controls — range
 * scope, status / level multi-selects, group-by, density, and column
 * visibility. All toolkit props are optional; when absent the relevant
 * control is hidden.
 */
export type DrillDownScope = 'range' | 'ay' | 'all';
export type DrillDownGroupBy = 'none' | 'level' | 'status' | 'stage';
export type DrillDownDensity = 'comfortable' | 'compact';

export type DrillDownColumnOption = {
  key: string;
  label: string;
};

export type DrillDownSheetProps<T> = {
  // --- Existing (unchanged) -----------------------------------------------
  title: string;
  eyebrow: string;
  count: number;
  csvHref: string;
  csvFilename?: string;
  columns: ColumnDef<T, unknown>[];
  rows: T[];
  filters?: React.ReactNode;
  searchable?: boolean;
  emptyMessage?: string;

  // --- Range scope (controlled) -------------------------------------------
  scope?: DrillDownScope;
  onScopeChange?: (scope: DrillDownScope) => void;

  // --- Status multi-select -------------------------------------------------
  statusOptions?: string[];
  selectedStatuses?: string[];
  onStatusesChange?: (next: string[]) => void;

  // --- Level multi-select --------------------------------------------------
  levelOptions?: string[];
  selectedLevels?: string[];
  onLevelsChange?: (next: string[]) => void;

  // --- Group by ------------------------------------------------------------
  groupBy?: DrillDownGroupBy;
  onGroupByChange?: (g: DrillDownGroupBy) => void;
  /** Defaults to true. When false, the group-by tabs are hidden entirely. */
  showGroupBy?: boolean;
  /**
   * Resolves a row to its group key. Without this prop, group-by silently
   * no-ops even when `groupBy !== 'none'` — callers opt into grouping by
   * supplying an accessor that maps a row to the bucket label.
   */
  groupAccessor?: (row: T) => string | null;

  // --- Density toggle ------------------------------------------------------
  density?: DrillDownDensity;
  onDensityChange?: (d: DrillDownDensity) => void;
  /** Defaults to true. When false, the density toggle is hidden entirely. */
  showDensity?: boolean;

  // --- Column visibility ---------------------------------------------------
  columnOptions?: DrillDownColumnOption[];
  visibleColumnKeys?: string[];
  onColumnsChange?: (next: string[]) => void;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function defaultCsvFilename(title: string): string {
  const slug = slugify(title) || 'drill';
  const yyyyMmDd = new Date().toISOString().slice(0, 10);
  return `drill-${slug}-${yyyyMmDd}.csv`;
}

/**
 * Best-effort column id resolver. `react-table` uses `id` first, falling back
 * to `accessorKey` (when the column was declared as an accessor column). We
 * mirror that here so callers can pass either form in `columnOptions`.
 */
function getColumnKey<T>(column: ColumnDef<T, unknown>): string | undefined {
  if (typeof column.id === 'string' && column.id.length > 0) return column.id;
  // accessorKey only exists on accessor columns; cast narrowly.
  const ak = (column as { accessorKey?: unknown }).accessorKey;
  if (typeof ak === 'string' && ak.length > 0) return ak;
  return undefined;
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value)
    ? arr.filter((v) => v !== value)
    : [...arr, value];
}

const SCOPE_TABS: Array<{ value: DrillDownScope; label: string }> = [
  { value: 'range', label: 'This range' },
  { value: 'ay', label: 'Current AY' },
  { value: 'all', label: 'All time' },
];

const GROUP_BY_TABS: Array<{ value: DrillDownGroupBy; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'level', label: 'Level' },
  { value: 'status', label: 'Status' },
  { value: 'stage', label: 'Stage' },
];

export function DrillDownSheet<T>({
  title,
  eyebrow,
  count,
  csvHref,
  csvFilename,
  columns,
  rows,
  filters,
  searchable = true,
  emptyMessage = 'No rows to show for this filter.',

  scope,
  onScopeChange,

  statusOptions,
  selectedStatuses,
  onStatusesChange,

  levelOptions,
  selectedLevels,
  onLevelsChange,

  groupBy,
  onGroupByChange,
  showGroupBy = true,
  groupAccessor,

  density,
  onDensityChange,
  showDensity = true,

  columnOptions,
  visibleColumnKeys,
  onColumnsChange,
}: DrillDownSheetProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  // Filter columns by visibility before handing to react-table so the table
  // header / cells stay in lock-step with the columns dropdown.
  const effectiveColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!visibleColumnKeys) return columns;
    const allow = new Set(visibleColumnKeys);
    return columns.filter((c) => {
      const key = getColumnKey(c);
      // Columns without a resolvable key always render — they can't be toggled.
      if (!key) return true;
      return allow.has(key);
    });
  }, [columns, visibleColumnKeys]);

  const table = useReactTable<T>({
    data: rows,
    columns: effectiveColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const filename = csvFilename ?? defaultCsvFilename(title);
  const visibleRows = table.getRowModel().rows;
  const visibleColCount = table.getVisibleLeafColumns().length;

  // --- Group rows --------------------------------------------------------
  // When groupBy is active and an accessor is supplied, we partition the
  // already-sorted row model by group key while preserving relative order
  // (so within-group sort by the active sortingState is honoured). Groups
  // appear in first-seen order — predictable enough for callers without
  // imposing alphabetical reordering on top of their sort intent.
  const grouped = React.useMemo(() => {
    if (!groupBy || groupBy === 'none' || !groupAccessor) return null;
    const buckets = new Map<string, typeof visibleRows>();
    for (const row of visibleRows) {
      const raw = groupAccessor(row.original);
      const key = raw == null || raw === '' ? '—' : raw;
      const list = buckets.get(key);
      if (list) {
        list.push(row);
      } else {
        buckets.set(key, [row]);
      }
    }
    return Array.from(buckets.entries());
  }, [groupBy, groupAccessor, visibleRows]);

  // --- Density classes ---------------------------------------------------
  const densityClass =
    density === 'compact' ? '[&_td]:py-1 [&_th]:py-1' : '';

  // --- Toolkit visibility flags -----------------------------------------
  const showScope = scope !== undefined && Boolean(onScopeChange);
  const showStatus = Array.isArray(statusOptions) && statusOptions.length > 0;
  const showLevel = Array.isArray(levelOptions) && levelOptions.length > 0;
  const showGroupByCtl = showGroupBy && groupBy !== undefined && Boolean(onGroupByChange);
  const showDensityCtl = showDensity && density !== undefined && Boolean(onDensityChange);
  const showColumns =
    Array.isArray(columnOptions) && columnOptions.length > 0;

  const showRow1 = searchable || showScope || Boolean(filters);
  const showRow2 =
    showStatus || showLevel || showGroupByCtl || showDensityCtl || showColumns;
  const showFilterBar = showRow1 || showRow2;

  const statusSelected = selectedStatuses ?? [];
  const levelSelected = selectedLevels ?? [];
  const visibleColsSelected =
    visibleColumnKeys ?? (columnOptions?.map((c) => c.key) ?? []);

  return (
    <SheetContent
      side="right"
      className="sm:max-w-3xl w-full flex flex-col gap-0 p-0"
    >
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <Badge variant="outline">
            {count.toLocaleString('en-SG')} rows
          </Badge>
        </div>
      </div>

      {/* Filter bar — Row 1 (search + scope + CSV) and Row 2 (secondary) */}
      {showFilterBar && (
        <div className="flex flex-col gap-3 border-b border-border px-6 py-3">
          {showRow1 && (
            <div className="flex items-center gap-3">
              {searchable && (
                <Input
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder="Search rows"
                  className="h-9 max-w-xs"
                />
              )}
              {showScope && scope && (
                <Tabs
                  value={scope}
                  onValueChange={(v) => onScopeChange?.(v as DrillDownScope)}
                >
                  <TabsList variant="segmented">
                    {SCOPE_TABS.map((t) => (
                      <TabsTrigger key={t.value} value={t.value}>
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              <div className="ml-auto flex items-center gap-2">
                {filters}
                <Button asChild size="sm" variant="outline">
                  <a href={csvHref} download={filename}>
                    <Download className="size-3.5" />
                    Download CSV
                  </a>
                </Button>
              </div>
            </div>
          )}

          {showRow2 && (
            <div className="flex flex-wrap items-center gap-2">
              {showStatus && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Status
                      {statusSelected.length > 0 && (
                        <Badge variant="muted" className="ml-1">
                          {statusSelected.length}
                        </Badge>
                      )}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[12rem]">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {statusOptions!.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={opt}
                        checked={statusSelected.includes(opt)}
                        onCheckedChange={() =>
                          onStatusesChange?.(toggleInArray(statusSelected, opt))
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {opt}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {showLevel && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Level
                      {levelSelected.length > 0 && (
                        <Badge variant="muted" className="ml-1">
                          {levelSelected.length}
                        </Badge>
                      )}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[12rem]">
                    <DropdownMenuLabel>Level</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {levelOptions!.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={opt}
                        checked={levelSelected.includes(opt)}
                        onCheckedChange={() =>
                          onLevelsChange?.(toggleInArray(levelSelected, opt))
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {opt}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {showGroupByCtl && groupBy && (
                <Tabs
                  value={groupBy}
                  onValueChange={(v) => onGroupByChange?.(v as DrillDownGroupBy)}
                >
                  <TabsList variant="segmented">
                    {GROUP_BY_TABS.map((t) => (
                      <TabsTrigger key={t.value} value={t.value}>
                        {t.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              {showDensityCtl && density && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onDensityChange?.(
                      density === 'compact' ? 'comfortable' : 'compact',
                    )
                  }
                >
                  {density === 'compact' ? 'Compact' : 'Comfortable'}
                </Button>
              )}

              {showColumns && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-auto">
                      Columns
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columnOptions!.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={opt.key}
                        checked={visibleColsSelected.includes(opt.key)}
                        onCheckedChange={() =>
                          onColumnsChange?.(
                            toggleInArray(visibleColsSelected, opt.key),
                          )
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {visibleRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <Table noWrapper className={densityClass}>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                  {hg.headers.map((h) => {
                    const canSort = h.column.getCanSort();
                    const sorted = h.column.getIsSorted();
                    const label = h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext());
                    if (!canSort || h.isPlaceholder) {
                      return <TableHead key={h.id}>{label}</TableHead>;
                    }
                    const SortIcon =
                      sorted === 'asc'
                        ? ArrowUp
                        : sorted === 'desc'
                          ? ArrowDown
                          : ArrowUpDown;
                    return (
                      <TableHead
                        key={h.id}
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="-ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4 transition-colors hover:bg-muted"
                        >
                          {label}
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
              {grouped
                ? grouped.map(([groupName, groupRows]) => (
                    <React.Fragment key={`grp-${groupName}`}>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell
                          colSpan={visibleColCount}
                          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4"
                        >
                          {groupName} <span className="text-ink-5">·</span>{' '}
                          <span className="text-foreground">
                            {groupRows.length.toLocaleString('en-SG')}
                          </span>
                        </TableCell>
                      </TableRow>
                      {groupRows.map((row) => (
                        <TableRow key={row.id}>
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))
                : visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}
      </div>
    </SheetContent>
  );
}
