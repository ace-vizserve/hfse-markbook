# Admissions Database Integration

## Overview

Student data is sourced from an existing Supabase admissions database. The grading app reads from it but never writes to it. The integration is a one-way sync triggered manually by the registrar.

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
Document tracking only — not used by the grading app.

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

## Sync Process (in the Grading App)

1. Registrar clicks "Sync Students from Admissions" in the admin panel
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

The grading app needs two Supabase connections:
1. **Grading DB** — read/write (the grading app's own tables)
2. **Admissions DB** — read-only (for student roster sync)

Store both connection strings in environment variables:
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
ADMISSIONS_SUPABASE_URL=...
ADMISSIONS_SUPABASE_SERVICE_KEY=...
```

If both are in the same Supabase project, only one connection is needed — just reference both schemas directly.
