# Drill-down replication — Markbook · Attendance · Evaluation

**Date:** 2026-04-25
**Branch:** `feat/dashboard-drilldowns`
**Status:** Spec — implementation in flight via parallel subagents
**Predecessor:** Admissions drill-down pilot (`docs/superpowers/specs/2026-04-25-admissions-drill-downs-design.md`) — shipped, build clean, all 12 targets wired. Pattern proven.

## 1. Goal

Replicate the Admissions drill-down pattern across the three remaining operational modules — Markbook, Attendance, Evaluation — so every aggregating element on every module dashboard becomes a clickable drill into the underlying rows, with the universal toolkit (range scope, status/level multi-select, group-by, density, columns, CSV).

This closes the deferred backlog items from Sprint 21:
- Markbook: `getSheetReadinessBySection`, `getTeacherEntryVelocity`
- Attendance: `getAttendanceBySectionRange`, `getCompassionateQuotaUsage`
- Evaluation: `getWriteupsBySectionRange`, `getTimeToSubmitHistogram`

## 2. Shared infrastructure (already built)

- `components/dashboard/drill-down-sheet.tsx` — universal toolkit (search, range scope, status/level multi-select, group-by, density, columns, CSV button). Module-agnostic.
- `components/dashboard/charts/comparison-bar-chart.tsx` — accepts `onSegmentClick`. Module-agnostic.
- `components/dashboard/charts/donut-chart.tsx` — accepts `onSegmentClick`. Module-agnostic.
- `lib/csv.ts` — UTF-8 BOM CSV builder.
- `MetricCard.drillSheet` slot — module-agnostic.

## 3. Per-module shape

Each module gets:
- `lib/<module>/drill.ts` — module-specific row shape(s), `buildDrillRows`, `applyTargetFilter`, `defaultColumnsForTarget`, `drillHeaderForTarget`
- `app/api/<module>/drill/[target]/route.ts` — unified GET endpoint, JSON + CSV
- `components/<module>/drills/<module>-drill-sheet.tsx` — target-aware wrapper
- `components/<module>/drills/chart-drill-cards.tsx` — per-target client wrappers (one per chart card)
- New helpers in `lib/<module>/dashboard.ts` — closes deferred backlog
- New chart cards (one or two per module) for the new helpers

**Critical Next 16 rule:** chart drill wrappers must be `'use client'` modules — Server Components cannot pass functions as children to Client Components. Use per-target named wrappers (e.g. `FunnelDrillCard`), not render-prop children. (Lesson from the Admissions pilot.)

## 4. Markbook

### 4.1 Drill targets (8)

| # | Surface | Drill content | Slug |
|---|---|---|---|
| 1 | MetricCard: Grade entries (range) | Entries written in range | `grade-entries` |
| 2 | MetricCard: Sheets locked | Sheets locked in range | `sheets-locked` |
| 3 | MetricCard: Change requests | Requests in range, by status | `change-requests` |
| 4 | MetricCard: Publication coverage | Sections published vs not | `publication-coverage` |
| 5 | Grade Distribution Chart bars | Entries in that bucket | `grade-bucket-entries` |
| 6 | Sheet Progress chart segments | Sheets in that term + status | `term-sheet-status` |
| 7 | Publication Coverage chart segments | Sections in that term + status | `term-publication-status` |
| 8 | **NEW** card — Sheet readiness by section | Section × open sheets count | `sheet-readiness-section` |
| 9 | **NEW** card — Teacher entry velocity (registrar+ only) | Teacher × entries count | `teacher-entry-velocity` |

### 4.2 Row shapes

Two row shapes — one for grade-entry-centric drills, one for sheet-centric drills:

```ts
// Entry-centric (drills 1, 5, 9)
type GradeEntryRow = {
  entryId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  enroleeNumber: string;
  level: string | null;
  sectionName: string;
  subjectCode: string;
  termNumber: number;
  rawScore: number | null;
  maxScore: number;
  computedGrade: number | null;     // % grade or null
  gradeBucket: string | null;        // 'A','B','C','D','F','none'
  isLocked: boolean;
  enteredAt: string;                 // ISO
  enteredBy: string | null;          // teacher email
};

// Sheet-centric (drills 2, 4, 6, 7, 8)
type SheetRow = {
  sheetId: string;
  sectionId: string;
  sectionName: string;
  level: string | null;
  subjectCode: string;
  termNumber: number;
  isLocked: boolean;
  lockedAt: string | null;           // ISO
  isPublished: boolean;
  publishedAt: string | null;        // ISO
  entriesPresent: number;
  entriesExpected: number;
  completenessPct: number;
};

// Change-request-centric (drill 3)
type ChangeRequestRow = {
  requestId: string;
  status: string;
  sheetId: string;
  sectionName: string;
  subjectCode: string;
  termNumber: number;
  requestedBy: string;
  requestedAt: string;
  resolvedAt: string | null;
};
```

The drill component picks which shape based on target.

### 4.3 New backlog helpers

- `getSheetReadinessBySection(input: RangeInput)` → returns `{ sectionName, sectionId, level, openCount, lockedCount, publishedCount, totalSheets }[]`
- `getTeacherEntryVelocity(input: RangeInput)` → registrar+ scoped; returns `{ teacherEmail, teacherId, entryCount, lastEntryAt }[]`

### 4.4 Auth

`requireRole('teacher', 'registrar', 'school_admin', 'admin', 'superadmin')`. Teachers see only their assigned sections (filter by `teacher_assignments`). The teacher-velocity drill is `registrar+` only.

## 5. Attendance

### 5.1 Drill targets (8)

| # | Surface | Drill content | Slug |
|---|---|---|---|
| 1 | MetricCard: Attendance % | Encoded days in range, by status | `attendance-summary` |
| 2 | MetricCard: Late count | Late entries in range | `lates` |
| 3 | MetricCard: Excused count | Excused entries in range | `excused` |
| 4 | MetricCard: Absent count | Absent entries in range | `absent` |
| 5 | Daily % Trend bars | Day × per-section breakdown | `daily-attendance-day` |
| 6 | EX Reason Donut slices | EX entries with that reason | `ex-reason` |
| 7 | Day-Type Donut slices | Calendar days with that type | `day-type` |
| 8 | Top-Absent Table — adopt CSV button | (already row-level) | `top-absent` (CSV only) |
| 9 | **NEW** card — Attendance by section | Section × attendance % | `attendance-by-section` |
| 10 | **NEW** card — Compassionate quota usage | Student × used vs allowance | `compassionate-quota` |

### 5.2 Row shapes

```ts
// Daily entry (drills 1-6)
type AttendanceEntryRow = {
  entryId: string;
  attendanceDate: string;             // ISO date
  sectionId: string;
  sectionName: string;
  studentSectionId: string;
  studentName: string;
  studentNumber: string;
  level: string | null;
  status: 'P' | 'L' | 'EX' | 'A' | 'NC';
  exReason: 'mc' | 'compassionate' | 'school_activity' | null;
  notes: string | null;
};

// Section-level rollup (drill 9)
type SectionAttendanceRow = {
  sectionId: string;
  sectionName: string;
  level: string | null;
  encodedDays: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  absentCount: number;
  attendancePct: number;
};

// Student × compassionate (drill 10)
type CompassionateUsageRow = {
  studentSectionId: string;
  studentName: string;
  studentNumber: string;
  sectionName: string;
  level: string | null;
  allowance: number;
  used: number;
  remaining: number;
  isOverQuota: boolean;
};

// Calendar day (drill 7)
type CalendarDayRow = {
  date: string;                       // ISO
  termId: string;
  termNumber: number;
  dayType: 'school_day' | 'public_holiday' | 'school_holiday' | 'hbl' | 'no_class';
  label: string | null;
};
```

### 5.3 New backlog helpers

- `getAttendanceBySectionRange(input: RangeInput)` → `SectionAttendanceRow[]` for cross-section comparison.
- `getCompassionateQuotaUsage(ayCode: string)` → `CompassionateUsageRow[]`. (Already partially exists as `getCompassionateUsageForSection` per section — generalise to all sections.)

### 5.4 Auth + privacy

`requireRole('teacher', 'registrar', 'school_admin', 'admin', 'superadmin')` BUT teachers only see their adviser sections (via `teacher_assignments` filter). The `/attendance` dashboard is registrar+ only per KD #55, so the drill API also denies non-registrar+ access for this module to keep behavior consistent. Teachers click through from `/attendance/sections` directly into the section detail view, not the dashboard.

**Concrete decision:** Drill API for Attendance is registrar+ only. Simpler, matches dashboard gating.

## 6. Evaluation

### 6.1 Drill targets (6)

| # | Surface | Drill content | Slug |
|---|---|---|---|
| 1 | MetricCard: Submission % | Sections × submission status | `submission-status` |
| 2 | MetricCard: Submitted | Submitted writeups | `submitted` |
| 3 | MetricCard: Median time-to-submit | Submitted writeups w/ days-to-submit | `time-to-submit` |
| 4 | MetricCard: Late submissions | Writeups submitted >14d | `late` |
| 5 | Submission velocity trend bars | Per-day submission rows | `submission-velocity-day` |
| 6 | **NEW** card — Writeups by section | Section × writeup status | `writeups-by-section` |
| 7 | **NEW** card — Time-to-submit histogram | Bucket bars (0-3d / 4-7d / 8-14d / >14d) | `time-to-submit-bucket` |

### 6.2 Row shape

Single shape — writeups are uniform:

```ts
type WriteupRow = {
  writeupId: string;
  termId: string;
  termNumber: number;
  sectionId: string;
  sectionName: string;
  level: string | null;
  studentSectionId: string;
  studentName: string;
  studentNumber: string;
  adviserId: string | null;
  adviserEmail: string | null;
  status: 'submitted' | 'draft' | 'missing';
  draftCharCount: number;
  submittedAt: string | null;          // ISO
  daysToSubmit: number | null;         // open_at -> submitted_at
};
```

### 6.3 New backlog helpers

- `getWriteupsBySectionRange(input: RangeInput)` → `{ sectionId, sectionName, level, total, submitted, draft, missing, submissionPct }[]`
- `getTimeToSubmitHistogram(input: RangeInput)` → `{ bucket: string; loDays: number; hiDays: number | null; count: number }[]`

### 6.4 Auth

`requireRole('teacher', 'registrar', 'school_admin', 'admin', 'superadmin')`. Teachers see only writeups for sections where they're the form_adviser (via `teacher_assignments` with `role='form_adviser'`). Registrar+ sees everything.

## 7. Build sequence

Three parallel subagents — one per module — each scoped to:
1. Build `lib/<module>/drill.ts`
2. Build `app/api/<module>/drill/[target]/route.ts`
3. Build `components/<module>/drills/<module>-drill-sheet.tsx`
4. Add deferred-backlog helpers to `lib/<module>/dashboard.ts`
5. Build new chart cards (one or two per module)
6. Build per-target chart drill wrappers in `components/<module>/drills/chart-drill-cards.tsx`
7. Wire the dashboard page

After all three return, run `npx next build` to verify, then commit.

## 8. What's out of scope

- Records dashboard drills (already extensively row-level; no immediate ask)
- P-Files dashboard drills (next module if/when needed)
- SIS Admin dashboard drills (config surface, not analytics — would be a different shape)
- URL-persistent drill state
- XLSX export
- Saved filter presets
- Deduplicating the StatusBadge / StalenessBadge components copied from Admissions outdated table — defer
