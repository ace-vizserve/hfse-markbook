<!-- Topic file for `.claude/rules/key-decisions.md`. Numbering is global; do not renumber. -->

## Markbook — grading, change-requests, report cards, publishing

### KD #3
Teacher assignments in `teacher_assignments(user, section, subject, role)` — `form_adviser` or `subject_teacher`. Gates grading-sheets list + section comments.

### KD #4
Weights per `(subject × level × AY)` in `subject_configs`; Primary 40/40/20, Secondary 30/50/20; never hardcoded.

### KD #5
Max 5 WW + 5 PT slots per sheet; max 50 students per section.

### KD #6
Annual grade = `T1×0.20 + T2×0.20 + T3×0.20 + T4×0.40`, 2dp. `lib/compute/annual.ts`.

### KD #25
Locked-sheet edits go through `grade_change_requests` workflow (migration 009); server derives `approval_reference`, rejects free-text values.

### KD #27
Report card has interim (T1–T3) and final (T4) templates. `ReportCardDocument` takes `viewingTermNumber`. `lib/compute/annual.ts` + `05-report-card.md`.

### KD #28
Pre-publish readiness is a soft gate, not a hard block. Registrar can always "Publish anyway". Surface is also a navigation hub per KD #75.

### KD #75
Publishing checklist is also a navigation hub. `components/admin/publish-window-panel.tsx` `<AlertDialog>` rebuilt with a `<ChecklistRow>` helper per check (status-tinted gradient icon tile — mint→sky for passed, amber for warning — + serif title + mono eyebrow + Badge count + per-row deep-link button). Each row routes the registrar straight into the relevant module to fix the issue without losing dialog state: grading sheets → `/markbook/grading?section={sectionId}`; adviser comments → `/evaluation/sections/{sectionId}`; attendance → `/attendance/{sectionId}`; T4 unlocked terms + missing quarterly grades → `/markbook/grading?section={sectionId}`. Dialog widened (`max-w-2xl`); T4 sub-section behind a centered horizontal-rule divider with mono-uppercase eyebrow. Quick-link buttons render on every row (passing or failing) — the dialog also serves as a launch pad to verify work is in order. Closes the "warnings → action" loop on KD #28.
