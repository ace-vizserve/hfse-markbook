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
Unified `<DataTable>` shell + extracted primitives consolidate the previously-scattered toolbar / pagination / bulk-action / status-badge / linkified-identifier patterns. Shell at `components/ui/data-table/index.tsx`; building blocks (sortable-header / facet-dropdown / filter-chip / pagination / bulk-action-footer / empty-state / csv) in the same folder. `<StatusBadge>` at `components/ui/status-badge.tsx` with 4 domain wrappers (`<ApplicationStatusBadge>` / `<DiscountCodeStatusBadge>` / `<DocumentStatusBadge>` / `<EnrollmentStatusBadge>`). `<IdentifierLink>` at `components/ui/identifier-link.tsx` applying KD #81 styling consistently. Two consolidation wrappers: `<CohortTable kind>` (4 cohort kinds → 1 file at `components/sis/cohorts/cohort-table.tsx`) and `<DocumentCompletenessTable module>` (admissions + p-files clones → 1 file at `components/shared/document-completeness-table.tsx`). Plain-English copy registry at `lib/copy/data-table.ts`. URL state via `useUrlState` hook with optional namespace prefix. KD #15 (TanStack canonical) stays valid; the shell is the canonical *consumer* of TanStack now. Per-row overflow menus + net-new bulk API surface deferred — shell exposes the slots, populate per-table next sprint. **Sprint 37 updates:** (1) `<StatusBadge>` was unified with the loud `<Badge variant>` style — every tone now delegates to `Badge` (healthy→success, locked→blocked, info→default, warning→warning, muted→muted). Subdued wash variant retired; status pills speak with one visual voice (saturated brand gradient + white text + shadow) matching `<StageStatusBadge>`. (2) Flat → gradient sweep across 16 components: every state-bearing tint uses `bg-gradient-to-b from-X/N to-X/(N/3)` instead of flat `bg-X/N`. Neutral chrome (`secondary`/`outline`/`muted` Badge variants, table headers) intentionally left flat. (3) Per-row action dropdown pattern (`⋯ More` `<DropdownMenu>`) — applied where row has ≥3 actions OR mixed-priority actions. Currently `ay-setup-data-table` (6 actions collapsed; high-signal Dates chip + Early-bird Switch stay inline) and `discount-codes-data-table` (Edit + Expire) use the pattern. Tables with 1–2 actions stay inline — dropdown adds friction without payoff.
