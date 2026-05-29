'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  StaffAssignmentSheet,
  type StaffSheetTeacher,
} from '@/components/sis/staff-assignment-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import type { StaffRow } from '@/lib/sis/staff';

type AssignmentFilter = 'all' | 'adviser' | 'subject-only' | 'unassigned';

export function StaffTable({
  rows,
  ayCode,
}: {
  rows: StaffRow[];
  ayCode: string;
}) {
  const [nameSearch, setNameSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedTeacher, setSelectedTeacher] =
    useState<StaffSheetTeacher | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function openSheet(row: StaffRow) {
    if (row.disabled) return;
    setSelectedTeacher({
      userId: row.userId,
      name: row.name,
      email: row.email,
    });
    setSheetOpen(true);
  }

  // Counts computed from active (non-disabled) teachers only.
  const chipCounts = useMemo(() => {
    const active = rows.filter((r) => !r.disabled);
    return {
      all: active.length,
      // Has a form class — may also have subject assignments.
      adviser: active.filter((r) => r.fcaSection !== null).length,
      // Has subject assignments but no form class.
      subjectOnly: active.filter(
        (r) => r.fcaSection === null && r.subjectAssignments.length > 0
      ).length,
      // No assignments of any kind — the actionable gap.
      unassigned: active.filter(
        (r) => r.fcaSection === null && r.subjectAssignments.length === 0
      ).length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let r = showDisabled ? rows : rows.filter((row) => !row.disabled);
    if (nameSearch) {
      const q = nameSearch.toLowerCase();
      r = r.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          row.email.toLowerCase().includes(q)
      );
    }
    if (assignmentFilter === 'adviser')
      r = r.filter((row) => row.fcaSection !== null);
    if (assignmentFilter === 'subject-only')
      r = r.filter(
        (row) => row.fcaSection === null && row.subjectAssignments.length > 0
      );
    if (assignmentFilter === 'unassigned')
      r = r.filter(
        (row) => row.fcaSection === null && row.subjectAssignments.length === 0
      );
    return r;
  }, [rows, nameSearch, assignmentFilter, showDisabled]);

  const columns: ColumnDef<StaffRow>[] = [
    {
      accessorKey: 'name',
      header: 'Teacher',
      cell: ({ row }) => (
        <div>
          <p
            className={
              row.original.disabled
                ? 'text-sm text-muted-foreground line-through'
                : 'text-sm font-medium text-foreground'
            }
          >
            {row.original.name}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: 'fcaSection',
      header: 'FCA Section',
      cell: ({ row }) => {
        const fca = row.original.fcaSection;
        if (!fca)
          return <span className="text-sm text-muted-foreground">—</span>;
        return <Badge variant="secondary">{fca.name}</Badge>;
      },
    },
    {
      id: 'subjectAssignments',
      header: 'Subjects Taught',
      cell: ({ row }) => {
        const subs = row.original.subjectAssignments;
        if (subs.length === 0)
          return <span className="text-sm text-muted-foreground">—</span>;
        const visible = subs.slice(0, 3);
        const extra = subs.length - 3;
        return (
          <div className="flex flex-wrap gap-1">
            {visible.map((a) => (
              <span
                key={a.assignmentId}
                className="inline-flex items-center rounded-md border border-hairline bg-muted px-2 py-0.5 font-mono text-[11px]"
              >
                {a.subjectCode}&thinsp;·&thinsp;{a.sectionName}
              </span>
            ))}
            {extra > 0 && (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                +{extra} more
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'load',
      header: 'Load',
      cell: ({ row }) => {
        const fca = row.original.fcaSection ? '1 FCA' : null;
        const n = row.original.subjectAssignments.length;
        const subs = n > 0 ? `${n} subject${n === 1 ? '' : 's'}` : null;
        const parts = [fca, subs].filter(Boolean).join(' + ');
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {parts || 'No assignments'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={row.original.disabled}
          onClick={() => openSheet(row.original)}
          aria-label={`Edit assignments for ${row.original.name}`}
        >
          <ChevronRight className="size-4" />
        </Button>
      ),
    },
  ];

  const chipDefs: {
    key: AssignmentFilter;
    label: string;
    count: number;
    warn?: boolean;
  }[] = [
    { key: 'all', label: 'All', count: chipCounts.all },
    { key: 'adviser', label: 'Form Adviser', count: chipCounts.adviser },
    {
      key: 'subject-only',
      label: 'Subject Only',
      count: chipCounts.subjectOnly,
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      count: chipCounts.unassigned,
      warn: chipCounts.unassigned > 0,
    },
  ];

  return (
    <>
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              className="h-8 w-64 pl-8 text-sm"
            />
            {nameSearch && (
              <button
                type="button"
                onClick={() => setNameSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {chipDefs.map(({ key, label, count, warn }) => {
              const active = assignmentFilter === key;
              const warnActive = warn && active;
              const warnInactive = warn && !active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAssignmentFilter(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    warnActive
                      ? 'border-brand-amber/50 bg-gradient-to-b from-brand-amber/20 to-brand-amber/8 text-brand-amber'
                      : warnInactive
                        ? 'border-brand-amber/30 bg-gradient-to-b from-brand-amber/10 to-brand-amber/4 text-brand-amber hover:border-brand-amber/50'
                        : active
                          ? 'border-brand-indigo/40 bg-gradient-to-b from-brand-indigo/15 to-brand-indigo/5 text-brand-indigo'
                          : 'border-border bg-card text-muted-foreground hover:border-brand-indigo/40 hover:text-foreground'
                  }`}
                >
                  {label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowDisabled((v) => !v)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold transition-colors ${
              showDisabled
                ? 'border-brand-indigo/40 bg-gradient-to-b from-brand-indigo/15 to-brand-indigo/5 text-brand-indigo'
                : 'border-border bg-card text-muted-foreground hover:border-brand-indigo/40 hover:text-foreground'
            }`}
          >
            {showDisabled ? 'Hide disabled' : 'Show disabled'}
          </button>
        </div>

        <DataTable
          columns={columns}
          data={filteredRows}
          getRowId={(row) => row.userId}
          hidePagination={filteredRows.length <= 20}
          emptyState={{
            title: 'No teachers found',
            body: 'Add staff accounts via Users.',
          }}
        />
      </div>

      <StaffAssignmentSheet
        teacher={selectedTeacher}
        ayCode={ayCode}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
