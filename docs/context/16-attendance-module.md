# Attendance Module (Daily Attendance)

> **Status:** 📋 **Pending HFSE Excel reference.** High-level shape agreed (hybrid placement, daily-only Phase 1, existing `attendance_records` table kept as rollup target). Schema details + Excel-driven workflow assumptions **blocked** until HFSE provides the attendance Excel file they use today. Everything below describes the agreed frame, not a ready-to-build spec.

## Why this doc exists

Today the SIS has term-summary attendance only: one `attendance_records` row per student × term with `present / absent / tardy / excused` counts, entered once per term in the Markbook module's `/admin/sections/[id]/attendance` grid. This covers the report card's attendance column and nothing else.

A proper **Attendance module** owns the daily ledger those summaries should roll up from. It's the biggest gap in the SIS's "records connected to the student profile" shape — every other domain (grades, documents, pipeline) has per-event fidelity; attendance doesn't.

This doc captures the **shape of the module** so a sprint can open the moment HFSE's attendance Excel lands.

## Agreed decisions (do not re-derive)

### 1. Daily-only for Phase 1

One record per student × school-day × status (`present / absent / tardy / excused` at minimum; reason codes TBD from Excel). Period-level attendance (one record per student × day × period) is **Phase 2 at earliest** and requires the Scheduling module as a hard prerequisite (you need to know what periods exist before marking attendance against them).

Schema shape to accommodate later period-level expansion without a breaking migration:

- The daily-attendance table will include a nullable `period_id` column from day one.
- Phase 1 writes `period_id = NULL` on every row (interpreted as "whole-day status").
- Phase 2 (when Scheduling lands) starts writing non-null `period_id` without touching Phase 1 rows.

Actual table DDL is **TBD pending the Excel file** — column names, status vocabulary, reason codes, and any Excel-specific fields are all open.

### 2. Hybrid placement — entry surface at `/attendance/*`, student-detail tab in Records

Daily entry is inherently **per section** — teachers mark their whole class at once, not student-by-student. So the entry surface is its own route group:

- `/attendance/*` — per-section daily grid, own sidebar entry, module switcher lists it as a fourth module alongside Markbook / P-Files / Records.

Consumption is inherently **per student** — the question "when was Juan absent this term?" is answered on his profile. So the Records student-detail page grows a fifth tab:

- `/records/students/[enroleeNumber]?tab=attendance` — chronological attendance log for this student across the current AY (and optionally cross-AY via `studentNumber`).

Both surfaces read from the same daily-attendance table. Entry writes on the section surface; the student tab is read-only.

### 3. Existing `attendance_records` table stays as a rollup target

Markbook's report card consumes term-summary counts from `attendance_records` today (KD #5 in `03-workflow-and-roles.md`, rendered by `ReportCardDocument`). Retiring that table would touch Markbook's report-card fetch path — we don't want to.

The contract instead: the Attendance module becomes the **feeder** for `attendance_records`. On every daily-attendance write, the module also updates the corresponding term's summary row (or a nightly rollup job does it). Markbook's read path is unchanged.

This updates one row in `15-markbook-module.md` "Planned migrations": attendance entry *moves* to this module, but the `attendance_records` table *stays* (consumed by both modules — Attendance writes, Markbook reads for report cards).

**Note:** the final decision on "write-through vs nightly rollup vs derived-at-render" is pending the Excel file — the Excel's granularity and status vocabulary will determine whether a summary-row write-back is trivial or has edge cases.

## Routes (planned)

Phase 1 route surface, skeletal — actual components + URLs finalise once Excel-driven decisions land:

- `/attendance` — entry surface list (pick a section + date, similar to how Markbook `/grading` lists sheets).
- `/attendance/[sectionId]` — daily grid for a section (default: today). Columns: students; rows: days within the current term; cells: status. Autosave per cell, like the Markbook score grid.
- `/attendance/[sectionId]?date=YYYY-MM-DD` — specific date view (bookmarkable, deep-linkable).
- `/records/students/[enroleeNumber]?tab=attendance` — per-student log (new tab on the existing Records student detail page).
- Optional: `/attendance/audit-log` — module-scoped audit, mirroring `/p-files/audit-log` and `/records/audit-log`.

## Data model (TBD)

**Waiting on HFSE's attendance Excel to finalise.** What's confirmed:

- New table (name TBD, candidate: `attendance_daily`) with one row per student × school-day.
- Columns: `student_id`, `date`, `status`, optional `reason` / `remarks`, `recorded_by_user_id`, `recorded_at`, `period_id` (nullable, Phase 2 hook).
- Status values — **vocabulary pending Excel.** Candidates: `present`, `absent`, `tardy`, `excused`, possibly `half-day`, `early-dismissal`, `school-activity`, etc.
- Reason codes — **pending Excel.** Today `attendance_records` has no reason granularity; daily-level likely needs at least a short `reason` enum for excused absences.
- Append-only per Hard Rule #6 — corrections via a new row that supersedes the prior row, or via `updated_at` + audit log. TBD which pattern.

The **existing `attendance_records` table** (term-summary) is untouched. DDL in `supabase/migrations/`.

## Access

- **Teachers** — write own class (via `teacher_assignments` gate, same as Markbook grading). The daily grid for `/attendance/[sectionId]` filters sections to the teacher's assigned sections.
- **Form advisers** — read + write own section across all subjects (attendance is usually the adviser's daily homeroom mark, not per-subject).
- **Registrar** — read/write any section, correct historical entries, audit.
- **Admin / superadmin** — read all; write via audit-logged override (TBD whether admins should routinely write or only correct).
- **Parents** — read attendance on the published report card (existing surface; unchanged).

Role strategy stays consistent with the rest of the SIS — no new role needed.

## Workflows (planned)

Skeletal — actual UX decisions pending Excel review:

1. **Daily entry.** Teacher opens `/attendance/[sectionId]`, lands on today's date, sees the roster with a "present" default for every student (or "unmarked", TBD). Clicks cells to change status. Autosave per cell, mirroring the Markbook grading grid pattern (see `11-performance-patterns.md` §2 for the stale-closure guard).
2. **Historical correction.** Adviser / registrar opens the same grid, picks a past date via the date picker, edits status. Correction writes an audit-log row.
3. **Per-student review.** Records student detail → Attendance tab → chronological log, grouped by month, with term-summary chips at the top (`Present: N · Absent: N · Tardy: N`).
4. **Report-card consumption.** Existing — `attendance_records` term-summary counts render as-is on the report card. No change to `05-report-card.md`.
5. **Rollup.** On every daily write, the module upserts the matching `attendance_records` row for the current term. Or a nightly job. **Pending Excel** which pattern is cleaner.

## Relationship to other modules

- **Markbook** — consumes the rollup (`attendance_records`) for report-card rendering. Markbook's `/admin/sections/[id]/attendance` route goes away once Attendance is live (or becomes a thin read-only summary view); `components/admin/attendance-grid.tsx` gets replaced by the Attendance module's daily grid.
- **Records module** — hosts the per-student Attendance tab (new). Reads the same daily-attendance table.
- **Scheduling** (future) — Phase 2 prerequisite for period-level attendance.
- **Audit log** — new action prefix `attendance.*` (e.g. `attendance.daily.update`, `attendance.daily.correct`). Existing Markbook `attendance.update` prefix migrates with the table ownership. `/admin/audit-log` will need to add `attendance.*` to its exclusion list if we want module-scoped separation (same pattern as `pfile.*` / `sis.*`).

## Open questions (pending HFSE Excel)

- [ ] What columns does the Excel have? (Likely: student name, date, status, possibly period/subject, possibly reason.)
- [ ] What status vocabulary does HFSE use? (`P / A / T / E` or something else?)
- [ ] Are there reason codes for excused absences? (Medical, family, school-activity, etc.)
- [ ] Does attendance currently track half-days or early dismissals?
- [ ] School-calendar question: does HFSE publish the list of school days ahead of time, or is any weekday assumed to be a school day unless cancelled? Affects whether we pre-populate the grid with every weekday or only known school days.
- [ ] Who enters attendance today — form advisers only, or subject teachers too? Drives the permission model.
- [ ] Are there period-level absences (present for math, absent for PE because sent to clinic)? If yes, Phase 2 priority goes up.
- [ ] Do parents see daily attendance in any current HFSE surface, or only the report-card summary?
- [ ] Is there a "late minutes" field (tardy = 10 min, tardy = 45 min) or just a binary tardy flag?

## Out of scope (until explicitly pulled in)

- Period-level attendance (Phase 2, requires Scheduling).
- Daily attendance for non-students (staff, visitors).
- Clock-in / clock-out time tracking (this is attendance, not timesheet).
- Automated absence notifications to parents (email on 3rd consecutive absence, etc.) — Communications-module territory.
- Dashboard analytics over attendance rates — Reports-hub territory.
- Attendance forecasting / ML.

## See also

- `14-modules-overview.md` — cross-module hub (Attendance listed under Planned modules).
- `15-markbook-module.md` §"Planned migrations" — documents the boundary drift from Markbook to Attendance.
- `11-performance-patterns.md` §2 — autosave grid pattern Attendance should reuse.
- `03-workflow-and-roles.md` — role + access conventions.
- `05-report-card.md` — report-card rendering of term-summary attendance (unchanged).
- `CLAUDE.md` — hard rules + key decisions.
