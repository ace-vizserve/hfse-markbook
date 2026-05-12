<!-- Topic file for `.claude/rules/key-decisions.md`. Numbering is global; do not renumber. -->

## UI — design tokens, forms, toasts, primitives

### KD #14
Aurora Vault palette in `app/globals.css`; raw values use `--av-*` prefix. `09-design-system.md`.

### KD #15
`@tanstack/react-table` canonical for filterable/sortable lists. Reference: `grading-data-table.tsx`.

### KD #20
Forms use RHF + zod + shadcn `Form`; autosave grids stay on raw state. Schemas in `lib/schemas/`.

### KD #21
Feedback = toasts + dialogs via `sonner` (which is a sileo facade per KD #58 — call sites still `import { toast } from 'sonner'`); `window.alert/confirm/prompt` banned. Locked-sheet dialogs use `components/grading/use-approval-reference.tsx`.

### KD #24
Client mutations = raw `fetch` + `toast.error`; no React Query. Reference: `components/grading/totals-editor.tsx`.

### KD #44
`DatePicker` + `DateTimePicker` are canonical (`components/ui/date-{picker,time-picker}.tsx`). Native `<input type="date">` / `datetime-local` / `time` are banned outside the primitives themselves.

### KD #84
Unified `<DataTable>` shell + extracted primitives consolidate the previously-scattered toolbar / pagination / bulk-action / status-badge / linkified-identifier patterns. Shell at `components/ui/data-table/index.tsx`; building blocks (sortable-header / facet-dropdown / filter-chip / pagination / bulk-action-footer / empty-state / csv) in the same folder. `<StatusBadge>` at `components/ui/status-badge.tsx` with 4 domain wrappers (`<ApplicationStatusBadge>` / `<DiscountCodeStatusBadge>` / `<DocumentStatusBadge>` / `<EnrollmentStatusBadge>`). `<IdentifierLink>` at `components/ui/identifier-link.tsx` applying KD #81 styling consistently. Two consolidation wrappers: `<CohortTable kind>` (4 cohort kinds → 1 file at `components/sis/cohorts/cohort-table.tsx`) and `<DocumentCompletenessTable module>` (admissions + p-files clones → 1 file at `components/shared/document-completeness-table.tsx`). Plain-English copy registry at `lib/copy/data-table.ts`. URL state via `useUrlState` hook with optional namespace prefix. KD #15 (TanStack canonical) stays valid; the shell is the canonical *consumer* of TanStack now. Per-row overflow menus + net-new bulk API surface deferred — shell exposes the slots, populate per-table next sprint.
