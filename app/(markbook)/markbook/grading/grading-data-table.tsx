'use client';

import { CheckCircle2, Lock, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import {
  type FacetConfig,
  type StatusTabConfig,
  type MeScopeConfig,
} from '@/components/ui/data-table/types';
import { IdentifierLink } from '@/components/ui/identifier-link';
import { SortableHeader } from '@/components/ui/data-table/sortable-header';

export type GradingSheetRow = {
  id: string;
  section: string;
  level: string;
  /** 'primary' | 'secondary' — coarser-than-`level` filter axis for the
   *  School level facet. Sourced from levels.level_type. */
  school_level: 'primary' | 'secondary';
  subject: string;
  /** Subject format: true for numeric-graded (quarterly), false for the 8
   *  letter-graded subjects (MUSIC/ARTS/PE/HE/CL/CA/PEH/PMPD per KD #95). */
  is_examinable: boolean;
  term: string;
  teacher: string | null;
  /** auth user_id of the (section, subject) subject_teacher — drives the
   *  "My sheets" toggle alongside form_adviser_id. */
  subject_teacher_id?: string | null;
  /** Display name of the section's form_adviser — populates the hidden-by-
   *  default Form adviser column + faceted filter cell value. */
  form_adviser?: string | null;
  /** auth user_id of the section's form_adviser — drives "My sheets". */
  form_adviser_id?: string | null;
  is_locked: boolean;
  graded_count: number;
  total_students: number;
  graded_pct: number;
};

const BADGE_CLASS =
  'h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]';

const COLUMNS: ColumnDef<GradingSheetRow>[] = [
  {
    accessorKey: 'level',
    header: ({ column }) => (
      <SortableHeader column={column}>Level</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {row.original.level}
      </span>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      return Array.isArray(value)
        ? value.includes(row.getValue(id))
        : row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'section',
    header: ({ column }) => (
      <SortableHeader column={column}>Section</SortableHeader>
    ),
    cell: ({ row }) => (
      <IdentifierLink href={`/markbook/grading/${row.original.id}`}>
        {row.original.section}
      </IdentifierLink>
    ),
  },
  {
    accessorKey: 'subject',
    header: ({ column }) => (
      <SortableHeader column={column}>Subject</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="text-foreground">{row.original.subject}</span>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      return Array.isArray(value)
        ? value.includes(row.getValue(id))
        : row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'term',
    header: ({ column }) => (
      <SortableHeader column={column}>Term</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.term}</span>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      return Array.isArray(value)
        ? value.includes(row.getValue(id))
        : row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'school_level',
    header: 'School level',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {row.original.school_level === 'primary' ? 'Primary' : 'Secondary'}
      </span>
    ),
    filterFn: (row, _id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      const cell =
        row.original.school_level === 'primary' ? 'Primary' : 'Secondary';
      return Array.isArray(value) ? value.includes(cell) : cell === value;
    },
  },
  {
    accessorKey: 'is_examinable',
    header: 'Format',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.is_examinable ? 'Examinable' : 'Non-examinable'}
      </span>
    ),
    filterFn: (row, _id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      const cell = row.original.is_examinable ? 'Examinable' : 'Non-examinable';
      return Array.isArray(value) ? value.includes(cell) : cell === value;
    },
  },
  {
    accessorKey: 'teacher',
    header: 'Teacher',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.teacher ?? '—'}
      </span>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      // Map null teacher → "(unassigned)" pseudo-value so registrars
      // can filter to sheets that haven't been assigned yet.
      const raw = row.getValue(id);
      const cell = raw == null || raw === '' ? '(unassigned)' : raw;
      return Array.isArray(value) ? value.includes(cell) : cell === value;
    },
  },
  {
    accessorKey: 'form_adviser',
    header: 'Form adviser',
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.form_adviser ?? '—'}
      </span>
    ),
    filterFn: (row, id, value) => {
      if (!value || (Array.isArray(value) && value.length === 0)) return true;
      const raw = row.getValue(id);
      const cell = raw == null || raw === '' ? '(unassigned)' : raw;
      return Array.isArray(value) ? value.includes(cell) : cell === value;
    },
  },
  {
    accessorKey: 'graded_pct',
    header: ({ column }) => (
      <SortableHeader column={column}>Graded</SortableHeader>
    ),
    cell: ({ row }) => {
      const { graded_count, total_students, graded_pct } = row.original;
      if (total_students === 0) {
        return (
          <Badge variant="outline" className={BADGE_CLASS}>
            No students
          </Badge>
        );
      }
      const variant =
        graded_pct === 100
          ? 'success'
          : graded_pct >= 50
            ? 'warning'
            : 'blocked';
      const icon =
        graded_pct === 100 ? <CheckCircle2 className="h-3 w-3" /> : null;
      return (
        <Badge variant={variant} className={BADGE_CLASS}>
          {icon}
          {graded_count}/{total_students} · {graded_pct}%
        </Badge>
      );
    },
    sortingFn: (a, b) => a.original.graded_pct - b.original.graded_pct,
    filterFn: (row, _id, value) => {
      const { graded_pct, total_students } = row.original;
      if (value === 'incomplete') return total_students > 0 && graded_pct < 100;
      if (value === 'complete') return total_students > 0 && graded_pct === 100;
      if (value === 'empty') return total_students === 0;
      return true;
    },
  },
  {
    accessorKey: 'is_locked',
    header: 'Status',
    cell: ({ row }) =>
      row.original.is_locked ? (
        <Badge variant="blocked" className={BADGE_CLASS}>
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      ) : (
        <Badge variant="success" className={BADGE_CLASS}>
          <CheckCircle2 className="h-3 w-3" />
          Open
        </Badge>
      ),
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      if (value === 'locked') return row.getValue(id) === true;
      if (value === 'open') return row.getValue(id) === false;
      return true;
    },
  },
];

const STATUS_TABS: StatusTabConfig<GradingSheetRow>[] = [
  {
    value: 'all',
    label: 'All',
    predicate: () => true,
    isDefault: true,
  },
  {
    value: 'open',
    label: 'Open',
    predicate: (r) => !r.is_locked,
  },
  {
    value: 'locked',
    label: 'Locked',
    predicate: (r) => r.is_locked,
  },
  {
    value: 'incomplete',
    label: 'Incomplete',
    predicate: (r) => r.total_students > 0 && r.graded_pct < 100,
  },
];

export function GradingDataTable({
  data,
  initialSearch,
  teacherOptions,
  formAdviserOptions,
  currentUserId,
}: {
  data: GradingSheetRow[];
  /** Seed value for the global search input — used to deep-link from
   *  `/markbook/sections/[id]` "Grading sheets →" CTA, which passes the
   *  section name so the table opens pre-filtered to that section. The
   *  URL `?q=` param wins over this seed when present. */
  initialSearch?: string;
  /** Curated list of subject-teacher display names in the current AY.
   *  When provided, replaces the faceted unique values in the Teacher
   *  dropdown — so the dropdown lists every assigned teacher regardless
   *  of which other filters are active. Faceted "(unassigned)" pseudo
   *  is still appended when any visible row has `teacher = null`. */
  teacherOptions?: string[];
  /** Curated list of form-adviser display names in the current AY. */
  formAdviserOptions?: string[];
  /** Logged-in auth user_id — drives the "My sheets" toggle. When null
   *  the toggle hides (no teacher session, e.g. anonymous render). */
  currentUserId?: string | null;
}) {
  // Compute curated valueOptions for Teacher + Form adviser facets.
  // Include "(unassigned)" when any row has a null value for that column —
  // this mirrors the canonical reference's faceted-unique-values check.
  const teacherValueOptions = useMemo<string[] | undefined>(() => {
    if (
      !teacherOptions &&
      !data.some((r) => r.teacher == null || r.teacher === '')
    ) {
      return undefined; // let shell derive from faceted unique values
    }
    const hasUnassigned = data.some(
      (r) => r.teacher == null || r.teacher === ''
    );
    const named =
      teacherOptions && teacherOptions.length > 0
        ? [...teacherOptions]
        : Array.from(
            new Set(data.map((r) => r.teacher).filter((v): v is string => !!v))
          ).sort();
    return hasUnassigned ? [...named, '(unassigned)'] : named;
  }, [data, teacherOptions]);

  const adviserValueOptions = useMemo<string[] | undefined>(() => {
    if (
      !formAdviserOptions &&
      !data.some((r) => r.form_adviser == null || r.form_adviser === '')
    ) {
      return undefined;
    }
    const hasUnassigned = data.some(
      (r) => r.form_adviser == null || r.form_adviser === ''
    );
    const named =
      formAdviserOptions && formAdviserOptions.length > 0
        ? [...formAdviserOptions]
        : Array.from(
            new Set(
              data.map((r) => r.form_adviser).filter((v): v is string => !!v)
            )
          ).sort();
    return hasUnassigned ? [...named, '(unassigned)'] : named;
  }, [data, formAdviserOptions]);

  const facets = useMemo<FacetConfig[]>(
    () => [
      {
        columnId: 'school_level',
        label: 'School level',
        valueOptions: ['Primary', 'Secondary'],
      },
      { columnId: 'level', label: 'Level' },
      {
        columnId: 'is_examinable',
        label: 'Format',
        valueOptions: ['Examinable', 'Non-examinable'],
      },
      { columnId: 'subject', label: 'Subject' },
      { columnId: 'term', label: 'Term' },
      {
        columnId: 'teacher',
        label: 'Teacher',
        valueOptions: teacherValueOptions,
      },
      {
        columnId: 'form_adviser',
        label: 'Form adviser',
        valueOptions: adviserValueOptions,
      },
    ],
    [teacherValueOptions, adviserValueOptions]
  );

  const meScope = useMemo<MeScopeConfig<GradingSheetRow> | undefined>(() => {
    if (!currentUserId) return undefined;
    return {
      userId: currentUserId,
      label: 'My sheets',
      icon: UserCheck,
      predicate: (row, uid) =>
        row.subject_teacher_id === uid || row.form_adviser_id === uid,
    };
  }, [currentUserId]);

  return (
    <DataTable<GradingSheetRow>
      data={data}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      searchKeys={[
        'section',
        'subject',
        'term',
        'teacher',
        'form_adviser',
        'level',
      ]}
      initialSearch={initialSearch}
      searchPlaceholder="Search section, subject, teacher…"
      facets={facets}
      statusTabs={STATUS_TABS}
      meScope={meScope}
      initialSort={[
        { id: 'level', desc: false },
        { id: 'section', desc: false },
      ]}
      initialColumnVisibility={{
        form_adviser: false,
        school_level: false,
        is_examinable: false,
      }}
      pageSize={20}
      pageSizeOptions={[10, 20, 50, 100]}
      url={{ enabled: true }}
      emptyState={{
        title: 'No grading sheets yet.',
        body: 'Create the first sheet for a subject × section × term.',
      }}
      emptyFilteredState={{
        title: 'No sheets match the current filters.',
        body: 'Try clearing some filters.',
      }}
    />
  );
}
