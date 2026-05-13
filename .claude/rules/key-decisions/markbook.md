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

### KD #88
Grade change-request hardening (migrations 044 + 045). Three correctness + workflow + polish layers on KD #25's flow. **Migration 044**: 10 new nullable columns on `grade_change_requests` — paired primary/secondary review trail (KD #41 dual-reviewer audit) + `eligible_approver_snapshot jsonb` (write-once pool capture) + `notification_status`. Ships `apply_change_request_atomic` SECURITY DEFINER RPC that re-checks `grading_sheets.is_locked FOR UPDATE` and applies the entry patch + flips status to `'applied'` atomically — closes the silent race where a registrar's mid-apply unlock could bypass Hard Rule #5's `approval_reference`. **Migration 045**: `approved_at` (canonical, separate from primary_reviewed_at), `reminder_sent_at` (idempotency for the lazy reminder), `rejection_undone_at` + a partial index for the candidate scan. **Server enforcements**: 422 when applicant has no `studentNumber` at Enrolled-flip; canonical numeric `valuesMatch` (`'85'` matches `85.0`); same-person double-stamp guard + concurrent-approval `.eq('status', 'pending')` optimistic gate; spurious-value 422 (proposed === current); `slot_index` ceiling check against `subject_configs.{ww,pt}_max_slots`; backstop no-op audit row when applying a change-request whose value already matches stored (so the approval_reference trail is never empty). **Workflow**: 2-hour rejection undo via `action: 'undo_rejection'` (rejecting approver only); approved-but-not-applied reminder at 3 days via lazy fire from GET inbox (idempotent stamp-before-send); "Open sheet" CTA on teacher's approved row; aging chip ("approved 5 days ago", muted < 3d / amber 3–7d / destructive > 7d). **Polish**: `lib/env.ts` central env-var module with build-time `console.warn` when `NEXT_PUBLIC_SIS_URL` missing + amber `<SisUrlMissingBanner>` on `/sis/admin/settings`; `MeScopeConfig.enabled?` replaces the sentinel-string pattern in the unified `<DataTable>` shell (KD #84). New AuditActions: `grade_change_undo_rejection` + `reviewer_ordinal` in context. `<EditStageDialog>` surfaces `autoSync.reason` via `toast.warning` when class auto-assign succeeded but section-roster sync skipped.
