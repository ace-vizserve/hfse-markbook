# Admissions Tables — Ownership and Integration

## Overview

Student data lives in admissions tables (`ay{YY}_enrolment_applications`, `ay{YY}_enrolment_status`, `ay{YY}_enrolment_documents`, `ay{YY}_discount_codes`) that the **parent portal owns** and the **SIS reads from**. Both codebases share a single Supabase project; see `10-parent-portal.md` for the full ownership split.

Every Records module consumes a different slice of these tables:

- **Admissions dashboard** — read-only analytics over applications + status.
- **Markbook module** — reads the student-roster sync source; never touches admissions directly at runtime.
- **P-Files module** — writes file URLs + `{slotKey}Expiry` to `ay{YY}_enrolment_documents` on staff upload; also mirrors passport number / pass type to `ay{YY}_enrolment_applications` (Key Decision #34).
- **Records module** — writes demographics/family/stage fields via narrow PATCH routes (Profile / Family / Stage), manages the discount-code catalogue, and owns `{slotKey}Status` on documents (approve / reject, Key Decision #37).

The Markbook's student-roster sync is a one-way pull into the SIS's own `students` table, triggered manually by the registrar. It is the only SIS → admissions touchpoint that produces a full DB cross-read.

## Admissions DB Tables

### `ay{YY}_enrolment_applications`
Contains full student personal and family info. The `applicationStatus` here is always `'Registered'` (it tracks the application form submission state, not the enrollment pipeline). **Do not use this table's `applicationStatus` for enrollment filtering.**

Key fields:
| Field | Type | Notes |
|-------|------|-------|
| `id` | bigint | Auto-increment, AY-specific — not a stable ID |
| `enroleeNumber` | text | AY-specific (e.g., "E260001") — resets each AY |
| `studentNumber` | text | **Stable cross-year ID** — use this as the primary key |
| `lastName` | text | |
| `firstName` | text | |
| `middleName` | text | |
| `levelApplied` | text | |

### `ay{YY}_enrolment_status`
Managed by the admissions team. Contains the actual enrollment pipeline status and class assignment.

Key fields:
| Field | Type | Notes |
|-------|------|-------|
| `enroleeNumber` | text | Join key to applications table |
| `applicationStatus` | varchar | See values below |
| `classStatus` | varchar | See values below |
| `classAY` | varchar | Academic year (e.g., "AY2026") |
| `classLevel` | varchar | e.g., "Primary 1", "Secondary 2" |
| `classSection` | varchar | e.g., "Patience", "Discipline 2" |

### `ay{YY}_enrolment_documents`
Document tracking. Read by the Records module's Documents tab and by P-Files dashboards; written by P-Files on staff upload (URL + status + expiry, Key Decision #34) and by the parent portal on parent self-serve upload. The `{slotKey}Status` column is the Records module's responsibility to set `Valid` / `Rejected` (Key Decision #37) — P-Files never sets `'Rejected'`.

## Status Values

### `applicationStatus` (in `enrolment_status`)
| Value | Meaning for Grading App |
|-------|------------------------|
| Enrolled | Active student — include |
| Enrolled (Conditional) | Active student — include |
| Submitted | Usually means class not yet assigned — check `classSection` |
| Withdrawn | Withdrawn student — exclude from new sheets, grey out existing |
| Cancelled | Cancelled application — exclude |

> **Data quality note (AY2026):** The admissions team does not consistently update `applicationStatus` to "Enrolled." Many active students remain at "Submitted" but have `classSection` populated. The safest filter is `classSection IS NOT NULL AND applicationStatus NOT IN ('Cancelled', 'Withdrawn')`.

### `classStatus` (in `enrolment_status`)
| Value | Meaning |
|-------|---------|
| Finished | Class placement confirmed |
| Pending | Placement in progress |
| Incomplete | Missing info |
| Cancelled | Cancelled |

> **Data quality note (AY2026):** 378 of 471 registered students have `classStatus = NULL`. These students may still have `classSection` populated. Do not rely on `classStatus = 'Finished'` alone.

## Sync Query

```sql
SELECT
  a."studentNumber"   AS student_number,
  a."lastName"        AS last_name,
  a."firstName"       AS first_name,
  a."middleName"      AS middle_name,
  s."classLevel"      AS class_level,
  s."classSection"    AS class_section,
  s."classAY"         AS class_ay
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
WHERE s."classSection" IS NOT NULL
  AND s."applicationStatus" NOT IN ('Cancelled', 'Withdrawn')
ORDER BY s."classLevel", s."classSection", a."lastName";
```

Update `ay2026` to `ay2027` etc. each AY.

## Statistics Query

To verify data quality before syncing:

```sql
SELECT COUNT(*) AS total_active_enrolled_students_with_section
FROM public.ay2026_enrolment_applications a
JOIN public.ay2026_enrolment_status s
  ON a."enroleeNumber" = s."enroleeNumber"
WHERE s."classSection" IS NOT NULL
  AND s."applicationStatus" NOT IN ('Cancelled', 'Withdrawn');
```

## Sync Process

1. Registrar clicks "Sync Students from Admissions" in the SIS admin panel
2. App runs the sync query against the admissions Supabase instance
3. For each returned row:
   - If `studentNumber` exists in `students` table → update name fields if changed
   - If `studentNumber` does not exist → insert new student record
   - Assign to correct `section` based on `classLevel` + `classSection` + `classAY`
   - If student already in section → skip
   - If student new to section → append with next available index number
4. Withdrawn students (status changed to 'Withdrawn' since last sync) → update `enrollment_status = 'withdrawn'` in `section_students`
5. Show registrar a summary: X added, Y updated, Z withdrawn

## Known Data Quality Issues

| Issue | Impact | Mitigation |
|-------|--------|-----------|
| `studentNumber` can be null | Cannot track student cross-year | Validate on sync — reject rows with null studentNumber |
| `classSection` has a typo: "Courageos" vs "Courageous" | Creates phantom section | Normalize section names on sync against a known sections list |
| `applicationStatus` not updated to "Enrolled" consistently | May miss students if filtering strictly | Use `classSection IS NOT NULL` as primary filter |
| Year-specific table names (`ay2026_*`) | Sync query needs manual update each AY | Store table prefix in app config |

## Connection Config

Admissions tables and SIS-owned tables share a single Supabase project, so one connection is enough. The SIS uses three client factories with strict separation (Key Decision #22): `createClient()` (cookie-scoped, RLS-enforced) for server-component reads, `createServiceClient()` (bypasses RLS) for mutating routes + cross-user aggregations, and the browser `createClient()` only where unavoidable (parent-portal SSO handoff). Environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...      # server-only
```

The original plan had separate `ADMISSIONS_SUPABASE_*` vars for a two-project setup; that was dropped once both halves converged on one project.
