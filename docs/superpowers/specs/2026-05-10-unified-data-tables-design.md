# Unified Data Tables — Design

**Date:** 2026-05-10
**Status:** Draft → awaiting user review
**Scope:** Cross-cutting (Markbook · Records · SIS Admin · Admissions · P-Files · Attendance)

---

## 1. Goal

Land one shared `<DataTable>` shell + supporting primitives so every full-fledged table in the app shares identical toolbar, pagination, empty-state, status-badge, and primary-identifier-link semantics. Migrate ~12 data tables and audit ~11 static lists in a single pass. Eliminate the boilerplate drift inventoried in §2 below.

The deliverable is **UI/composition only.** No new mutation API routes, no new server endpoints, no schema migrations.

---

## 2. Why now (the inventory finding)

A read-only audit of all 28 files using shadcn `<Table>` (excluding 3 editor grids protected by Hard Rule #4 + 9 drill sheets covered by KD #56) found:

- `SortableHeader` inlined 4× in different shapes (grading-data-table, audit-log-data-table, roster-table, outdated-applications + a different shape in cohort tables and movements).
- `FacetDropdown` (multi-select w/ checkboxes) inlined twice; reimplemented as inline JSX in audit-log.
- `FilterChip` (active-filter chip with × dismiss) exists only in grading-data-table.
- Pagination block (page-size Select + page-of-N + chevron quartet) duplicated **6×** with minor pageSize-options drift.
- Sticky bulk-action footer triplicated in promised-cohort + admissions-completeness + p-files-completeness.
- `StatusDot` slot pill duplicated in admissions + p-files completeness.
- **Five different status badge implementations**: `<ApplicationStatusBadge>` · `<DiscountCodeStatusBadge>` · `<Badge variant="success|blocked">` · hand-rolled tinted Badges · inline §9.3 recipe Badges.
- The 4 cohort tables (STP / promised / pass-expiry / medical) share row shape + toolbar shape — strong consolidation candidate.
- The 2 completeness tables (admissions + p-files) are line-for-line clones distinguished by a `module` discriminator.
- KD #81 (linkified primary identifier) violated in **8 surfaces**.
- High-signal data fetched-but-not-shown in 4 tables.
- Plain-English jargon (per memory rule) leaks in ~12 surfaces.

---

## 3. Scope

### In scope (this pass)

**Full data tables to migrate (12):**

1. `app/(markbook)/markbook/grading/grading-data-table.tsx` — refactor to consume the shell (canonical reference, shape preserved)
2. `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx`
3. `app/(markbook)/markbook/audit-log/audit-log-data-table.tsx`
4. `components/sis/movements-table.tsx`
5. `components/sis/student-data-table.tsx`
6. `components/sis/cohorts/stp-cohort-table.tsx` → `<CohortTable kind="stp">`
7. `components/sis/cohorts/promised-cohort-table.tsx` → `<CohortTable kind="promised">`
8. `components/sis/cohorts/pass-expiry-cohort-table.tsx` → `<CohortTable kind="pass-expiry">`
9. `components/sis/cohorts/medical-cohort-table.tsx` → `<CohortTable kind="medical">`
10. `components/admissions/completeness-table.tsx` → `<DocumentCompletenessTable module="admissions">`
11. `components/admissions/outdated-applications-table.tsx`
12. `components/p-files/completeness-table.tsx` → `<DocumentCompletenessTable module="p-files">`

**Static lists to audit + promote (12):**

1. `components/sis/section-roster-table.tsx`
2. `components/sis/users-admin-client.tsx` (table portion)
3. `components/markbook/all-publications-overview.tsx`
4. `components/markbook/attendance-readonly-table.tsx`
5. `app/(markbook)/markbook/sections/[id]/roster-table.tsx`
6. `app/(markbook)/markbook/report-cards/page.tsx` (section detail roster)
7. `app/(markbook)/markbook/grading/requests/page.tsx` ("My requests" table)
8. `app/(sis)/sis/sync-students/page.tsx` (per-level + errors)
9. `app/(sis)/sis/ay-setup/page.tsx`
10. `app/(sis)/sis/admin/discount-codes/page.tsx`
11. `app/(sis)/sis/admin/approvers/page.tsx`
12. `app/(attendance)/attendance/audit-log/page.tsx`

**Total in scope: 24 surfaces (12 data tables + 12 static lists).**

### Out of scope (explicitly deferred)

- **Editor grids** (`score-entry-grid`, `letter-grade-grid`, `wide-grid`) — protected by Hard Rule #4 + design system §6 as custom; Blank ≠ Zero semantics + autosave + native form controls don't fit a generic shell.
- **Drill sheets** (9 wrappers + `DrillDownSheet`) — separate primitive (KD #56), virtualized via `@tanstack/react-virtual`, different shape.
- **Net-new per-row overflow menus** with edit/lock/approve/withdraw — needs per-table workflow audit + new mutation routes + RBAC + audit log entries. Land the shell's overflow-column slot now; populate per-table next sprint.
- **Bulk actions on tables that don't already have wired routes** — no net-new bulk API surface this pass. Existing bulk-notify (P-Files chase queue, Admissions chase queue, Promised cohort) generalised through the shell's bulk slot.
- **Markbook change-requests JOIN expansion** — current loader doesn't join sheet → section.name / subject.name / term.label / student name. Surfacing those as columns requires a server-side change. Flagged separately in §7 below; not blocked by this pass.
- **Status badge migration outside in-scope tables** — cards, list rows, headers continue to use `<Badge>` until touched (per design system §4.2 touch-it-when-you-touch-it).

---

## 4. Architecture

### 4.1 File layout

```
components/ui/data-table/
  index.tsx                      — <DataTable> shell
  sortable-header.tsx            — replaces 4 inlined copies
  facet-dropdown.tsx             — multi-select + checkbox + count badge + clear footer
  filter-chip.tsx                — active-filter chip with × dismiss
  pagination.tsx                 — page-size Select + page-of-N + chevron quartet
  bulk-action-footer.tsx         — sticky-bottom selection toolbar
  empty-state.tsx                — gradient icon tile + serif title + body + optional CTA
  csv.ts                         — generalized CSV export helper
  use-url-state.ts               — URL-param sync hook
  types.ts                       — shared types (FacetConfig, StatusTabConfig, MeScopeConfig, etc.)

components/ui/
  status-badge.tsx               — <StatusBadge tone> single source
  identifier-link.tsx            — <IdentifierLink> applying KD #81 styling

components/sis/cohorts/
  cohort-table.tsx               — <CohortTable kind="stp|promised|pass-expiry|medical">
  (existing per-kind files become thin re-exports for back-compat OR are deleted if no other call sites)

components/shared/
  document-completeness-table.tsx — <DocumentCompletenessTable module="p-files|admissions">

lib/copy/
  data-table.ts                  — plain-English copy registry (§4.6)
```

### 4.2 `<DataTable>` shell API

```tsx
type DataTableProps<TRow> = {
  // Data
  data: TRow[];
  columns: ColumnDef<TRow>[];
  getRowId: (row: TRow) => string;

  // Search
  searchKeys?: Array<keyof TRow | ((row: TRow) => string)>;
  searchPlaceholder?: string;

  // Filters
  facets?: Array<{
    columnId: string;
    label: string;
    valueOptions?: string[];      // override faceted unique values (curated lists)
    showUnassigned?: boolean;     // append "(unassigned)" pseudo
  }>;

  statusTabs?: Array<{
    value: string;
    label: string;
    predicate: (row: TRow) => boolean;
    isDefault?: boolean;
    countOverride?: (rows: TRow[]) => number;  // when count differs from predicate match
  }>;

  meScope?: {
    userId: string | null;
    label: string;                 // "My sheets" / "My requests"
    icon?: LucideIcon;
    predicate: (row: TRow, userId: string) => boolean;
  };

  // Toolbar escape hatches
  toolbarLeading?: ReactNode;      // custom controls prepended to toolbar
  toolbarTrailing?: ReactNode;     // custom controls appended to toolbar (before column toggle)

  // Sort
  initialSort?: SortingState;

  // Pagination
  pageSize?: number;               // default 20
  pageSizeOptions?: number[];      // default [10, 20, 50, 100]
  hidePagination?: boolean;        // for tables capped to small row counts

  // Selection + bulk
  selection?: {
    enabled: boolean;
    bulkActions?: Array<{
      key: string;
      label: string;
      icon?: LucideIcon;
      onTrigger: (selectedRows: TRow[]) => void | Promise<void>;
      destructive?: boolean;
    }>;
  };

  // CSV export
  csv?: {
    filename: string;
    columns?: Array<{ header: string; accessor: (row: TRow) => string | number | null }>;
    // If omitted, derives from visible columns + their accessor keys
  };

  // URL state
  url?: {
    enabled: boolean;
    namespace?: string;            // for multi-table pages (rare)
    paramKeys?: {
      search?: string;             // default 'q'
      status?: string;             // default 'status'
      mine?: string;               // default 'mine'
      // facets default to facet.columnId
    };
  };

  // Empty states
  emptyState?: {
    icon?: LucideIcon;
    title: string;                 // serif
    body?: string;
    cta?: { label: string; href?: string; onClick?: () => void };
  };
  emptyFilteredState?: { title: string; body?: string };

  initialColumnVisibility?: VisibilityState;
  stickyHeader?: boolean;          // default false
};
```

**What the shell handles internally:**

- TanStack table setup (core + filtered + sorted + paginated + faceted row models).
- Global filter function (joins `searchKeys` into a haystack, debounces 300ms).
- URL-state sync via `use-url-state` hook (when `url.enabled`).
- Active-filter chip strip (auto-derived from active filters; "Clear" button auto-shows).
- Column visibility dropdown (auto-shows; respects `initialColumnVisibility`).
- Empty-state dispatch (`emptyState` for zero-data, `emptyFilteredState` for filtered-to-zero).
- Bulk-action sticky footer (auto-shows when `selection.enabled` and ≥1 row selected).
- CSV export button + click handler (when `csv` configured).

### 4.3 `<CohortTable>` consolidation wrapper

Replaces `stp-cohort-table.tsx` / `promised-cohort-table.tsx` / `pass-expiry-cohort-table.tsx` / `medical-cohort-table.tsx` (4 files) with one parameterized component.

```tsx
type CohortKind = 'stp' | 'promised' | 'pass-expiry' | 'medical';
type CohortScope = 'enrolled' | 'funnel';

<CohortTable
  kind="stp"
  scope="enrolled"
  ayCode={ayCode}
  rows={rows}
/>
```

Internal implementation:

- Per-kind column builder (`buildStpColumns`, `buildPromisedColumns`, etc.) lives in the same file.
- Per-kind status tab map.
- Linkified identifier route resolved by `kind + scope`:
  - `stp`/`pass-expiry`/`medical` + `enrolled` → `/records/students/[studentNumber]`
  - `stp`/`pass-expiry`/`medical` + `funnel` → `/admissions/applications/[enroleeNumber]?ay={ay}&tab=lifecycle`
  - `promised` (funnel-only) → `/admissions/applications/[enroleeNumber]?ay={ay}&tab=documents`
- Promised gets `selection.enabled=true` + bulk-notify wired through; other 3 kinds get `selection={undefined}`.

Existing per-kind files (`stp-cohort-table.tsx` etc.) DELETE after migration. No back-compat shims.

### 4.4 `<DocumentCompletenessTable>` consolidation wrapper

Replaces the line-for-line clone pair (`components/admissions/completeness-table.tsx` + `components/p-files/completeness-table.tsx`).

```tsx
<DocumentCompletenessTable
  module="p-files"                  // or "admissions"
  rows={rows}
  slotKeys={slotKeysForRow}         // function (row) => SlotKey[] for KD #61 / #69 conditional gating
  bulkRemindEnabled={isOperational} // page-level role gate (KD #74)
  bulkRemindWindowDays={30}         // p-files only — undefined means "expired only"
  initialStatusFilter={searchParams.status}
/>
```

Internal:

- Module-discriminated column builder (admissions: Level, Status text, action route `/admissions/applications/{enroleeNumber}`; p-files: Level, Section, action route `/p-files/{enroleeNumber}`).
- Per-module status options map (admissions: 4 statuses per KD #70; p-files: expired-only per KD #71).
- Per-slot dot grid column reused across both modules (`<DocumentStatusBadge>` per cell — see §4.5).
- Bulk-notify dialog mounted with `module` prop forwarded to `<BulkNotifyDialog>`.
- Linkified primary identifier (Student column) per KD #81 — fixes the current "trailing View column only" anti-pattern.

### 4.5 Status badge consolidation

**Primitive:** `components/ui/status-badge.tsx`

```tsx
type StatusTone = 'healthy' | 'locked' | 'info' | 'muted' | 'warning';

<StatusBadge tone="healthy" icon={CheckCircle2}>Open</StatusBadge>
<StatusBadge tone="locked" icon={Lock}>Locked</StatusBadge>
<StatusBadge tone="info" icon={Inbox}>Awaiting validation</StatusBadge>
<StatusBadge tone="muted">Withdrawn</StatusBadge>
<StatusBadge tone="warning" icon={Clock}>Lapses in 14 days</StatusBadge>
```

Encodes the design system §9.3 recipes once. Baseline `h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]`.

**Domain wrappers** (one map per domain; identical `<StatusBadge>` rendering):

- `<ApplicationStatusBadge status>` — refactored from existing; same domain mapping, no longer drifts on style.
- `<DiscountCodeStatusBadge>` — refactored from existing.
- `<DocumentStatusBadge status>` — NEW. Consolidates the per-slot status pills currently inlined as `StatusDot` in admissions + p-files completeness, and the SlotPill in cohort tables.
- `<EnrollmentStatusBadge status>` — NEW. Consolidates the hand-rolled section-roster variants (active / late_enrollee / withdrawn).

`<Badge variant="success|blocked|secondary">` keeps working in `components/ui/badge.tsx` for non-status uses (counts, taxonomy chips). Status uses migrate to `<StatusBadge>`.

### 4.6 Plain-English copy registry

`lib/copy/data-table.ts` — single source for user-visible strings that previously leaked dev jargon. Initial entries:

| Key | Plain-English | Replaces |
| --- | --- | --- |
| `awaitingParentReply` | "Awaiting parent reply" | "Has To follow" |
| `sentBackToParent` | "Sent back to parent" | "Has rejected" |
| `lapsedReupload` | "Lapsed (re-upload needed)" | "Has expired" |
| `awaitingValidation` | "Awaiting validation" | "Pending review" / "Uploaded" |
| `termSummary` | "Term summary" + tooltip "Older format, no longer written" | "Term summary (legacy)" |
| `schoolAdmin` | "School admin" | `school_admin` |
| `rowsFromAdmissions` | "Rows from admissions" | "Source rows" |
| `newSectionAssignments` | "New section assignments" | "Section × student inserts" |
| `markedAsWithdrawn` | "Marked as withdrawn" | "Set to withdrawn" |
| `discountCodesFooter` | "These codes apply to the {label} enrolment portal." | `<code>ay{YY}_discount_codes</code>` |
| `createGradingSheets` | "Create grading sheets for this AY" | "Generate sheets" |
| `setAsCurrentAy` | "Set as current AY" | "Switch active" |
| `copyTeacherAssignments` | "Copy teacher assignments from prior AY" | "Copy teachers" |

Slot-header truncations (`M/PP`, `F/Pass`, `S/Pass`) keep their compact form on the table cells but gain a `<Tooltip>` showing the full label on hover. Legend strip stays.

### 4.7 URL state contract

When `url.enabled`, the shell writes these params (debounced 300ms for search, immediate for everything else):

| Param | Source | Format |
| --- | --- | --- |
| `q` | search box | string |
| `status` | status tab | string (only when ≠ default tab) |
| `mine` | "My X" toggle | `1` or absent |
| `<facet.columnId>` | each faceted filter | comma-joined values |
| `page` | pagination | number (only when > 1) |
| `pageSize` | rows-per-page | number (only when ≠ default) |

Multi-table pages (sync-students wizard) pass `url.namespace='preview'` to prefix every key.

Page-level scope params (`?ay=`, `?section_id=`, `?term_id=`, `?sheet_id=`, `?req=`, `?action=`, `?expiring=N`) stay outside the shell. Pages parse them → derive props for the shell.

### 4.8 Universalised KD #81 linkification

`<IdentifierLink href>` primitive applies the canonical KD #81 hover treatment (`font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4`).

Every in-scope table's primary identifier column uses `<IdentifierLink>`. Per-module destination map (per KD #81):

| Module | Identifier column | Destination |
| --- | --- | --- |
| Markbook entry rows | studentName | `/records/students/[studentNumber]` |
| Markbook sheet/CR rows | section | `/markbook/grading?section=[sectionId]` |
| Attendance entry / top-absent / compassionate | studentName | `/attendance/students/[studentNumber]` |
| Attendance section-summary | sectionName | `/attendance/[sectionId]` |
| Evaluation writeup | studentName | `/records/students/[studentNumber]` |
| Admissions | enroleeFullName | `/admissions/applications/[enroleeNumber]` |
| Records | studentName | `/records/students/[studentNumber]` (with `/records/students/by-enrolee/[enroleeNumber]` fallback) |
| P-Files | enroleeFullName | `/p-files/[enroleeNumber]` |
| Lifecycle | enroleeFullName | stage-conditional: Enrolled→Records, else Admissions |

Audit-log tables also linkify the entity (where `entity_type + entity_id` is present). New behavior: when `action='attendance.daily.update'` with `entity_type='section'`, the row gets a deep-link to `/attendance/{section_id}?date={date}`. Same pattern extended to all `attendance.*` actions and reused across Markbook audit log entity references.

---

## 5. Per-table column proposals

For each in-scope table: linkified identifier route, columns to **cut** (with reason), columns to **promote** from "available data not currently shown", filters to add, status tabs, page size, bulk actions, empty-state copy. Column changes follow the design system (mono for IDs/dates, serif for headlines, sans for body, `tabular-nums` for numerics).

### 5.1 Markbook — `grading-data-table.tsx` (canonical refactor)

Refactor to consume `<DataTable>` — no column changes; preserves the shape that all peers will follow.

- **Identifier link:** section → `/markbook/grading/[sheetId]` (already correct; updates from plain `underline` to canonical KD #81 hover styling).
- **Cut:** none.
- **Promote:** none (current shape is the reference).
- **Facets:** Level, Subject, Term, Teacher, Form adviser (curated options for Teacher + Form adviser per existing pattern).
- **Status tabs:** All / Open / Locked / With blanks (counts).
- **Me scope:** "My sheets" predicate (subject_teacher_id || form_adviser_id == userId).
- **Page size:** 20 (default).
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'grading-sheets-${ayCode}.csv' }}`.
- **Empty state:** "No grading sheets yet." / CTA "New sheet" → `/markbook/grading/new`.
- **Empty filtered state:** "No sheets match the current filters."

### 5.2 Markbook — `change-requests-data-table.tsx`

- **Identifier link:** section name (NEW column — see Promote below) → `/markbook/grading/[sheetId]`.
- **Cut:** none (table is event-shaped; every column is signal).
- **Promote:** **Section + Subject + Term + Student name** columns. Current loader does NOT join `grading_sheets` → section.name / subject.name / term.label / student. **This is a server-side loader change** — flagged in §7 as the only out-of-shell fix this pass needs. If the loader change ships, columns appear; if deferred, table migrates without these columns and gets them in a follow-up.
- **Facets:** Status, Field changed (W1–W5/PT1–PT5/QA/Letter), Reason category. Once Section/Subject/Term land: also Section + Subject + Term facets.
- **Status tabs:** All / Pending / Approved / Applied / Rejected / Cancelled (counts).
- **Page size:** 20.
- **Bulk:** none (per-request decision is a deliberate workflow).
- **CSV:** `csv={{ filename: 'change-requests-${ayCode}.csv' }}`.
- **Toolbar leading:** existing custom date-range picker stays as `toolbarLeading`.
- **Empty state:** "No change requests yet."
- **Empty filtered state:** "No requests match the current filters."

### 5.3 Markbook — `audit-log-data-table.tsx`

- **Identifier link:** Sheet UUID → `/markbook/grading/[sheetId]` (when present); entity-typed events get deep-link to relevant detail (extends to attendance audit-log as well).
- **Cut:** none.
- **Promote:** add `entity_type` + `entity_id` derived "Open" cell that deep-links to canonical detail surface per action.
- **Facets:** Action (mono Badge), Actor.
- **Status tabs:** none (event-shaped, time-ordered).
- **Page size:** 25 (default).
- **Bulk:** none.
- **CSV:** existing CSV export wired through `csv={{ filename: ... }}`.
- **Toolbar leading:** existing custom date-range picker stays.
- **Empty state:** "No audit entries yet."
- **Empty filtered state:** "No audit entries match the current filters."

### 5.4 Markbook — `all-publications-overview.tsx`

Promote from static table → managed by `<DataTable>`.

- **Identifier link:** section name → `/markbook/report-cards?section_id={sectionId}` (currently behind a trailing "Open" link).
- **Cut:** none.
- **Promote:** notification status (`notified_at`) as a small badge in the Status column; published-by actor as a hidden-by-default column.
- **Facets:** Level, Status (Scheduled / Open / Closed / Revoked).
- **Status tabs:** Current term / All terms (existing).
- **Page size:** 25.
- **Bulk:** none (publication windows are configured one at a time).
- **CSV:** `csv={{ filename: 'publications-${ayCode}.csv' }}`.
- **Empty state:** "No publication windows yet." / CTA "Configure" → `/markbook/report-cards`.
- **Empty filtered state:** "No publication windows match the current filters."

### 5.5 Markbook — `attendance-readonly-table.tsx`

Promote from bare static table → managed by `<DataTable>`.

- **Identifier link:** student name → `/attendance/students/[studentNumber]` (NEW per KD #81).
- **Cut:** none.
- **Promote:** indicate `enrollment_status='late_enrollee'` with a small inline `<EnrollmentStatusBadge>` after the name (currently only `withdrawn` gets visual treatment via strikethrough).
- **Facets:** Status (Active / Late / Withdrawn).
- **Status tabs:** none (small row count; facet is enough).
- **Page size:** none (≤50 per Hard Rule #5; render all rows; `hidePagination={true}`).
- **Bulk:** none (read-only mirror).
- **Empty state:** "No students enrolled." / "Sync from admissions or add a student to this section first."

### 5.6 Markbook — `sections/[id]/roster-table.tsx`

Migrate to `<DataTable>`; preserves existing search + status tabs + sort + pagination behavior.

- **Identifier link:** student name → `/records/students/[studentNumber]` (NEW per KD #81; currently the "Grades" action button is the only link, and uses `students.id` UUID — Hard Rule #4 requires `studentNumber` for cross-year linking).
- **Cut:** none. (KD #81 says linkify the primary identifier — it doesn't say strip other links. The "Grades" action stays as a quick path to the report-card surface; the linkified name is the new path to the full student-detail page in Records.)
- **Promote:** `enrollment_date` + `withdrawal_date` (loader fetches both, never rendered) as hidden-by-default columns.
- **Facets:** Status (existing tabs become a facet OR stay as tabs — keep as tabs for parity with grading-data-table).
- **Status tabs:** All / Active / Late / Withdrawn (existing).
- **Page size:** 25.
- **Bulk:** none.
- **Empty state:** "No students enrolled yet."

### 5.7 Markbook — `report-cards/page.tsx` (section detail roster)

Promote from bare static table → managed by `<DataTable>`.

- **Identifier link:** student name → `/markbook/report-cards/[studentId]` (currently behind trailing "Preview" button).
- **Cut:** "Preview" trailing button (replaced by linkified name).
- **Promote:** per-student publication status badge (Scheduled / Open / Closed / Revoked) — derive from publication windows array passed to the page.
- **Facets:** none (single section).
- **Status tabs:** All / Published / Awaiting publication.
- **Page size:** none (≤50; `hidePagination={true}`).
- **Bulk:** none.
- **Empty state:** "No students enrolled."

### 5.8 Markbook — `grading/requests/page.tsx` ("My requests")

Promote from bare static table → managed by `<DataTable>`.

- **Identifier link:** sheet (NEW column — same loader gap as 5.2; lands when 5.2 lands).
- **Cut:** none.
- **Promote:** Section + Subject + Term + Student (same loader change as 5.2, deferred together).
- **Facets:** Status, Field changed.
- **Status tabs:** All / Pending / Approved / Applied / Rejected / Cancelled.
- **Page size:** 25.
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'my-change-requests.csv' }}`.
- **Empty state:** "You haven't filed any change requests yet."

### 5.9 Records — `student-data-table.tsx`

Migrate to `<DataTable>`; existing surface is closest to canonical, mostly mechanical.

- **Identifier link:** name → `/records/students/[studentNumber]` (existing; styling updates to canonical KD #81).
- **Cut:** "Applicant Number" column hidden by default (Hard Rule #4 — `enroleeNumber` resets each AY; risks confusion with `studentNumber` displayed alongside). Available via column visibility toggle.
- **Promote:** `applicationUpdatedDate` as hidden-by-default column ("Last updated" — sortable; useful when narrowing to stale rows).
- **Facets:** Level, Section (existing), plus Status (currently a tab — keep as tab).
- **Status tabs:** All / Enrolled / Pipeline / Withdrawn (existing).
- **Page size:** 25.
- **Bulk:** none (record edits are per-student via detail surface).
- **CSV:** `csv={{ filename: 'students-${ayCode}.csv' }}`.
- **Empty state:** "No students in view." / "Adjust the filters above or search across academic years for a returning student."
- **Empty filtered state:** same.

### 5.10 Records — `movements-table.tsx`

Migrate to `<DataTable>`. Currently has tabs + search + sort + scope toggle but no pagination + no facets.

- **Identifier link:** student → `/records/students/[studentNumber]` with `/records/students/by-enrolee/[enroleeNumber]` fallback (existing per KD #81).
- **Cut:** none.
- **Promote:** Resolve `actor_email` to displayName via the same `auth.admin.listUsers` cache used by users-admin (currently rendered as raw mono email; staff are real `auth.users` per memory rule).
- **Facets:** Level, Kind (currently tabs — keep as tabs), AY (when `?scope=all`).
- **Status tabs:** All / Transfers / Withdrawn / Late enrolled (existing).
- **Toolbar leading:** existing "Include prior years" `<Switch>` stays.
- **Page size:** 25 (with `?scope=all`, row count grows multi-AY).
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'movements-${ayCode}.csv' }}`.
- **Empty state:** "No movements yet." / "Section transfers, withdrawals, and late enrolments will appear here as the registrar records them."
- **Empty filtered state:** "No movements match the current filters."

### 5.11 Records — `section-roster-table.tsx`

Migrate to `<DataTable>`. Currently has tabs only.

- **Identifier link:** student name → `/records/students/[studentNumber]` (NEW per KD #81).
- **Cut:** none.
- **Promote:** `enrollment_date` + `withdrawal_date` as hidden-by-default columns; "Term joined" derived from `enrollment_date` for late-enrollee rows (KD #68 pattern).
- **Facets:** Status (currently tabs — keep as tabs).
- **Status tabs:** Active / Late / Withdrawn / All (existing).
- **Page size:** none (≤50 Hard Rule #5; `hidePagination={true}`).
- **Bulk:** none.
- **Status badge:** `<EnrollmentStatusBadge>` replaces hand-rolled tinted Badges.
- **Empty state:** "No students in this section."

### 5.12 SIS Admin — `users-admin-client.tsx`

Promote from search-only static table → managed by `<DataTable>`.

- **Identifier link:** displayName → none (no canonical user-detail page; `<IdentifierLink>` not used here — keep plain text).
- **Cut:** none.
- **Promote:** `created_at` as hidden-by-default column ("Member since"); `id` UUID excluded (operational use only).
- **Facets:** Role, Status (Enabled / Disabled).
- **Status tabs:** none (facets cover it).
- **Page size:** 25.
- **Bulk:** none (per-user role changes are deliberate one-at-a-time decisions).
- **Empty state:** "No staff users yet." / CTA "Invite user" (existing dialog trigger).

### 5.13 SIS Admin — `sync-students/page.tsx`

Wizard tables stay as-is (small static lists inside a step). No `<DataTable>` migration. Adopt:

- `<EmptyState>` primitive for the "no errors" case (currently the section is just hidden).
- `<StatusBadge>` for any status pills.
- Plain-English copy from `lib/copy/data-table.ts`: "Source rows" → "Rows from admissions"; "Section × student inserts" → "New section assignments"; "Set to withdrawn" → "Marked as withdrawn".

Justification: ≤10 rows, embedded in a wizard step with surrounding context. Toolbar would be noise.

### 5.14 SIS Admin — `ay-setup/page.tsx`

Migrate to `<DataTable>` despite small row count — column density (8 columns) + per-row action stack benefits from column visibility toggle + persistent header.

- **Identifier link:** AY code → none (no canonical AY-detail page; AY operations happen via inline action chips per row).
- **Cut:** none.
- **Promote:** `created_at` as hidden-by-default column.
- **Facets:** Status (Active / Inactive / Early-bird open).
- **Status tabs:** none.
- **Page size:** none (`hidePagination={true}`; ≤5 rows ever).
- **Bulk:** none.
- **Status badges:** `<StatusBadge>` replaces inline Badge variants.
- **Plain-English copy:** "Generate sheets" → "Create grading sheets for this AY"; "Switch active" → "Set as current AY"; "Copy teachers" → "Copy teacher assignments from prior AY".
- **Empty state:** "No academic years yet." / CTA "New AY".

### 5.15 SIS Admin — `discount-codes/page.tsx`

Migrate to `<DataTable>`.

- **Identifier link:** code → none (no canonical detail page; row actions via `<DiscountCodeRowActions>`).
- **Cut:** none.
- **Promote:** none.
- **Facets:** Type (enroleeType), Status (Active / Scheduled / Expired — computed).
- **Status tabs:** none (facet covers it).
- **Page size:** 25.
- **Bulk:** none.
- **Status badge:** `<DiscountCodeStatusBadge>` (refactored to use `<StatusBadge>`).
- **Plain-English copy:** Footer mentions of `ay{YY}_discount_codes` table-name → "These codes apply to the {AY label} enrolment portal."
- **Empty state:** "No discount codes yet." / "Nothing configured for {AY label}. Use the New code button above to start."

### 5.16 SIS Admin — `approvers/page.tsx`

Migrate to `<DataTable>` — consolidates the 3 stacked per-flow tables into one with a Flow facet.

- **Identifier link:** user (email + displayName resolved) → none.
- **Cut:** per-flow `<Card>` wrappers (subsumed into the Flow facet).
- **Promote:** **displayName** alongside email (loader currently returns email only despite `auth.users.user_metadata.display_name` being available — `users-admin-client` proves it's reachable).
- **Facets:** Flow, Role.
- **Status tabs:** none.
- **Page size:** 25.
- **Bulk:** none.
- **Plain-English copy:** Help text references to `school_admin` raw role → "School admin".
- **Empty state:** "No approvers assigned yet. Teachers can't file requests until at least two approvers are configured."

### 5.17 Admissions — `<CohortTable kind="stp">`

(See §4.3 for the `<CohortTable>` API.)

- **Identifier link:** student → scope-conditional per §4.8.
- **Cut:** none.
- **Promote:** none (`stpType` + 3 STP slots + residence + STP complete are the canonical signal).
- **Facets:** Level, STP type, Application status.
- **Status tabs:** Incomplete (default) / Complete / All.
- **Page size:** 25.
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'stp-cohort-${ayCode}.csv' }}`.
- **Empty state:** "No STP applicants yet." / "Students with `stpApplicationType` set will appear here." (Plain English: avoid the column name; rephrase as "Students whose application requires a Student Pass will appear here.")

### 5.18 Admissions — `<CohortTable kind="promised">`

- **Identifier link:** student → `/admissions/applications/[enroleeNumber]?ay={ay}&tab=documents` (existing).
- **Cut:** none.
- **Promote:** `note` per `PromisedSlot` (currently in loader payload but only "promised by date" shown).
- **Facets:** Level, Application status.
- **Status tabs:** Past-due / Due today / Within 7 days (default) / Within 14 days / Within 30 days / All.
- **Page size:** 25.
- **Bulk:** **enabled** (existing wiring; bulk-notify → `<BulkNotifyDialog module="admissions">`).
- **CSV:** `csv={{ filename: 'promised-cohort-${ayCode}.csv' }}`.
- **Empty state:** "No promised documents yet." / "Slots that the parent has acknowledged as pending will appear here."

### 5.19 Admissions — `<CohortTable kind="pass-expiry">`

- **Identifier link:** student → scope-conditional per §4.8.
- **Cut:** none.
- **Promote:** breakdown of which parent/guardian (mother/father/guardian) holds each expiry (currently collapsed into a chip strip).
- **Facets:** Level, Application status, Pass kind (Student passport / Student pass).
- **Status tabs:** Already lapsed / Within 30 days (default) / Within 60 days / Within 90 days / All future.
- **Page size:** 25.
- **Bulk:** **enable** bulk-notify (parents need re-upload reminders too — same pattern as Promised + DocumentCompleteness; route already exists for P-Files; admissions side reuses `module="admissions"`).
- **CSV:** `csv={{ filename: 'pass-expiry-${ayCode}.csv' }}`.
- **Empty state:** "No pass expiries to watch."

### 5.20 Admissions — `<CohortTable kind="medical">`

- **Identifier link:** student → scope-conditional per §4.8.
- **Cut:** none.
- **Promote:** none.
- **Facets:** Level, Application status, Flag (multi-select).
- **Status tabs:** Any flag (default) / Allergies / Asthma / Multiple flags / Paracetamol: Yes / Paracetamol: No.
- **Page size:** 25.
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'medical-cohort-${ayCode}.csv' }}`.
- **Empty state:** "No students with medical flags."

### 5.21 Admissions — `<DocumentCompletenessTable module="admissions">`

- **Identifier link:** Applicant name → `/admissions/applications/[enroleeNumber]?ay={ayCode}` (NEW per KD #81; currently only the trailing "View" column links).
- **Cut:** trailing "Action" column (replaced by linkified name).
- **Promote:** **Submitted date** column (loader fetches `apps.created_at` but never renders it — high-signal "age in pipeline" indicator).
- **Facets:** Level (existing), Status (use plain-English keys per §4.6: "Awaiting parent reply" / "Sent back to parent" / "Awaiting validation" / "Lapsed (re-upload needed)").
- **Status tabs:** none (status is a facet).
- **Page size:** 25.
- **Bulk:** **enabled** (existing — bulk-notify; gated by `bulkRemindEnabled` prop driven by `isOperational` per KD #74).
- **CSV:** `csv={{ filename: 'admissions-completeness-${ayCode}.csv' }}`.
- **Status badge:** `<ApplicationStatusBadge>` for the app status column (currently plain text — visual parity with student-data-table).
- **Slot dot grid:** `<DocumentStatusBadge>` per cell. Slot-header truncations gain `<Tooltip>` showing full label.
- **Empty state:** "No applicants in the chase queue."
- **Empty filtered state:** "No applicants match the current filters."

### 5.22 Admissions — `outdated-applications-table.tsx`

Migrate to `<DataTable>`; existing toolbar is near-canonical, mostly mechanical.

- **Identifier link:** Applicant name → `/admissions/applications/[enroleeNumber]?ay={ayCode}` (NEW per KD #81; currently no link at all).
- **Cut:** none.
- **Promote:** **studentNumber** as hidden-by-default column; **mother + father email** as hidden-by-default columns (loader fetches both, currently never rendered — useful when registrar needs to chase).
- **Facets:** Level (existing), Application status (NEW; tier tabs stay as status tabs).
- **Status tabs:** All / Critical / Warning / Never updated (existing tier tabs).
- **Page size:** 25.
- **Bulk:** none (per-applicant chase is via the bulk-notify route on the chase queue, not this table).
- **CSV:** existing CSV export wired through `csv={{ filename: ... }}`.
- **Empty state:** existing "Nothing stale." card preserved.

### 5.23 P-Files — `<DocumentCompletenessTable module="p-files">`

- **Identifier link:** Student name → `/p-files/[enroleeNumber]?ay={ayCode}` (NEW per KD #81; currently only trailing View column links).
- **Cut:** trailing "Action" column (replaced by linkified name).
- **Promote:** Per-slot **expiryDate** rendered inline below the dot grid for any slot with `Expired` or `Expires within window` status (loader fetches `slot.expiryDate`, currently only used for the dot — registrar must click into detail to see the actual date).
- **Facets:** Level, Section (existing — section cascades on level), Status (existing per KD #71: "Lapsed (re-upload needed)" only).
- **Status tabs:** none.
- **Page size:** 25.
- **Bulk:** **enabled** (existing — bulk-notify with `bulkRemindWindowDays` 30/60/90).
- **CSV:** `csv={{ filename: 'p-files-completeness-${ayCode}.csv' }}`.
- **Status badge:** `<ApplicationStatusBadge>` for any app status column; `<DocumentStatusBadge>` per slot.
- **Slot dot grid:** truncations gain `<Tooltip>` for full label.
- **Empty state:** "No expiring documents." / "Renewal queue clears when every parent has re-uploaded."

### 5.24 Attendance — `audit-log/page.tsx`

Promote from bare static table → managed by `<DataTable>` (matches Markbook audit-log shape).

- **Identifier link:** Action's entity reference → `/attendance/{section_id}?date={date}` for `attendance.daily.update`/`attendance.daily.correct`; `/attendance/{section_id}` for `attendance.import.bulk` (NEW per §4.8).
- **Cut:** none.
- **Promote:** Resolve `actor_email` → displayName (same as Movements 5.10).
- **Facets:** Action, Actor.
- **Status tabs:** none (event-shaped).
- **Page size:** 25 (raise from 500 hard cap to paginated query — server-side adjustment).
- **Bulk:** none.
- **CSV:** `csv={{ filename: 'attendance-audit-log.csv' }}`.
- **Empty state:** "No audit entries yet." / "Once daily attendance is recorded, entries appear here."
- **Plain-English copy:** "Term summary (legacy)" → "Term summary" + tooltip.

---

## 6. Migration plan

### 6.1 Phase order (sequential within phase, parallel agents across phases when independent)

**Phase 0 — Shell + primitives (sequential, single agent on main worktree):**

1. Build `<StatusBadge>` + 4 domain wrappers (Application/DiscountCode/Document/Enrollment).
2. Build `<IdentifierLink>` primitive.
3. Build `<DataTable>` shell + 7 building-block files (sortable-header / facet-dropdown / filter-chip / pagination / bulk-action-footer / empty-state / csv).
4. Build `use-url-state` hook.
5. Build `lib/copy/data-table.ts` with initial entries.
6. Refactor `grading-data-table.tsx` to consume the shell — **this is the validation pass**. If the shell can't reproduce the canonical reference exactly, fix the shell, not the canonical reference.
7. Verify with `npx next build` clean compile + manual smoke test of `/markbook/grading`.

**Phase 1 — Wrappers (sequential after Phase 0):**

1. Build `<CohortTable>` wrapper — migrate the 4 cohort tables; delete the per-kind files.
2. Build `<DocumentCompletenessTable>` wrapper — migrate admissions + p-files completeness; the existing `components/admissions/completeness-table.tsx` + `components/p-files/completeness-table.tsx` become thin re-exports OR get deleted (no other call sites).

**Phase 2 — Per-module migration (parallel agents on isolated worktrees):**

Three worktrees, one per module group. Each worktree's work is planned via `feature-dev:code-architect`, implemented by a general-purpose agent on the worktree, then reviewed by `feature-dev:code-reviewer` before merging back to main (per user's stated review preference).

| Worktree | Tables (count) | Estimated wall time |
| --- | --- | --- |
| `markbook-tables` | 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8 — 7 surfaces | ~1 day |
| `records-sis-admin-tables` | 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16 — 8 surfaces | ~1 day |
| `admissions-attendance-tables` | 5.22, 5.24 (cohorts + completeness tables already migrated in Phase 1) — 2 surfaces | ~0.5 day |

Phase 0 + 1 cover 7 surfaces (5.1 + 5.17–5.20 + 5.21 + 5.23). Phase 2 covers the remaining 17. Total: 24 surfaces, matching §3.

Each worktree:
- Starts fresh from main after Phase 0 + Phase 1 land.
- Migrates its tables one at a time, committing per table.
- Runs `npx next build` after each table.
- Runs manual smoke test in browser per table (URL-state round-trip, empty state, filter clear, pagination, status tabs).
- Submits for `feature-dev:code-reviewer` review before merge.

**Phase 3 — Final integration (sequential on main):**

1. Merge all 3 worktrees in order.
2. Final `npx next build` + cross-module manual smoke pass.
3. `/sync-docs` to update CLAUDE.md current-state line + KD index (new KD #84 — "Unified data table shell").

### 6.2 Per-table acceptance checklist (each migration must pass all 8)

1. Shell consumed via `<DataTable>` (or `<CohortTable>` / `<DocumentCompletenessTable>`).
2. Primary identifier linkified via `<IdentifierLink>` to canonical destination per §4.8.
3. Status pills use `<StatusBadge>` or its domain wrapper — no hand-rolled tinted Badges.
4. Plain-English copy from `lib/copy/data-table.ts` where applicable.
5. URL-state round-trip tested: change a filter → reload page → state preserved.
6. Empty state + empty-filtered state both render correctly.
7. `npx next build` compiles clean.
8. No `#rrggbb` / `oklch(...)` / `slate-*` / `zinc-*` / `gray-*` / `bg-white` / `bg-black` introduced (Hard Rule #7).

### 6.3 Per-module preflight before each worktree starts

- Worktree author re-reads §5 entries for their tables.
- Confirms loader paths + DB columns claimed in this spec are still accurate (this spec ages — by the time the worktree starts, days may have passed; re-grep the loader file before writing code).
- Flags any per-table proposal that doesn't survive the loader-read step BEFORE writing code.

---

## 7. Out of scope / deferred items

These are flagged here so they don't get accidentally bundled into the unification pass. Each becomes a follow-up sprint candidate.

1. **Per-row overflow menus** with edit/lock/approve/withdraw — needs per-table workflow validation. Shell ships the overflow-column slot; population deferred. Land after observing which actions registrars want from the table view.
2. **Net-new bulk action API routes** — only existing routes (bulk-notify on P-Files chase, admissions chase, promised cohort) are wired through the shell. Bulk-export-CSV becomes universal because every shell-managed table already has the column data client-side.
3. **Markbook change-requests JOIN expansion** — the loader-side change to surface section / subject / term / student name on change requests is OUT of this UI pass but called out as a critical follow-up. Without it, sections 5.2 and 5.8 ship without those columns. Suggested: separate ticket `change-requests-loader-join-expansion` to land in parallel.
4. **Attendance audit-log server-side pagination** — current 500-row hard cap stays as a temporary client-side limit; converting to true server-paginated is a follow-up (loader change + tag-aware caching).
5. **Status badge migration outside in-scope tables** — cards, list rows, headers continue to use `<Badge>` until touched (touch-it-when-you-touch-it per design system §4.2).
6. **Per-row save/edit inline** — not a goal of this pass. Edits continue to flow via the canonical detail surfaces (`<Sheet>` editors, dedicated `[id]` routes).
7. **Mobile-specific table layouts** — the existing horizontal scroll + sticky-left primary identifier is the mobile story for now. No per-table mobile cards.

---

## 8. Risks

1. **Shell can't reproduce the canonical reference 1:1.** Mitigation: Phase 0 Step 6 explicitly refactors `grading-data-table.tsx` against the shell as the validation pass before any other migration starts.
2. **Per-table proposals discovered wrong during implementation.** Mitigation: §6.3 preflight per worktree reads the loader and confirms the spec's claims before writing code.
3. **3 parallel worktrees create merge conflicts on `components/ui/data-table/`.** Mitigation: Phase 0 + Phase 1 land on main first; the 3 worktrees only touch per-table call sites, not the shell.
4. **`<CohortTable>` parameterization too rigid for future cohort kinds.** Mitigation: column builder is per-kind module-scope function, not a switch statement — adding a new kind is one new function.
5. **URL state writeback collides with page-level params on multi-table pages.** Mitigation: `url.namespace` prefix; only sync-students wizard hits this.
6. **Bulk-notify wired generically might fire on cohorts without bulk routes.** Mitigation: `selection.enabled` defaults to false; per-table sets explicitly.
7. **Plain-English copy review surfaces more jargon than catalogued.** Mitigation: `lib/copy/data-table.ts` is open for extension; per-worktree author adds entries as discovered, no new module needed.
8. **`<DataTable>` API drift over time** — every new caller pushes a new prop. Mitigation: explicit `toolbarLeading` / `toolbarTrailing` escape hatches mean unusual cases compose externally without bloating the shell API.

---

## 9. Acceptance for the whole pass

- 24 in-scope surfaces (12 data tables + 12 static lists) all pass the §6.2 checklist.
- 5 inlined `SortableHeader` copies → 1 shared.
- 6 inlined `Pagination` copies → 1 shared.
- 3 inlined sticky bulk-action footers → 1 shared.
- 5 status badge implementations → 1 primitive + 4 domain wrappers.
- 4 cohort table files → 1 `<CohortTable>` wrapper.
- 2 completeness table files → 1 `<DocumentCompletenessTable>` wrapper.
- KD #81 linkified primary identifier on every in-scope surface.
- `lib/copy/data-table.ts` populated with at least the 13 entries in §4.6.
- `npx next build` clean.
- Manual cross-module smoke pass (registrar nav: `/records` → `/markbook/grading` → `/admissions` → `/p-files` → `/attendance/audit-log` → `/sis/admin/users`).
- `/sync-docs` ran; new KD #84 added; CLAUDE.md current-state line updated; design system §4.1 + §6 + §8 + §9 references updated where relevant.

---

## 10. Numbering for the new KD

Next available KD number is **#84** (see `.claude/rules/key-decisions.md` quick lookup — gaps at 19, 26, 30; current max is 83). The KD will live in `.claude/rules/key-decisions/ui.md` (alongside #14, #15, #20, #21, #24, #44 — the UI-tokens / data-table family).

Proposed KD #84 entry (to be added when implementation lands, not now):

> **KD #84.** Unified `<DataTable>` shell + extracted primitives consolidate the previously-scattered toolbar / pagination / bulk-action / status-badge / linkified-identifier patterns. Shell at `components/ui/data-table/index.tsx`; building blocks (sortable-header / facet-dropdown / filter-chip / pagination / bulk-action-footer / empty-state / csv) in the same folder. `<StatusBadge>` at `components/ui/status-badge.tsx` with 4 domain wrappers. `<IdentifierLink>` at `components/ui/identifier-link.tsx` applying KD #81 styling consistently. Two consolidation wrappers: `<CohortTable kind>` (4 cohort kinds → 1 file) and `<DocumentCompletenessTable module>` (admissions + p-files clones → 1 file). Plain-English copy registry at `lib/copy/data-table.ts`. KD #15 (TanStack canonical) stays valid; the shell is the canonical *consumer* of TanStack now.
