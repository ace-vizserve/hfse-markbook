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
