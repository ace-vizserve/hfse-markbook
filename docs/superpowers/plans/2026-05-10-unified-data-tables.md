# Unified Data Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended for Phase 2's parallel worktrees) or superpowers:executing-plans for sequential phases. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land one shared `<DataTable>` shell + 2 consolidation wrappers (`<CohortTable>`, `<DocumentCompletenessTable>`) + `<StatusBadge>` family + `<IdentifierLink>` primitive across the SIS so 24 surfaces (12 data tables + 12 static lists) share identical toolbar / pagination / empty-state / status-badge / linkified-identifier semantics. Eliminate 5 inlined `SortableHeader` copies, 6 inlined pagination blocks, 3 inlined sticky bulk-action footers, 5 status badge implementations, 4 cohort table files, 2 completeness table clones, and 8 KD #81 violations.

**Architecture:** UI/composition only — no new mutation API routes, no new server endpoints, no schema migrations. Shell at `components/ui/data-table/index.tsx` wraps `@tanstack/react-table` (KD #15). Two wrappers (`<CohortTable kind>`, `<DocumentCompletenessTable module>`) consume the shell with kind/module-discriminated column builders. Status badges centralised through `<StatusBadge tone>` + 4 domain wrappers. Plain-English copy registry at `lib/copy/data-table.ts`. URL state via `useUrlState` hook with optional namespace. Spec lives at `docs/superpowers/specs/2026-05-10-unified-data-tables-design.md` — every per-table task references the matching §5.X for column proposals + filters + status tabs + empty-state copy.

**Tech Stack:** Next.js 16 App Router · React 19 · `@tanstack/react-table` (KD #15) · sonner toasts via sileo shim (KD #58) · shadcn primitives (Card, Table, Badge, DropdownMenu, Select, Sheet, Tooltip, Switch) · Tailwind v4 · Aurora Vault tokens from `app/globals.css` (Hard Rule #7). **No test framework** — verification per task is `npx next build` (clean compile) + manual smoke test (URL-state round-trip, empty state, filter clear, pagination, status tab counts).

**Branch:** Phase 0 + Phase 1 land on `main` directly (each task commits independently). Phase 2 dispatches 3 parallel git worktrees (one per module group); each worktree merges back via PR after `feature-dev:code-reviewer` review per the user's stated preference. Phase 3 lands on `main`.

**Key locked decisions** (from spec § 4 + § 6):

1. Shell is **composition-only**; per-row overflow menus + net-new bulk API routes deferred. Existing bulk patterns (P-Files chase, admissions chase, Promised cohort) get generalised through the `selection.bulkActions` slot.
2. **5.21 + 5.23** (admissions + p-files completeness) ship in Phase 1 via `<DocumentCompletenessTable>`. **5.17–5.20** (4 cohorts) ship in Phase 1 via `<CohortTable>`. **5.1** (grading-data-table) ships in Phase 0 as the validation pass.
3. Phase 2 worktrees split by module group: **markbook-tables** (5.2–5.8 = 7 surfaces), **records-sis-admin-tables** (5.9–5.16 = 8 surfaces), **admissions-attendance-tables** (5.22 + 5.24 = 2 surfaces). 17 surfaces total in Phase 2; sum across all phases = 24, matching spec § 3.
4. Markbook change-requests JOIN expansion (5.2 + 5.8 promoted columns) is **out of scope this pass** — requires server-side loader change. Tables migrate without those columns; loader change is a separate ticket.
5. Per-table acceptance: 8-item checklist (spec § 6.2) — shell consumed, identifier linkified, status badges migrated, plain-English copy applied, URL-state round-trip verified, both empty states render, `npx next build` clean, no Hard Rule #7 token violations.
6. KD #81 destination map (spec § 4.8) is the source of truth for `<IdentifierLink>` href construction. The `<IdentifierLink>` primitive applies the canonical `font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4` styling.
7. Plain-English copy registry (spec § 4.6) seeded with 13 entries on Phase 0; per-worktree authors extend in Phase 2 as new jargon surfaces.

**Migration sequencing summary:**

```
Phase 0 (sequential, on main, ~17 tasks)
  ├── Tasks 1-5: Status badge family (StatusBadge + 4 domain wrappers)
  ├── Task 6:    <IdentifierLink>
  ├── Task 7:    lib/copy/data-table.ts
  ├── Tasks 8-15: 8 building blocks (use-url-state, sortable-header, facet-dropdown,
  │              filter-chip, pagination, bulk-action-footer, empty-state, csv)
  ├── Task 16:   <DataTable> shell (index.tsx)
  └── Task 17:   Validation pass — refactor grading-data-table.tsx (spec § 5.1)

Phase 1 (sequential, on main, ~2 tasks)
  ├── Task 18:   <CohortTable kind> + migrate 4 cohort tables (spec § 5.17–5.20)
  └── Task 19:   <DocumentCompletenessTable module> + migrate 2 completeness tables
                 (spec § 5.21 + 5.23)

Phase 2 (parallel, 3 worktrees, ~17 tasks)
  ├── Worktree A markbook-tables (Tasks 20-26):
  │              5.2 change-requests, 5.3 audit-log, 5.4 all-publications,
  │              5.5 attendance-readonly, 5.6 sections/[id]/roster,
  │              5.7 report-cards, 5.8 grading/requests
  ├── Worktree B records-sis-admin-tables (Tasks 27-34):
  │              5.9 student-data-table, 5.10 movements, 5.11 section-roster,
  │              5.12 users-admin, 5.13 sync-students, 5.14 ay-setup,
  │              5.15 discount-codes, 5.16 approvers
  └── Worktree C admissions-attendance-tables (Tasks 35-36):
                 5.22 outdated-applications, 5.24 attendance audit-log

Phase 3 (sequential, on main, 1 task)
  └── Task 37:   Final integration — merge all 3 worktrees, cross-module
                 smoke pass, /sync-docs, KD #84 entry
```

---

## Phase 0 — Foundations + validation pass

**Where:** `main` branch directly. Each task commits independently with the message format documented per task.

**Stopping rule:** If Task 17 (grading-data-table refactor) cannot reproduce the canonical reference 1:1, fix the shell — do NOT alter `grading-data-table.tsx`'s observable behavior. The validation pass is the contract.

---

## Task 1: Build `<StatusBadge>` primitive

**Files:**
- Create: `components/ui/status-badge.tsx`

This primitive encodes the design system § 9.3 status recipes once. Tone-tinted gradient + ring-inset on the badge body; mono uppercase text per design system § 7. Replaces 5 scattered status badge implementations.

- [ ] **Step 1: Write `components/ui/status-badge.tsx`**

```tsx
import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusTone = 'healthy' | 'locked' | 'info' | 'muted' | 'warning';

const TONE_CLASS: Record<StatusTone, string> = {
  healthy:
    'bg-gradient-to-b from-brand-mint/15 to-brand-mint/5 text-brand-mint ring-inset ring-1 ring-brand-mint/30',
  locked:
    'bg-gradient-to-b from-destructive/15 to-destructive/5 text-destructive ring-inset ring-1 ring-destructive/30',
  info:
    'bg-gradient-to-b from-accent/20 to-accent/5 text-accent-foreground ring-inset ring-1 ring-accent/30',
  muted:
    'bg-muted text-muted-foreground ring-inset ring-1 ring-border',
  warning:
    'bg-gradient-to-b from-brand-amber/15 to-brand-amber/5 text-brand-amber ring-inset ring-1 ring-brand-amber/30',
};

type StatusBadgeProps = {
  tone: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
};

export function StatusBadge({ tone, icon: Icon, className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      <span>{children}</span>
    </span>
  );
}
```

- [ ] **Step 2: Verify**

Run `npx next build` — must compile clean. Visually inspect via temp snippet (later swept up by Task 17): mount each tone in `/markbook/grading` page header to eyeball gradient + ring + mono caps.

- [ ] **Step 3: Commit**

```
feat(ui): add <StatusBadge> primitive — single source for §9.3 status recipes
```

---

## Task 2: Build `<ApplicationStatusBadge>` domain wrapper

**Files:**
- Read: any existing `application-status-badge.tsx` to capture current domain mapping
- Modify or Create: `components/ui/application-status-badge.tsx`

This wrapper maps `applicationStatus` enum (KD #59) → `StatusTone`. Refactor existing implementation (drift target) to consume `<StatusBadge>`.

- [ ] **Step 1: Locate the existing badge**

```
Grep: "ApplicationStatusBadge" in components/
```

If a file exists, refactor it; if not, create at `components/ui/application-status-badge.tsx`.

- [ ] **Step 2: Write the wrapper**

```tsx
import { CheckCircle2, Clock, Inbox, Lock, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

type AppStatus =
  | 'Submitted'
  | 'Ongoing Verification'
  | 'Processing'
  | 'Enrolled'
  | 'Enrolled (Conditional)'
  | 'Cancelled'
  | 'Withdrawn';

const STATUS_MAP: Record<AppStatus, { tone: StatusTone; icon?: typeof CheckCircle2; label: string }> = {
  Submitted: { tone: 'info', icon: Inbox, label: 'Submitted' },
  'Ongoing Verification': { tone: 'info', icon: Clock, label: 'Verifying' },
  Processing: { tone: 'info', icon: Clock, label: 'Processing' },
  Enrolled: { tone: 'healthy', icon: CheckCircle2, label: 'Enrolled' },
  'Enrolled (Conditional)': { tone: 'warning', icon: CheckCircle2, label: 'Conditional' },
  Cancelled: { tone: 'muted', icon: X, label: 'Cancelled' },
  Withdrawn: { tone: 'locked', icon: Lock, label: 'Withdrawn' },
};

export function ApplicationStatusBadge({ status }: { status: AppStatus | string | null }) {
  const entry = (status && STATUS_MAP[status as AppStatus]) ?? null;
  if (!entry) return <StatusBadge tone="muted">{status ?? '—'}</StatusBadge>;
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
```

- [ ] **Step 3: Update existing call sites**

Grep for the prior `<ApplicationStatusBadge>` usages and verify the import path still resolves. If the file moved (e.g. from `components/admissions/`), keep a thin re-export at the old path OR update imports. Prefer updating imports — no back-compat shims (project convention).

- [ ] **Step 4: Verify**

`npx next build` clean. Browse `/admissions` and `/records` — every status pill renders.

- [ ] **Step 5: Commit**

```
feat(ui): refactor <ApplicationStatusBadge> on top of <StatusBadge>
```

---

## Task 3: Build `<DiscountCodeStatusBadge>` domain wrapper

**Files:**
- Read: existing usage in `app/(sis)/sis/admin/discount-codes/`
- Modify or Create: `components/ui/discount-code-status-badge.tsx`

- [ ] **Step 1: Locate prior implementation**

```
Grep: "DiscountCodeStatusBadge" in components/ app/
```

- [ ] **Step 2: Write the wrapper**

```tsx
import { CheckCircle2, Clock, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type DiscountCodeStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

const MAP: Record<DiscountCodeStatus, { tone: StatusTone; icon: typeof CheckCircle2; label: string }> = {
  active:    { tone: 'healthy', icon: CheckCircle2, label: 'Active' },
  scheduled: { tone: 'info',    icon: Clock,        label: 'Scheduled' },
  expired:   { tone: 'muted',   icon: X,            label: 'Expired' },
  inactive:  { tone: 'muted',   icon: X,            label: 'Inactive' },
};

export function DiscountCodeStatusBadge({ status }: { status: DiscountCodeStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
```

- [ ] **Step 3: Update call sites + verify**

`npx next build` clean. Browse `/sis/admin/discount-codes` — every code's status pill renders.

- [ ] **Step 4: Commit**

```
feat(ui): refactor <DiscountCodeStatusBadge> on top of <StatusBadge>
```

---

## Task 4: Build `<DocumentStatusBadge>` domain wrapper (NEW)

**Files:**
- Create: `components/ui/document-status-badge.tsx`

This is **net-new** — consolidates the per-slot dot pills currently inlined as `StatusDot` in admissions + p-files completeness, plus the SlotPill in cohort tables. Encodes KD #60 status workflow.

- [ ] **Step 1: Write the wrapper**

```tsx
import { Check, Clock, FileWarning, Inbox, Upload, X } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type DocumentStatus =
  | 'missing'
  | 'to-follow'      // parent-acknowledged-pending
  | 'uploaded'       // awaiting validation
  | 'valid'
  | 'rejected'       // sent back to parent
  | 'expired';       // lapsed, re-upload needed

const MAP: Record<DocumentStatus, { tone: StatusTone; icon: typeof Check; label: string }> = {
  missing:     { tone: 'muted',   icon: Inbox,       label: 'Missing' },
  'to-follow': { tone: 'warning', icon: Clock,       label: 'Awaiting parent' },
  uploaded:    { tone: 'info',    icon: Upload,      label: 'Awaiting review' },
  valid:       { tone: 'healthy', icon: Check,       label: 'Valid' },
  rejected:    { tone: 'locked',  icon: X,           label: 'Sent back' },
  expired:     { tone: 'locked',  icon: FileWarning, label: 'Lapsed' },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean (no call sites yet — Phase 1 wires it up). Commit:

```
feat(ui): add <DocumentStatusBadge> for KD #60 document status workflow
```

---

## Task 5: Build `<EnrollmentStatusBadge>` domain wrapper (NEW)

**Files:**
- Create: `components/ui/enrollment-status-badge.tsx`

Consolidates hand-rolled section-roster variants (active / late_enrollee / withdrawn).

- [ ] **Step 1: Write the wrapper**

```tsx
import { CheckCircle2, Clock, Lock } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

export type EnrollmentStatus = 'active' | 'late_enrollee' | 'withdrawn';

const MAP: Record<EnrollmentStatus, { tone: StatusTone; icon: typeof CheckCircle2; label: string }> = {
  active:        { tone: 'healthy', icon: CheckCircle2, label: 'Active' },
  late_enrollee: { tone: 'warning', icon: Clock,        label: 'Late' },
  withdrawn:     { tone: 'locked',  icon: Lock,         label: 'Withdrawn' },
};

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const entry = MAP[status];
  return <StatusBadge tone={entry.tone} icon={entry.icon}>{entry.label}</StatusBadge>;
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <EnrollmentStatusBadge> for section-roster status pills
```

---

## Task 6: Build `<IdentifierLink>` primitive

**Files:**
- Create: `components/ui/identifier-link.tsx`

Universalises KD #81 styling so every table's primary identifier column renders identically. Wraps `next/link`; preserves `prefetch={false}` opt-out for high-row-count tables.

- [ ] **Step 1: Write the primitive**

```tsx
import Link from 'next/link';
import { cn } from '@/lib/utils';

type IdentifierLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  prefetch?: boolean;
};

export function IdentifierLink({ href, children, className, prefetch }: IdentifierLinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        'font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4',
        className,
      )}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <IdentifierLink> primitive for KD #81 hover styling
```

---

## Task 7: Build plain-English copy registry

**Files:**
- Create: `lib/copy/data-table.ts`

Single source for user-visible strings that previously leaked dev jargon. Seeded with the 13 entries from spec § 4.6; per-worktree authors extend in Phase 2.

- [ ] **Step 1: Write the registry**

```ts
/**
 * Plain-English copy for data-table surfaces.
 * Per memory rule: school admins are not IT — every user-visible string
 * must read plain. Add entries here when discovered, not inline.
 */
export const TABLE_COPY = {
  // Document chase / renewal
  awaitingParentReply: 'Awaiting parent reply',
  sentBackToParent: 'Sent back to parent',
  lapsedReupload: 'Lapsed (re-upload needed)',
  awaitingValidation: 'Awaiting validation',

  // Markbook
  termSummary: 'Term summary',
  termSummaryTooltip: 'Older format, no longer written',

  // Roles
  schoolAdmin: 'School admin',

  // Sync wizard
  rowsFromAdmissions: 'Rows from admissions',
  newSectionAssignments: 'New section assignments',
  markedAsWithdrawn: 'Marked as withdrawn',

  // Discount codes
  discountCodesFooter: (label: string) => `These codes apply to the ${label} enrolment portal.`,

  // AY setup
  createGradingSheets: 'Create grading sheets for this AY',
  setAsCurrentAy: 'Set as current AY',
  copyTeacherAssignments: 'Copy teacher assignments from prior AY',
} as const;

export type TableCopyKey = keyof typeof TABLE_COPY;
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(copy): add lib/copy/data-table.ts plain-English registry
```

---

## Task 8: Build `useUrlState` hook

**Files:**
- Create: `components/ui/data-table/use-url-state.ts`

Sync the shell's filter/sort/pagination state to the URL (debounced 300ms for search, immediate for everything else). Optional `namespace` prefix for multi-table pages (sync-students wizard).

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UrlStateConfig = {
  enabled: boolean;
  namespace?: string;
  paramKeys?: {
    search?: string;
    status?: string;
    mine?: string;
  };
  debounceMs?: number;
};

export type UrlStateSnapshot = {
  search?: string;
  status?: string;
  mine?: boolean;
  facets: Record<string, string[]>;
  page?: number;
  pageSize?: number;
};

const DEFAULT_DEBOUNCE = 300;

function key(name: string, ns?: string) {
  return ns ? `${ns}.${name}` : name;
}

export function useUrlState(config: UrlStateConfig) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { enabled, namespace, paramKeys, debounceMs = DEFAULT_DEBOUNCE } = config;
  const searchKey = key(paramKeys?.search ?? 'q', namespace);
  const statusKey = key(paramKeys?.status ?? 'status', namespace);
  const mineKey = key(paramKeys?.mine ?? 'mine', namespace);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const read = useCallback((): UrlStateSnapshot => {
    if (!enabled || !params) return { facets: {} };
    const facets: Record<string, string[]> = {};
    params.forEach((value, k) => {
      const stripped = namespace && k.startsWith(`${namespace}.`) ? k.slice(namespace.length + 1) : k;
      if ([searchKey, statusKey, mineKey, key('page', namespace), key('pageSize', namespace)].includes(k)) return;
      // Anything left, namespaced or not, that isn't a reserved key is a facet
      if (!namespace || k.startsWith(`${namespace}.`)) {
        facets[stripped] = value.split(',').filter(Boolean);
      }
    });
    return {
      search: params.get(searchKey) ?? undefined,
      status: params.get(statusKey) ?? undefined,
      mine: params.get(mineKey) === '1' || undefined,
      facets,
      page: params.get(key('page', namespace)) ? Number(params.get(key('page', namespace))) : undefined,
      pageSize: params.get(key('pageSize', namespace)) ? Number(params.get(key('pageSize', namespace))) : undefined,
    };
  }, [enabled, params, searchKey, statusKey, mineKey, namespace]);

  const write = useCallback(
    (snapshot: UrlStateSnapshot, { debounce = false }: { debounce?: boolean } = {}) => {
      if (!enabled) return;
      const apply = () => {
        const next = new URLSearchParams(params?.toString() ?? '');
        const set = (k: string, v: string | undefined) => {
          if (v === undefined || v === '') next.delete(k);
          else next.set(k, v);
        };
        set(searchKey, snapshot.search);
        set(statusKey, snapshot.status);
        set(mineKey, snapshot.mine ? '1' : undefined);
        set(key('page', namespace), snapshot.page && snapshot.page > 1 ? String(snapshot.page) : undefined);
        set(key('pageSize', namespace), snapshot.pageSize ? String(snapshot.pageSize) : undefined);
        // Facets: clear any prior facet keys first, then re-add
        const reserved = new Set([searchKey, statusKey, mineKey, key('page', namespace), key('pageSize', namespace)]);
        for (const k of Array.from(next.keys())) {
          if (reserved.has(k)) continue;
          if (namespace && !k.startsWith(`${namespace}.`)) continue;
          if (!namespace && k.includes('.')) continue;
          next.delete(k);
        }
        for (const [k, vs] of Object.entries(snapshot.facets)) {
          if (vs.length === 0) continue;
          next.set(key(k, namespace), vs.join(','));
        }
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      };
      if (debounce) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(apply, debounceMs);
      } else {
        apply();
      }
    },
    [enabled, params, pathname, router, searchKey, statusKey, mineKey, namespace, debounceMs],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { read, write };
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add useUrlState hook for data-table URL sync
```

---

## Task 9: Build `<SortableHeader>` building block

**Files:**
- Create: `components/ui/data-table/sortable-header.tsx`

Replaces 4 inlined copies. Header wrapper that toggles ascending/descending/none and renders a chevron.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { type Column } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SortableHeaderProps<TRow> = {
  column: Column<TRow, unknown>;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
};

export function SortableHeader<TRow>({ column, children, className, align = 'left' }: SortableHeaderProps<TRow>) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className={cn(
        '-ml-3 h-7 gap-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
        align === 'right' && 'ml-0 mr-0',
        className,
      )}
    >
      {children}
      <Icon className="h-3 w-3 opacity-60" aria-hidden />
    </Button>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <SortableHeader> data-table primitive
```

---

## Task 10: Build `<FacetDropdown>` building block

**Files:**
- Create: `components/ui/data-table/facet-dropdown.tsx`

Multi-select w/ checkboxes + count badge + clear-footer. Replaces 2 inlined copies + 1 inline-JSX reimplementation.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type FacetDropdownProps = {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
};

export function FacetDropdown({ label, options, selected, onChange, searchable = true }: FacetDropdownProps) {
  const selectedSet = new Set(selected);
  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {label}
          {selected.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <Badge variant="secondary" className="rounded-sm px-1 font-mono text-[10px]">
                {selected.length}
              </Badge>
            </>
          )}
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={label} />}
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isOn = selectedSet.has(opt.value);
                return (
                  <CommandItem key={opt.value} onSelect={() => toggle(opt.value)}>
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        isOn ? 'bg-primary text-primary-foreground' : 'opacity-50',
                      )}
                    >
                      {isOn && <Check className="h-3 w-3" />}
                    </span>
                    <span>{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-xs">
                    <X className="mr-1 h-3 w-3" /> Clear
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <FacetDropdown> data-table primitive
```

---

## Task 11: Build `<FilterChip>` building block

**Files:**
- Create: `components/ui/data-table/filter-chip.tsx`

Active-filter chip with × dismiss; auto-rendered per active filter in the chip strip below the toolbar.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type FilterChipProps = {
  label: string;
  value: string;
  onClear: () => void;
  className?: string;
};

export function FilterChip({ label, value, onClear, className }: FilterChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-2 pr-1 text-xs',
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-5 w-5 rounded-full"
        aria-label={`Clear ${label}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <FilterChip> data-table primitive
```

---

## Task 12: Build `<DataTablePagination>` building block

**Files:**
- Create: `components/ui/data-table/pagination.tsx`

Page-size Select + page-of-N + chevron quartet. Replaces 6 inlined copies.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { type Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PaginationProps<TRow> = {
  table: Table<TRow>;
  pageSizeOptions?: number[];
};

export function DataTablePagination<TRow>({ table, pageSizeOptions = [10, 20, 50, 100] }: PaginationProps<TRow>) {
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const pageSize = table.getState().pagination.pageSize;
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
          <SelectTrigger className="h-7 w-[72px] font-mono text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={n} value={String(n)} className="font-mono text-[11px]">
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">
          Page {pageIndex + 1} of {Math.max(1, pageCount)}
        </span>
        <div className="flex items-center gap-0.5">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <DataTablePagination> data-table primitive
```

---

## Task 13: Build `<BulkActionFooter>` building block

**Files:**
- Create: `components/ui/data-table/bulk-action-footer.tsx`

Sticky-bottom selection toolbar. Replaces 3 inlined footers (admissions completeness, p-files completeness, promised cohort).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type BulkAction<TRow> = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onTrigger: (selectedRows: TRow[]) => void | Promise<void>;
  destructive?: boolean;
};

type BulkActionFooterProps<TRow> = {
  selectedRows: TRow[];
  actions: Array<BulkAction<TRow>>;
  onClear: () => void;
  className?: string;
};

export function BulkActionFooter<TRow>({ selectedRows, actions, onClear, className }: BulkActionFooterProps<TRow>) {
  if (selectedRows.length === 0) return null;
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3 text-xs">
        <span className="font-mono uppercase tracking-[0.1em] text-muted-foreground">{selectedRows.length} selected</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.key}
              size="sm"
              variant={action.destructive ? 'destructive' : 'default'}
              onClick={() => action.onTrigger(selectedRows)}
              className="h-8"
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <BulkActionFooter> data-table primitive
```

---

## Task 14: Build `<DataTableEmptyState>` building block

**Files:**
- Create: `components/ui/data-table/empty-state.tsx`

Gradient icon tile + serif title + body + optional CTA. Reused for `emptyState` (zero data) and `emptyFilteredState` (filtered to zero).

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
  className?: string;
};

export function DataTableEmptyState({ icon: Icon = Inbox, title, body, cta, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-accent/20 to-accent/5 text-accent-foreground ring-inset ring-1 ring-accent/30',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-serif text-base text-foreground">{title}</p>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {cta && (
        cta.href ? (
          <Button asChild size="sm" variant="outline">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={cta.onClick}>
            {cta.label}
          </Button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add <DataTableEmptyState> data-table primitive
```

---

## Task 15: Build `csv` export helper

**Files:**
- Create: `components/ui/data-table/csv.ts`

Generalised CSV export with UTF-8 BOM (matches drill CSV pattern from KD #56). Triggered from a toolbar button when `csv` config present.

- [ ] **Step 1: Write the helper**

```ts
type CsvColumn<TRow> = { header: string; accessor: (row: TRow) => string | number | null };

export function exportCsv<TRow>(rows: TRow[], columns: Array<CsvColumn<TRow>>, filename: string) {
  const escape = (cell: string | number | null) => {
    if (cell === null || cell === undefined) return '';
    const s = String(cell);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(c.accessor(r))).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify + commit**

`npx next build` clean. Commit:

```
feat(ui): add csv export helper for data-table
```

---

## Task 16: Build `<DataTable>` shell

**Files:**
- Create: `components/ui/data-table/types.ts`
- Create: `components/ui/data-table/index.tsx`

The shell composes all 8 building blocks + TanStack Table. This is the largest single task. Read `app/(markbook)/markbook/grading/grading-data-table.tsx` start-to-finish before writing this — the shell must reproduce its observable behavior 1:1 (Task 17 is the validation pass).

- [ ] **Step 1: Read the canonical reference**

```
Read: app/(markbook)/markbook/grading/grading-data-table.tsx (full file, ~980 lines)
```

Note specifically: search debounce, faceted unique values, "My sheets" toggle, status tabs with counts, column visibility, active-filter chip strip with per-chip dismiss, sortable headers, pagination with rows-per-page, empty state.

- [ ] **Step 2: Write `components/ui/data-table/types.ts`**

```ts
import type { ColumnDef, SortingState, VisibilityState } from '@tanstack/react-table';
import type { LucideIcon, ReactNode } from 'react';
import type { BulkAction } from './bulk-action-footer';

export type FacetConfig = {
  columnId: string;
  label: string;
  valueOptions?: string[];
  showUnassigned?: boolean;
};

export type StatusTabConfig<TRow> = {
  value: string;
  label: string;
  predicate: (row: TRow) => boolean;
  isDefault?: boolean;
  countOverride?: (rows: TRow[]) => number;
};

export type MeScopeConfig<TRow> = {
  userId: string | null;
  label: string;
  icon?: LucideIcon;
  predicate: (row: TRow, userId: string) => boolean;
};

export type CsvConfig<TRow> = {
  filename: string;
  columns?: Array<{ header: string; accessor: (row: TRow) => string | number | null }>;
};

export type UrlStateConfig = {
  enabled: boolean;
  namespace?: string;
  paramKeys?: { search?: string; status?: string; mine?: string };
};

export type EmptyStateConfig = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
};

export type SelectionConfig<TRow> = {
  enabled: boolean;
  bulkActions?: Array<BulkAction<TRow>>;
};

export type DataTableProps<TRow> = {
  data: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string;

  searchKeys?: Array<keyof TRow | ((row: TRow) => string)>;
  searchPlaceholder?: string;

  facets?: FacetConfig[];
  statusTabs?: Array<StatusTabConfig<TRow>>;
  meScope?: MeScopeConfig<TRow>;

  toolbarLeading?: ReactNode;
  toolbarTrailing?: ReactNode;

  initialSort?: SortingState;
  initialColumnVisibility?: VisibilityState;
  stickyHeader?: boolean;

  pageSize?: number;
  pageSizeOptions?: number[];
  hidePagination?: boolean;

  selection?: SelectionConfig<TRow>;
  csv?: CsvConfig<TRow>;
  url?: UrlStateConfig;

  emptyState?: EmptyStateConfig;
  emptyFilteredState?: { title: string; body?: string };
};
```

- [ ] **Step 3: Write `components/ui/data-table/index.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Columns3, Download, Search, X } from 'lucide-react';
import {
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle'; // shadcn primitive — install via mcp__shadcn if missing
import { cn } from '@/lib/utils';
import { BulkActionFooter } from './bulk-action-footer';
import { DataTableEmptyState } from './empty-state';
import { exportCsv } from './csv';
import { FacetDropdown } from './facet-dropdown';
import { FilterChip } from './filter-chip';
import { DataTablePagination } from './pagination';
import type { DataTableProps } from './types';
import { useUrlState } from './use-url-state';

export function DataTable<TRow>(props: DataTableProps<TRow>) {
  const {
    data,
    columns,
    getRowId,
    searchKeys,
    searchPlaceholder = 'Search…',
    facets = [],
    statusTabs,
    meScope,
    toolbarLeading,
    toolbarTrailing,
    initialSort = [],
    initialColumnVisibility = {},
    stickyHeader,
    pageSize = 20,
    pageSizeOptions = [10, 20, 50, 100],
    hidePagination = false,
    selection,
    csv,
    url = { enabled: false },
    emptyState,
    emptyFilteredState,
  } = props;

  const urlState = useUrlState(url);
  const initial = url.enabled ? urlState.read() : { facets: {} };

  const defaultStatus = statusTabs?.find((t) => t.isDefault)?.value ?? statusTabs?.[0]?.value;
  const [statusTab, setStatusTab] = useState<string | undefined>(initial.status ?? defaultStatus);
  const [mineActive, setMineActive] = useState<boolean>(Boolean(initial.mine && meScope?.userId));
  const [search, setSearch] = useState<string>(initial.search ?? '');
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    Object.entries(initial.facets ?? {}).map(([id, value]) => ({ id, value })),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Status-tab + me-scope filter applied BEFORE TanStack so counts in tabs reflect the
  // raw `data` array, not other filters.
  const tabFilteredData = useMemo(() => {
    let rows = data;
    if (statusTabs && statusTab) {
      const tab = statusTabs.find((t) => t.value === statusTab);
      if (tab) rows = rows.filter(tab.predicate);
    }
    if (mineActive && meScope?.userId) {
      const uid = meScope.userId;
      rows = rows.filter((r) => meScope.predicate(r, uid));
    }
    return rows;
  }, [data, statusTabs, statusTab, mineActive, meScope]);

  const table = useReactTable<TRow>({
    data: tabFilteredData,
    columns,
    getRowId,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter: search },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setSearch,
    enableRowSelection: selection?.enabled ?? false,
    initialState: { pagination: { pageSize: initial.pageSize ?? pageSize } },
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!filterValue || !searchKeys) return true;
      const haystack = searchKeys
        .map((k) => (typeof k === 'function' ? k(row.original) : String(row.original[k] ?? '')))
        .join(' ')
        .toLowerCase();
      return haystack.includes(String(filterValue).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: hidePagination ? undefined : getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  // URL writeback — debounced for search, immediate for everything else.
  useEffect(() => {
    if (!url.enabled) return;
    const facetsSnapshot: Record<string, string[]> = {};
    for (const f of columnFilters) {
      const v = f.value;
      if (Array.isArray(v) && v.length > 0) facetsSnapshot[f.id] = v.map(String);
    }
    urlState.write(
      {
        search: search || undefined,
        status: statusTab !== defaultStatus ? statusTab : undefined,
        mine: mineActive || undefined,
        facets: facetsSnapshot,
        page: table.getState().pagination.pageIndex > 0 ? table.getState().pagination.pageIndex + 1 : undefined,
        pageSize: table.getState().pagination.pageSize !== pageSize ? table.getState().pagination.pageSize : undefined,
      },
      { debounce: false },
    );
    // search debounce
  }, [columnFilters, statusTab, mineActive, table, url.enabled, urlState, defaultStatus, pageSize]);

  useEffect(() => {
    if (!url.enabled) return;
    urlState.write(
      {
        search: search || undefined,
        status: statusTab !== defaultStatus ? statusTab : undefined,
        mine: mineActive || undefined,
        facets: Object.fromEntries(
          columnFilters.filter((f) => Array.isArray(f.value) && f.value.length > 0).map((f) => [f.id, (f.value as unknown[]).map(String)]),
        ),
      },
      { debounce: true },
    );
  }, [search, url.enabled, urlState, statusTab, mineActive, defaultStatus, columnFilters]);

  const totalRows = table.getFilteredRowModel().rows.length;
  const selectedRows = useMemo(
    () => table.getFilteredSelectedRowModel().rows.map((r) => r.original),
    [rowSelection, table],
  );

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string; onClear: () => void }> = [];
    for (const f of columnFilters) {
      const facetCfg = facets.find((fc) => fc.columnId === f.id);
      if (!facetCfg) continue;
      const values = Array.isArray(f.value) ? (f.value as string[]) : [];
      values.forEach((v) =>
        chips.push({
          key: `${f.id}:${v}`,
          label: facetCfg.label,
          value: v,
          onClear: () =>
            setColumnFilters((prev) =>
              prev
                .map((p) =>
                  p.id === f.id
                    ? { ...p, value: (p.value as string[]).filter((x) => x !== v) }
                    : p,
                )
                .filter((p) => !(Array.isArray(p.value) && p.value.length === 0)),
            ),
        }),
      );
    }
    if (search) chips.push({ key: 'q', label: 'Search', value: search, onClear: () => setSearch('') });
    if (mineActive && meScope) chips.push({ key: 'mine', label: 'Scope', value: meScope.label, onClear: () => setMineActive(false) });
    return chips;
  }, [columnFilters, facets, search, mineActive, meScope]);

  const showEmpty = data.length === 0;
  const showFilteredEmpty = !showEmpty && totalRows === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {toolbarLeading}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-56 pl-7 text-xs"
          />
        </div>
        {meScope?.userId && (
          <Toggle
            pressed={mineActive}
            onPressedChange={setMineActive}
            size="sm"
            className="h-8"
            aria-label={meScope.label}
          >
            {meScope.icon && <meScope.icon className="mr-1 h-3.5 w-3.5" />}
            {meScope.label}
          </Toggle>
        )}
        {facets.map((f) => {
          const col = table.getColumn(f.columnId);
          if (!col) return null;
          const options =
            f.valueOptions?.map((v) => ({ value: v, label: v })) ??
            Array.from(col.getFacetedUniqueValues().keys())
              .filter((v): v is string => typeof v === 'string')
              .sort()
              .map((v) => ({ value: v, label: v }));
          const selected = ((columnFilters.find((cf) => cf.id === f.columnId)?.value as string[]) ?? []);
          return (
            <FacetDropdown
              key={f.columnId}
              label={f.label}
              options={options}
              selected={selected}
              onChange={(next) =>
                setColumnFilters((prev) => {
                  const without = prev.filter((p) => p.id !== f.columnId);
                  return next.length ? [...without, { id: f.columnId, value: next }] : without;
                })
              }
            />
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {toolbarTrailing}
          {csv && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                const cols =
                  csv.columns ??
                  table
                    .getVisibleLeafColumns()
                    .filter((c) => c.id !== 'select')
                    .map((c) => ({
                      header: typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id,
                      accessor: (row: TRow) => {
                        const v = (row as Record<string, unknown>)[c.id];
                        return v == null ? null : (v as string | number);
                      },
                    }));
                exportCsv(table.getFilteredRowModel().rows.map((r) => r.original), cols, csv.filename);
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 className="mr-1 h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                  >
                    {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Status tabs */}
      {statusTabs && (
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            {statusTabs.map((t) => {
              const count = t.countOverride ? t.countOverride(data) : data.filter(t.predicate).length;
              return (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  <span>{t.label}</span>
                  <span className="rounded-sm bg-muted px-1 font-mono text-[10px] text-muted-foreground">{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      {/* Active-filter chip strip */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} value={chip.value} onClear={chip.onClear} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setColumnFilters([]);
              setSearch('');
              setMineActive(false);
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear all
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className={cn(stickyHeader && 'sticky top-0 z-10 bg-background')}>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {showEmpty ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <DataTableEmptyState {...(emptyState ?? { title: 'No data.' })} />
                  </TableCell>
                </TableRow>
              ) : showFilteredEmpty ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <DataTableEmptyState
                      title={emptyFilteredState?.title ?? 'No matches.'}
                      body={emptyFilteredState?.body ?? 'Try clearing filters.'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((r) => (
                  <TableRow key={r.id} data-state={r.getIsSelected() && 'selected'}>
                    {r.getVisibleCells().map((c) => (
                      <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!hidePagination && totalRows > 0 && (
          <div className="border-t border-border bg-muted/20">
            <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
          </div>
        )}
      </div>

      {/* Bulk-action footer (auto-shows when ≥1 selected) */}
      {selection?.enabled && selection.bulkActions && (
        <BulkActionFooter
          selectedRows={selectedRows}
          actions={selection.bulkActions}
          onClear={() => table.resetRowSelection()}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

`npx next build` clean. The shell has no call sites yet — Task 17 is the first.

If `Toggle` primitive is missing from `components/ui/`, install it:

```
mcp__shadcn__list_items_in_registries → confirm "toggle" exists
mcp__shadcn__get_add_command_for_items → install
```

Per memory rule: install shadcn primitives instead of substituting.

- [ ] **Step 5: Commit**

```
feat(ui): add <DataTable> shell — 1 wrapper consumes TanStack
```

---

## Task 17: Validation pass — refactor `grading-data-table.tsx` (spec § 5.1)

**Files:**
- Read: `app/(markbook)/markbook/grading/grading-data-table.tsx` (full file)
- Modify: `app/(markbook)/markbook/grading/grading-data-table.tsx`

This is the contract. The shell must reproduce the canonical reference's observable behavior 1:1. If anything diverges, fix the shell — do NOT alter the table's UX.

- [ ] **Step 1: Re-read the canonical reference** to capture exact column shapes, status tab predicates, "My sheets" predicate, facet labels, empty-state copy.

- [ ] **Step 2: Rewrite the file**

Skeleton:

```tsx
'use client';

import { Lock } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { IdentifierLink } from '@/components/ui/identifier-link';
// (existing imports for row shape + helpers)

export function GradingDataTable({ rows, currentUserId, ayCode, /* … */ }: Props) {
  const columns = useMemo<ColumnDef<GradingRow>[]>(() => [
    /* preserve existing column defs; replace section-name cell with: */
    {
      id: 'section',
      header: 'Section',
      cell: ({ row }) => (
        <IdentifierLink href={`/markbook/grading/${row.original.sheetId}`}>
          {row.original.sectionLabel}
        </IdentifierLink>
      ),
    },
    /* … rest of columns unchanged */
  ], []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.sheetId}
      searchKeys={['sectionLabel', 'subjectLabel', 'teacherEmail']}
      searchPlaceholder="Search sheets…"
      facets={[
        { columnId: 'level', label: 'Level' },
        { columnId: 'subject', label: 'Subject' },
        { columnId: 'term', label: 'Term' },
        { columnId: 'teacher', label: 'Teacher' /* curated valueOptions */ },
        { columnId: 'formAdviser', label: 'Form adviser' /* curated */ },
      ]}
      statusTabs={[
        { value: 'all', label: 'All', predicate: () => true, isDefault: true },
        { value: 'open', label: 'Open', predicate: (r) => !r.isLocked },
        { value: 'locked', label: 'Locked', predicate: (r) => r.isLocked },
        { value: 'with-blanks', label: 'With blanks', predicate: (r) => r.hasBlanks },
      ]}
      meScope={{
        userId: currentUserId,
        label: 'My sheets',
        predicate: (r, uid) => r.subjectTeacherId === uid || r.formAdviserId === uid,
      }}
      pageSize={20}
      csv={{ filename: `grading-sheets-${ayCode}.csv` }}
      url={{ enabled: true }}
      emptyState={{
        title: 'No grading sheets yet.',
        cta: { label: 'New sheet', href: '/markbook/grading/new' },
      }}
      emptyFilteredState={{ title: 'No sheets match the current filters.' }}
    />
  );
}
```

- [ ] **Step 3: Verify**

`npx next build` clean.

Manual smoke at `/markbook/grading`:
- Load page; default tab "All"; row count matches prior version.
- Type in search box → results filter; URL gets `?q=…` (debounced).
- Click "Locked" tab → URL gets `?status=locked`; row count = locked count.
- Toggle "My sheets" → URL gets `?mine=1`; rows scoped.
- Apply Subject facet → URL gets `?subject=Math,English`; chip strip shows two chips.
- Click a chip's × → that one drops; URL updates.
- Click "Clear all" → all chips gone; URL keys gone.
- Reload page → state preserved from URL.
- Click pagination chevrons → page advances; `?page=2` appears (page=1 omitted).
- Change rows-per-page → `?pageSize=50` appears.
- Empty state: filter to zero rows → "No sheets match the current filters." renders.

- [ ] **Step 4: Commit**

```
refactor(markbook): grading-data-table consumes <DataTable> shell

Validation pass for the unified shell. Observable behavior preserved 1:1.
```

---

## Phase 1 — Consolidation wrappers

**Where:** `main` branch directly. Phase 0 must be merged first.

**Stopping rule:** Both wrappers must compile + smoke-test on `main` before Phase 2 worktrees branch off.

---

## Task 18: Build `<CohortTable kind>` + migrate 4 cohort tables (spec § 5.17–5.20)

**Files:**
- Create: `components/sis/cohorts/cohort-table.tsx`
- Modify: `app/(records)/records/cohorts/stp/page.tsx` + `app/(records)/records/cohorts/medical/page.tsx` + `app/(records)/records/cohorts/pass-expiry/page.tsx`
- Modify: `app/(admissions)/admissions/cohorts/stp/page.tsx` + `app/(admissions)/admissions/cohorts/medical/page.tsx` + `app/(admissions)/admissions/cohorts/promised/page.tsx`
- Delete: `components/sis/cohorts/stp-cohort-table.tsx`, `medical-cohort-table.tsx`, `pass-expiry-cohort-table.tsx`, `promised-cohort-table.tsx`

`<CohortTable kind="stp|promised|pass-expiry|medical" scope="enrolled|funnel">` consolidates 4 files via per-kind column builder + per-kind status tab map + scope-conditional linkified identifier (spec § 4.3).

- [ ] **Step 1: Read all 4 existing cohort tables** to capture exact row shapes, status tab predicates, and any per-kind columns.

```
Read: components/sis/cohorts/stp-cohort-table.tsx
Read: components/sis/cohorts/promised-cohort-table.tsx
Read: components/sis/cohorts/pass-expiry-cohort-table.tsx
Read: components/sis/cohorts/medical-cohort-table.tsx
```

- [ ] **Step 2: Write `components/sis/cohorts/cohort-table.tsx`**

Skeleton — column builders are per-kind module-scope functions (not a switch statement, so adding a new kind is one new function):

```tsx
'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { IdentifierLink } from '@/components/ui/identifier-link';
import { ApplicationStatusBadge } from '@/components/ui/application-status-badge';
import { DocumentStatusBadge } from '@/components/ui/document-status-badge';
// (existing row-shape types for each kind)

export type CohortKind = 'stp' | 'promised' | 'pass-expiry' | 'medical';
export type CohortScope = 'enrolled' | 'funnel';

type Props<TRow> = {
  kind: CohortKind;
  scope: CohortScope;
  ayCode: string;
  rows: TRow[];
  /* per-kind row shape narrowed via discriminated union */
};

function destinationFor(kind: CohortKind, scope: CohortScope, row: any, ayCode: string): string {
  if (kind === 'promised') return `/admissions/applications/${row.enroleeNumber}?ay=${ayCode}&tab=documents`;
  if (scope === 'enrolled' && row.studentNumber) return `/records/students/${row.studentNumber}`;
  return `/admissions/applications/${row.enroleeNumber}?ay=${ayCode}&tab=lifecycle`;
}

function buildStpColumns(scope: CohortScope, ayCode: string): ColumnDef<StpRow>[] {
  return [
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => (
        <IdentifierLink href={destinationFor('stp', scope, row.original, ayCode)}>
          {row.original.fullName}
        </IdentifierLink>
      ),
    },
    /* preserve existing columns: stpType, 3 STP slots, residence count, STP complete flag, app status (via <ApplicationStatusBadge>) */
  ];
}

function buildPromisedColumns(/* ... */): ColumnDef<PromisedRow>[] { /* ... + Note column */ }
function buildPassExpiryColumns(/* ... */): ColumnDef<PassExpiryRow>[] { /* ... + parent/guardian holder column */ }
function buildMedicalColumns(/* ... */): ColumnDef<MedicalRow>[] { /* ... */ }

export function CohortTable<TRow>(props: Props<TRow>) {
  const { kind, scope, ayCode, rows } = props;
  const columns = (() => {
    switch (kind) {
      case 'stp': return buildStpColumns(scope, ayCode);
      case 'promised': return buildPromisedColumns(scope, ayCode);
      case 'pass-expiry': return buildPassExpiryColumns(scope, ayCode);
      case 'medical': return buildMedicalColumns(scope, ayCode);
    }
  })();

  const statusTabs = STATUS_TABS_BY_KIND[kind] /* per-kind tab map */;
  const facets = FACETS_BY_KIND[kind];

  // promised gets selection.enabled=true with bulk-notify; others get selection={undefined}
  const selection = kind === 'promised' ? {
    enabled: true,
    bulkActions: [
      { key: 'notify', label: 'Notify parents', onTrigger: openBulkNotifyDialog },
    ],
  } : undefined;

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.enroleeNumber}
      searchKeys={['fullName']}
      facets={facets}
      statusTabs={statusTabs}
      pageSize={25}
      csv={{ filename: `${kind}-cohort-${ayCode}.csv` }}
      url={{ enabled: true }}
      selection={selection}
      emptyState={EMPTY_STATE_BY_KIND[kind]}
      emptyFilteredState={{ title: 'No matches for current filters.' }}
    />
  );
}
```

Status tab maps + facets + empty states per spec § 5.17–5.20.

- [ ] **Step 3: Update consumer pages**

Replace each `<StpCohortTable rows={...} />` (etc.) call site with `<CohortTable kind="stp" scope="enrolled" ayCode={ayCode} rows={...} />`. Records-side pages pass `scope="enrolled"`; admissions-side pages pass `scope="funnel"`.

- [ ] **Step 4: Delete the 4 old per-kind files**

```
Delete: components/sis/cohorts/stp-cohort-table.tsx
Delete: components/sis/cohorts/promised-cohort-table.tsx
Delete: components/sis/cohorts/pass-expiry-cohort-table.tsx
Delete: components/sis/cohorts/medical-cohort-table.tsx
```

No back-compat shims (project convention).

- [ ] **Step 5: Verify**

`npx next build` clean.

Manual smoke per cohort:
- `/records/cohorts/stp` → loads; identifier links route to `/records/students/[studentNumber]`.
- `/admissions/cohorts/stp` → loads; identifier links route to `/admissions/applications/[enroleeNumber]?ay={ay}&tab=lifecycle`.
- `/admissions/cohorts/promised` → loads; bulk-select + Notify parents button works (existing route).
- `/records/cohorts/pass-expiry` → loads; status tabs (Already lapsed / Within 30 days / etc.) filter rows.
- Medical cohort facets: Allergies / Asthma / etc. work.

- [ ] **Step 6: Commit**

```
refactor(cohorts): consolidate 4 cohort tables into <CohortTable kind>
```

---

## Task 19: Build `<DocumentCompletenessTable module>` + migrate 2 completeness tables (spec § 5.21 + 5.23)

**Files:**
- Create: `components/shared/document-completeness-table.tsx`
- Modify: consumer pages in `app/(admissions)/admissions/` + `app/(p-files)/p-files/`
- Delete (or thin re-export): `components/admissions/completeness-table.tsx` + `components/p-files/completeness-table.tsx` (only after no other call sites remain)

Replaces the line-for-line clone pair (admissions + p-files completeness) with one parameterised component (spec § 4.4).

- [ ] **Step 1: Read both clones**

```
Read: components/admissions/completeness-table.tsx
Read: components/p-files/completeness-table.tsx
```

Capture: per-slot dot grid render, BulkNotifyDialog wiring, slot-key gating per KD #61 (STP-conditional) + KD #69 (parent-email-conditional).

- [ ] **Step 2: Write `components/shared/document-completeness-table.tsx`**

```tsx
'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { IdentifierLink } from '@/components/ui/identifier-link';
import { ApplicationStatusBadge } from '@/components/ui/application-status-badge';
import { DocumentStatusBadge, type DocumentStatus } from '@/components/ui/document-status-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TABLE_COPY } from '@/lib/copy/data-table';
// (existing BulkNotifyDialog + slot-key constants + per-slot status resolver)

type Module = 'p-files' | 'admissions';

type Props<TRow> = {
  module: Module;
  rows: TRow[];
  ayCode: string;
  slotKeys: (row: TRow) => SlotKey[];
  bulkRemindEnabled?: boolean;       // page-level role gate (KD #74)
  bulkRemindWindowDays?: number;     // p-files only — undefined = "expired only"
  initialStatusFilter?: string;
};

const STATUS_OPTIONS_BY_MODULE: Record<Module, Array<{ value: string; label: string }>> = {
  admissions: [
    { value: 'to-follow', label: TABLE_COPY.awaitingParentReply },
    { value: 'rejected', label: TABLE_COPY.sentBackToParent },
    { value: 'uploaded', label: TABLE_COPY.awaitingValidation },
    { value: 'expired', label: TABLE_COPY.lapsedReupload },
  ],
  'p-files': [
    { value: 'expired', label: TABLE_COPY.lapsedReupload },
  ],
};

export function DocumentCompletenessTable<TRow>(props: Props<TRow>) {
  const { module, rows, ayCode, slotKeys, bulkRemindEnabled, bulkRemindWindowDays, initialStatusFilter } = props;

  const columns = useMemo<ColumnDef<TRow>[]>(() => [
    {
      id: 'student',
      header: module === 'p-files' ? 'Student' : 'Applicant',
      cell: ({ row }) => (
        <IdentifierLink
          href={
            module === 'p-files'
              ? `/p-files/${row.original.enroleeNumber}?ay=${ayCode}`
              : `/admissions/applications/${row.original.enroleeNumber}?ay=${ayCode}`
          }
        >
          {row.original.fullName}
        </IdentifierLink>
      ),
    },
    { id: 'level', header: 'Level', accessorKey: 'level' },
    ...(module === 'p-files'
      ? [{ id: 'section', header: 'Section', accessorKey: 'section' }]
      : [{ id: 'submittedAt', header: 'Submitted', cell: ({ row }) => formatDate(row.original.createdAt) }]),
    {
      id: 'appStatus',
      header: 'Status',
      cell: ({ row }) => <ApplicationStatusBadge status={row.original.applicationStatus} />,
    },
    /* slot dot grid — column per slot key, header gets <Tooltip> wrapping the truncation */
    ...SLOT_KEY_ORDER.map((slot) => ({
      id: slot,
      header: () => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">{SLOT_TRUNCATIONS[slot]}</span>
          </TooltipTrigger>
          <TooltipContent>{SLOT_FULL_LABELS[slot]}</TooltipContent>
        </Tooltip>
      ),
      cell: ({ row }) => {
        const allowed = slotKeys(row.original);
        if (!allowed.includes(slot)) return null;
        const status = resolveSlotStatus(row.original, slot);
        return <DocumentStatusBadge status={status as DocumentStatus} />;
      },
    })),
  ], [module, ayCode, slotKeys]);

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.enroleeNumber}
      searchKeys={['fullName']}
      facets={[
        { columnId: 'level', label: 'Level' },
        ...(module === 'p-files' ? [{ columnId: 'section', label: 'Section' }] : []),
        { columnId: 'appStatus', label: 'Status', valueOptions: STATUS_OPTIONS_BY_MODULE[module].map((o) => o.value) },
      ]}
      pageSize={25}
      csv={{ filename: `${module}-completeness-${ayCode}.csv` }}
      url={{ enabled: true }}
      selection={
        bulkRemindEnabled
          ? {
              enabled: true,
              bulkActions: [{ key: 'notify', label: 'Notify parents', onTrigger: openBulkNotifyDialog }],
            }
          : undefined
      }
      emptyState={{
        title: module === 'p-files' ? 'No expiring documents.' : 'No applicants in the chase queue.',
        body: module === 'p-files' ? 'Renewal queue clears when every parent has re-uploaded.' : undefined,
      }}
      emptyFilteredState={{ title: 'No applicants match the current filters.' }}
    />
  );
}
```

- [ ] **Step 3: Update consumer pages** to use the new wrapper. Pass `bulkRemindEnabled` from the page-level `isOperational`/`isOfficer` flag (KD #74).

- [ ] **Step 4: Delete the 2 old clone files** if they have no other call sites; otherwise leave a thin re-export. Prefer deletion (project convention).

- [ ] **Step 5: Verify**

`npx next build` clean.

Manual smoke:
- `/admissions` (operational view) → completeness table renders; status facet uses plain-English labels; bulk-select + Notify parents works (existing route).
- `/p-files` (officer view) → completeness table renders with section facet; expiry-date inline display below dot grid for any expired/expiring slot.
- Identifier links route correctly per module.
- Slot truncations show full label on hover via tooltip.

- [ ] **Step 6: Commit**

```
refactor(documents): consolidate completeness clones into <DocumentCompletenessTable>
```

---

## Phase 2 — Per-module migrations (parallel worktrees)

**Where:** 3 git worktrees branched from `main` after Phase 1 lands. Use `superpowers:using-git-worktrees` to set up. Use `superpowers:subagent-driven-development` to dispatch.

**Stopping rule for each worktree:** All tasks within the worktree pass the per-table acceptance checklist (spec § 6.2: shell consumed, identifier linkified, status badges migrated, plain-English copy applied, URL-state round-trip verified, both empty states render, `npx next build` clean, no Hard Rule #7 token violations). Submitted for `feature-dev:code-reviewer` review before merge.

**Per-worktree preflight (spec § 6.3):** before writing code, the worktree author re-reads the spec § 5.X entries for their tables AND re-reads the current loader file to confirm DB columns + filter shapes claimed in the spec are still accurate.

**Worktree setup:**

```
Worktree A: ../hfse-markbook-tables           branch: phase2-markbook-tables
Worktree B: ../hfse-records-sis-admin-tables  branch: phase2-records-sis-admin-tables
Worktree C: ../hfse-admissions-attendance     branch: phase2-admissions-attendance
```

---

### Worktree A — markbook-tables

**Tasks 20-26**: 7 surfaces in `app/(markbook)/`. ~1 day wall time.

---

## Task 20: Migrate `change-requests-data-table.tsx` (spec § 5.2)

**Files:**
- Read: `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx`
- Modify: same file

**Spec reference:** § 5.2.

**Out-of-scope-this-pass note:** § 5.2 promotes Section + Subject + Term + Student name columns, but the loader doesn't join those today. Migrate without those columns; flag the loader-join gap in the commit message; the columns appear when the separate `change-requests-loader-join-expansion` ticket lands.

- [ ] **Step 1: Preflight** — re-read spec § 5.2 + the current file + the loader.

- [ ] **Step 2: Refactor to consume `<DataTable>`**

Configuration:
- `searchKeys` over the actor email + reason text.
- `facets`: Status, Field changed, Reason category.
- `statusTabs`: All / Pending / Approved / Applied / Rejected / Cancelled (counts).
- `pageSize`: 20.
- `toolbarLeading`: existing custom date-range picker stays (spec § 5.2 explicit).
- `csv`: `{ filename: 'change-requests-${ayCode}.csv' }`.
- `url`: `{ enabled: true }`.
- `emptyState` + `emptyFilteredState` per spec.

Add `<IdentifierLink>` on the section column (NEW, see § 5.2) ONLY if the loader-join ticket has shipped; otherwise leave as plain text and add a TODO comment.

- [ ] **Step 3: Verify**

`npx next build` clean. Smoke test at `/markbook/change-requests` — every checklist item per § 6.2.

- [ ] **Step 4: Commit**

```
refactor(markbook): change-requests-data-table consumes <DataTable>

Section/Subject/Term/Student columns deferred — loader join expansion
tracked in separate ticket (spec §5.2 + §7).
```

---

## Task 21: Migrate `audit-log-data-table.tsx` (spec § 5.3)

**Files:**
- Read: `app/(markbook)/markbook/audit-log/audit-log-data-table.tsx`
- Modify: same file

**Spec reference:** § 5.3.

- [ ] **Step 1: Preflight** — re-read spec § 5.3 + current file.

- [ ] **Step 2: Refactor**

- `facets`: Action (mono Badge), Actor.
- `statusTabs`: none (event-shaped).
- `pageSize`: 25.
- `toolbarLeading`: existing custom date-range picker stays.
- `csv`: existing CSV export wired through `csv={{ filename }}`.
- `url`: `{ enabled: true }`.
- Add `<IdentifierLink>` on Sheet UUID → `/markbook/grading/[sheetId]` (when present); add deep-link Open cell for `entity_type + entity_id` per spec § 5.3 + § 4.8.

- [ ] **Step 3: Verify** — `npx next build` + smoke at `/markbook/audit-log`.

- [ ] **Step 4: Commit**

```
refactor(markbook): audit-log-data-table consumes <DataTable>
```

---

## Task 22: Migrate `all-publications-overview.tsx` (spec § 5.4)

**Files:**
- Read: `components/markbook/all-publications-overview.tsx`
- Modify: same file

**Spec reference:** § 5.4. Promote from static to managed by `<DataTable>`.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: section name → `/markbook/report-cards?section_id={sectionId}` (replaces trailing "Open" link).
- Promote: notification status (`notified_at`) as small badge in Status column; `published-by` actor as hidden-by-default column.
- `facets`: Level, Status (Scheduled / Open / Closed / Revoked).
- `statusTabs`: Current term / All terms (existing).
- `pageSize`: 25.
- `csv`: `{ filename: 'publications-${ayCode}.csv' }`.
- `emptyState`: "No publication windows yet." / CTA "Configure" → `/markbook/report-cards`.

- [ ] **Step 3: Verify** — smoke at `/markbook/report-cards/audit` (or wherever consumer page lives).

- [ ] **Step 4: Commit**

```
refactor(markbook): all-publications-overview consumes <DataTable>
```

---

## Task 23: Migrate `attendance-readonly-table.tsx` (spec § 5.5)

**Files:**
- Read: `components/markbook/attendance-readonly-table.tsx`
- Modify: same file

**Spec reference:** § 5.5.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: student name → `/attendance/students/[studentNumber]` (NEW per KD #81).
- Promote: `<EnrollmentStatusBadge>` after the name for `late_enrollee` rows (currently only `withdrawn` gets visual treatment via strikethrough — keep strikethrough for visual consistency).
- `facets`: Status (Active / Late / Withdrawn).
- `statusTabs`: none (small row count).
- `hidePagination`: true (≤50 per Hard Rule #5).
- `emptyState`: "No students enrolled." / "Sync from admissions or add a student to this section first."

- [ ] **Step 3: Verify** — smoke at a Markbook section detail page that mounts this read-only mirror.

- [ ] **Step 4: Commit**

```
refactor(markbook): attendance-readonly-table consumes <DataTable>
```

---

## Task 24: Migrate `sections/[id]/roster-table.tsx` (spec § 5.6)

**Files:**
- Read: `app/(markbook)/markbook/sections/[id]/roster-table.tsx`
- Modify: same file

**Spec reference:** § 5.6.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: student name → `/records/students/[studentNumber]` (NEW per KD #81; uses studentNumber not students.id UUID per Hard Rule #4).
- KEEP the existing "Grades" action button (spec § 5.6 explicit — KD #81 doesn't strip other links).
- Promote: `enrollment_date` + `withdrawal_date` as hidden-by-default columns.
- `statusTabs`: All / Active / Late / Withdrawn (existing — keep as tabs for parity with grading-data-table).
- `pageSize`: 25.
- `emptyState`: "No students enrolled yet."
- Status badge: `<EnrollmentStatusBadge>`.

- [ ] **Step 3: Verify** — smoke at `/markbook/sections/[id]`.

- [ ] **Step 4: Commit**

```
refactor(markbook): sections/[id]/roster-table consumes <DataTable>
```

---

## Task 25: Migrate `report-cards/page.tsx` section detail roster (spec § 5.7)

**Files:**
- Read: `app/(markbook)/markbook/report-cards/page.tsx` (or section-detail page if separate)
- Modify: same file or its child component

**Spec reference:** § 5.7.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: student name → `/markbook/report-cards/[studentId]` (replaces trailing "Preview" button).
- Cut: trailing "Preview" button.
- Promote: per-student publication status badge derived from publication-windows array.
- `statusTabs`: All / Published / Awaiting publication.
- `hidePagination`: true (≤50).
- `emptyState`: "No students enrolled."

- [ ] **Step 3: Verify** — smoke at `/markbook/report-cards?section_id=…`.

- [ ] **Step 4: Commit**

```
refactor(markbook): report-cards section roster consumes <DataTable>
```

---

## Task 26: Migrate `grading/requests/page.tsx` "My requests" table (spec § 5.8)

**Files:**
- Read: `app/(markbook)/markbook/grading/requests/page.tsx`
- Modify: same file

**Spec reference:** § 5.8. Same loader-join gap as Task 20 — Section/Subject/Term/Student columns deferred.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- `facets`: Status, Field changed.
- `statusTabs`: All / Pending / Approved / Applied / Rejected / Cancelled.
- `pageSize`: 25.
- `csv`: `{ filename: 'my-change-requests.csv' }`.
- `emptyState`: "You haven't filed any change requests yet."

Identifier link on Sheet column deferred until loader-join ticket lands.

- [ ] **Step 3: Verify** — smoke at `/markbook/grading/requests`.

- [ ] **Step 4: Commit**

```
refactor(markbook): grading/requests "My requests" consumes <DataTable>
```

**Worktree A complete. Open PR; request `feature-dev:code-reviewer` review; merge after review approval.**

---

### Worktree B — records-sis-admin-tables

**Tasks 27-34**: 8 surfaces. ~1 day wall time.

---

## Task 27: Migrate `student-data-table.tsx` (spec § 5.9)

**Files:**
- Read: `components/sis/student-data-table.tsx`
- Modify: same file

**Spec reference:** § 5.9.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: name → `/records/students/[studentNumber]` (existing; styling updates to canonical KD #81 via `<IdentifierLink>`).
- Cut: "Applicant Number" column hidden-by-default (Hard Rule #4 risk; available via column visibility toggle).
- Promote: `applicationUpdatedDate` as hidden-by-default "Last updated" column (sortable).
- `facets`: Level, Section, Status (Status currently a tab — keep as tab).
- `statusTabs`: All / Enrolled / Pipeline / Withdrawn (existing).
- `pageSize`: 25.
- `csv`: `{ filename: 'students-${ayCode}.csv' }`.
- `emptyState`: spec § 5.9 copy.

- [ ] **Step 3: Verify** — smoke at `/records`.

- [ ] **Step 4: Commit**

```
refactor(records): student-data-table consumes <DataTable>
```

---

## Task 28: Migrate `movements-table.tsx` (spec § 5.10)

**Files:**
- Read: `components/sis/movements-table.tsx`
- Modify: same file

**Spec reference:** § 5.10.

- [ ] **Step 1: Preflight** — re-read KD #83 + the current file. Confirm `lib/sis/movements.ts` shape.

- [ ] **Step 2: Refactor**

- Identifier link: existing (KD #81 — `/records/students/[studentNumber]` with by-enrolee fallback).
- Promote: resolve `actor_email` to displayName via the same staff-list cache used by `users-admin` (per memory rule: staff are real `auth.users`).
- `facets`: Level, Kind (currently tabs — keep as tabs), AY (when `?scope=all`).
- `statusTabs`: All / Transfers / Withdrawn / Late enrolled (existing).
- `toolbarLeading`: existing "Include prior years" `<Switch>` stays.
- `pageSize`: 25.
- `csv`: `{ filename: 'movements-${ayCode}.csv' }`.

- [ ] **Step 3: Verify** — smoke at `/records/movements` with both `?scope=current` and `?scope=all`.

- [ ] **Step 4: Commit**

```
refactor(records): movements-table consumes <DataTable>
```

---

## Task 29: Migrate `section-roster-table.tsx` (spec § 5.11)

**Files:**
- Read: `components/sis/section-roster-table.tsx`
- Modify: same file

**Spec reference:** § 5.11.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: student name → `/records/students/[studentNumber]` (NEW per KD #81).
- Promote: `enrollment_date` + `withdrawal_date` as hidden-by-default columns; "Term joined" derived for late-enrollee rows (KD #68 pattern).
- `statusTabs`: Active / Late / Withdrawn / All (existing).
- `hidePagination`: true (≤50).
- `EnrollmentStatusBadge` replaces hand-rolled tinted Badges.

- [ ] **Step 3: Verify** — smoke at `/sis/sections/[id]`.

- [ ] **Step 4: Commit**

```
refactor(sis): section-roster-table consumes <DataTable>
```

---

## Task 30: Migrate `users-admin-client.tsx` (spec § 5.12)

**Files:**
- Read: `app/(sis)/sis/admin/users/users-admin-client.tsx` (or wherever the current path lives)
- Modify: same file

**Spec reference:** § 5.12. Promote search-only to managed by `<DataTable>`.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: displayName → none (no canonical user-detail page; keep plain text).
- Promote: `created_at` as hidden-by-default "Member since" column; `id` UUID excluded.
- `facets`: Role, Status (Enabled / Disabled).
- `pageSize`: 25.
- Plain-English: `school_admin` → `TABLE_COPY.schoolAdmin`.
- `emptyState`: "No staff users yet." / CTA "Invite user" (existing dialog trigger).

- [ ] **Step 3: Verify** — smoke at `/sis/admin/users`.

- [ ] **Step 4: Commit**

```
refactor(sis): users-admin consumes <DataTable>
```

---

## Task 31: Audit `sync-students/page.tsx` (spec § 5.13)

**Files:**
- Read: `app/(sis)/sis/sync-students/page.tsx`
- Modify: same file

**Spec reference:** § 5.13. **Wizard tables stay as static lists** (≤10 rows, embedded in wizard step). Only adopt `<DataTableEmptyState>` + `<StatusBadge>` + plain-English copy.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Apply lift**

- Replace any hand-rolled empty section ("no errors" case currently hidden) with `<DataTableEmptyState>`.
- Status pills → `<StatusBadge>`.
- Plain-English copy from `lib/copy/data-table.ts`: "Source rows" → `TABLE_COPY.rowsFromAdmissions`; "Section × student inserts" → `TABLE_COPY.newSectionAssignments`; "Set to withdrawn" → `TABLE_COPY.markedAsWithdrawn`.

- [ ] **Step 3: Verify** — smoke at `/sis/sync-students`.

- [ ] **Step 4: Commit**

```
refactor(sis): sync-students adopts <DataTableEmptyState> + plain-English copy
```

---

## Task 32: Migrate `ay-setup/page.tsx` (spec § 5.14)

**Files:**
- Read: `app/(sis)/sis/ay-setup/page.tsx`
- Modify: same file

**Spec reference:** § 5.14. Migrate despite small row count — column density + per-row action stack benefits from column visibility toggle.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: AY code → none.
- Promote: `created_at` hidden-by-default.
- `facets`: Status (Active / Inactive / Early-bird open).
- `hidePagination`: true (≤5 rows ever).
- Plain-English copy: `TABLE_COPY.createGradingSheets`, `TABLE_COPY.setAsCurrentAy`, `TABLE_COPY.copyTeacherAssignments`.
- Status badges: `<StatusBadge>` replaces inline Badge variants.
- `emptyState`: "No academic years yet." / CTA "New AY".

- [ ] **Step 3: Verify** — smoke at `/sis/ay-setup`.

- [ ] **Step 4: Commit**

```
refactor(sis): ay-setup consumes <DataTable>
```

---

## Task 33: Migrate `discount-codes/page.tsx` (spec § 5.15)

**Files:**
- Read: `app/(sis)/sis/admin/discount-codes/page.tsx`
- Modify: same file (and any client components)

**Spec reference:** § 5.15.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- `facets`: Type (enroleeType), Status (Active / Scheduled / Expired — computed).
- `pageSize`: 25.
- Status badge: `<DiscountCodeStatusBadge>` (refactored in Task 3).
- Plain-English: footer mention of `ay{YY}_discount_codes` → `TABLE_COPY.discountCodesFooter(ayLabel)`.
- `emptyState`: "No discount codes yet." / "Nothing configured for {AY label}. Use the New code button above to start."

- [ ] **Step 3: Verify** — smoke at `/sis/admin/discount-codes`.

- [ ] **Step 4: Commit**

```
refactor(sis): discount-codes consumes <DataTable>
```

---

## Task 34: Migrate `approvers/page.tsx` (spec § 5.16)

**Files:**
- Read: `app/(sis)/sis/admin/approvers/page.tsx`
- Modify: same file (and any client components)

**Spec reference:** § 5.16. Consolidates the 3 stacked per-flow tables into one with a Flow facet.

- [ ] **Step 1: Preflight** — confirm `auth.users.user_metadata.display_name` is reachable in the loader (per § 5.16 promote item).

- [ ] **Step 2: Refactor**

- Cut: per-flow `<Card>` wrappers (subsumed into Flow facet).
- Promote: displayName alongside email (resolve from staff cache).
- `facets`: Flow, Role.
- `pageSize`: 25.
- Plain-English: `school_admin` → `TABLE_COPY.schoolAdmin`.
- `emptyState`: "No approvers assigned yet. Teachers can't file requests until at least two approvers are configured."

- [ ] **Step 3: Verify** — smoke at `/sis/admin/approvers`.

- [ ] **Step 4: Commit**

```
refactor(sis): approvers consumes <DataTable> with Flow facet
```

**Worktree B complete. Open PR; request `feature-dev:code-reviewer` review; merge after review approval.**

---

### Worktree C — admissions-attendance-tables

**Tasks 35-36**: 2 surfaces. ~0.5 day wall time. (Cohort tables + completeness tables already migrated in Phase 1.)

---

## Task 35: Migrate `outdated-applications-table.tsx` (spec § 5.22)

**Files:**
- Read: `components/admissions/outdated-applications-table.tsx`
- Modify: same file

**Spec reference:** § 5.22. Toolbar is near-canonical, mostly mechanical.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: applicant name → `/admissions/applications/[enroleeNumber]?ay={ayCode}` (NEW per KD #81; currently no link).
- Promote: `studentNumber` hidden-by-default; `motherEmail` + `fatherEmail` hidden-by-default (loader fetches both).
- `facets`: Level (existing), Application status (NEW — tier tabs stay as status tabs).
- `statusTabs`: All / Critical / Warning / Never updated (existing tier tabs).
- `pageSize`: 25.
- `csv`: existing CSV export wired through.
- `emptyState`: existing "Nothing stale." card preserved as `emptyState`.

- [ ] **Step 3: Verify** — smoke at the consumer surface (likely `/admissions` dashboard).

- [ ] **Step 4: Commit**

```
refactor(admissions): outdated-applications consumes <DataTable>
```

---

## Task 36: Migrate `attendance/audit-log/page.tsx` (spec § 5.24)

**Files:**
- Read: `app/(attendance)/attendance/audit-log/page.tsx`
- Modify: same file (and any client components)

**Spec reference:** § 5.24. Promote bare static table → managed by `<DataTable>`.

**Out-of-scope-this-pass note:** § 5.24 raises pageSize from 500 hard cap to paginated query — server-side adjustment deferred (spec § 7.4). Migrate the UI; keep client-side cap of 500 for now; flag in commit.

- [ ] **Step 1: Preflight.**

- [ ] **Step 2: Refactor**

- Identifier link: action's entity reference → `/attendance/{section_id}?date={date}` for `attendance.daily.update`/`attendance.daily.correct`; `/attendance/{section_id}` for `attendance.import.bulk`.
- Promote: resolve `actor_email` → displayName (same as Task 28).
- `facets`: Action, Actor.
- `pageSize`: 25 (client-side; server cap stays 500 until follow-up).
- `csv`: `{ filename: 'attendance-audit-log.csv' }`.
- `emptyState`: "No audit entries yet." / "Once daily attendance is recorded, entries appear here."
- Plain-English: `TABLE_COPY.termSummary` + tooltip `TABLE_COPY.termSummaryTooltip`.

- [ ] **Step 3: Verify** — smoke at `/attendance/audit-log`.

- [ ] **Step 4: Commit**

```
refactor(attendance): audit-log consumes <DataTable>

Server-side pagination (raising 500 cap) deferred to follow-up
per spec §7.4.
```

**Worktree C complete. Open PR; request `feature-dev:code-reviewer` review; merge after review approval.**

---

## Phase 3 — Final integration

**Where:** `main` branch, after all 3 Phase 2 worktrees merged.

---

## Task 37: Final integration — cross-module smoke + KD #84 + sync-docs

- [ ] **Step 1: Confirm all 3 Phase 2 worktrees merged**

```bash
git log --oneline -20
```

Verify presence of commits from all three module groups.

- [ ] **Step 2: Final clean build**

```bash
npx next build
```

Must compile clean.

- [ ] **Step 3: Cross-module manual smoke pass**

Walk the registrar's nav exactly once:
1. `/records` — Records dashboard + `<student-data-table>`.
2. `/records/movements` — Movements with `<Switch>` toggle.
3. `/records/cohorts/stp` (and medical, pass-expiry) — `<CohortTable>` enrolled scope.
4. `/markbook/grading` — canonical reference.
5. `/markbook/change-requests` + `/markbook/audit-log`.
6. `/markbook/sections/[id]` — section roster.
7. `/markbook/report-cards` — section detail roster.
8. `/admissions` — completeness table + outdated-apps.
9. `/admissions/cohorts/promised` — bulk-notify works.
10. `/p-files` — completeness table + bulk-notify.
11. `/attendance/audit-log` — audit log.
12. `/sis/admin/users` + `/sis/admin/discount-codes` + `/sis/admin/approvers` + `/sis/ay-setup`.

For each: URL-state round-trip (set a filter → reload → state preserved), filter chip × works, "Clear all" works, empty-filtered state renders when filtering to zero.

- [ ] **Step 4: Add KD #84 to `.claude/rules/key-decisions/ui.md`**

Append after the existing #44 entry:

```markdown
### KD #84
Unified `<DataTable>` shell + extracted primitives consolidate the previously-scattered toolbar / pagination / bulk-action / status-badge / linkified-identifier patterns. Shell at `components/ui/data-table/index.tsx`; building blocks (sortable-header / facet-dropdown / filter-chip / pagination / bulk-action-footer / empty-state / csv) in the same folder. `<StatusBadge>` at `components/ui/status-badge.tsx` with 4 domain wrappers (`<ApplicationStatusBadge>` / `<DiscountCodeStatusBadge>` / `<DocumentStatusBadge>` / `<EnrollmentStatusBadge>`). `<IdentifierLink>` at `components/ui/identifier-link.tsx` applying KD #81 styling consistently. Two consolidation wrappers: `<CohortTable kind>` (4 cohort kinds → 1 file) and `<DocumentCompletenessTable module>` (admissions + p-files clones → 1 file). Plain-English copy registry at `lib/copy/data-table.ts`. URL state via `use-url-state.ts` hook with optional namespace prefix. KD #15 (TanStack canonical) stays valid; the shell is the canonical *consumer* of TanStack now. Per-row overflow menus + net-new bulk API surface deferred — shell exposes the slots, populate per-table next sprint.
```

- [ ] **Step 5: Update `.claude/rules/key-decisions.md` quick-lookup**

Add `· 84 ui` to the last quick-lookup row; bump max in the topic-files table to include `84` under `key-decisions/ui.md`.

- [ ] **Step 6: Run `/sync-docs`**

```
/sync-docs
```

Reconcile CLAUDE.md current-state line + `docs/sprints/development-plan.md` + design system § 4.1 + § 6 + § 8 + § 9 references.

- [ ] **Step 7: Final commit**

```
chore: sync docs after unified-data-tables Phase 3 — KD #84 added
```

---

## Self-review checklist

Before considering this plan ready to execute:

- [ ] All 24 in-scope surfaces from spec § 3 have a matching task (Tasks 17, 18 covers 4, 19 covers 2, 20-26 covers 7, 27-34 covers 8, 35-36 covers 2 = 1+4+2+7+8+2 = 24). ✓
- [ ] Phase 0 + Phase 1 land on `main` before Phase 2 worktrees branch. ✓
- [ ] Each task has Files / Steps / Verify / Commit subsections. ✓
- [ ] Phase 0 net-new primitives ship full code (Tasks 1-16). ✓
- [ ] Phase 2 migrations reference the spec § 5.X for column proposals + filters + status tabs. ✓
- [ ] Out-of-scope items (loader-join expansion for change-requests, server-side pagination for attendance audit-log) called out at the relevant tasks (20, 26, 36). ✓
- [ ] Per-table acceptance checklist (spec § 6.2) applies to every Phase 2 task. ✓
- [ ] Plan respects KD #15 (TanStack canonical), KD #21 (sonner via sileo shim — call sites still `import { toast } from 'sonner'`), KD #58 (shadcn primitives, install instead of substitute per memory), KD #81 (identifier link styling + destination map), Hard Rule #4 (studentNumber for cross-year), Hard Rule #5 (≤50 students gates `hidePagination`), Hard Rule #7 (no raw color tokens). ✓
- [ ] Phase 3 includes KD #84 entry + `/sync-docs`. ✓
- [ ] `superpowers:using-git-worktrees` referenced for Phase 2 setup. ✓
- [ ] `feature-dev:code-reviewer` referenced for per-worktree review (per user's stated preference). ✓
