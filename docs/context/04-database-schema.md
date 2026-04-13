# Database Schema

## Overview

The grading app maintains its own Supabase schema (`grading` schema or separate tables prefixed `grading_`). It reads from the admissions schema but never writes to it.

All tables use UUID primary keys except where noted. `created_at` and `updated_at` are on all tables.

---

## Core Tables

### `students`
Synced from admissions DB. The grading app's own roster.

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_number TEXT UNIQUE NOT NULL,       -- stable cross-year ID from admissions
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `academic_years`
```sql
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ay_code TEXT UNIQUE NOT NULL,              -- e.g., "AY2026" (covers 2025-2026)
  label TEXT NOT NULL,                       -- e.g., "Academic Year 2025-2026"
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `terms`
```sql
CREATE TABLE terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID REFERENCES academic_years(id),
  term_number SMALLINT NOT NULL,             -- 1, 2, 3, or 4
  label TEXT NOT NULL,                       -- e.g., "Term 1 - 2026"
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(academic_year_id, term_number)
);
```

### `levels`
```sql
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                 -- e.g., "P1", "P2", "S1", "S4"
  label TEXT NOT NULL,                       -- e.g., "Primary 1", "Secondary 3"
  level_type TEXT NOT NULL                   -- "primary" or "secondary"
    CHECK (level_type IN ('primary', 'secondary'))
);
```

### `sections`
```sql
CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID REFERENCES academic_years(id),
  level_id UUID REFERENCES levels(id),
  name TEXT NOT NULL,                        -- e.g., "Patience", "Discipline 2"
  class_type TEXT,                           -- "Global" or "Standard"
  form_class_adviser TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(academic_year_id, level_id, name)
);
```

### `section_students`
Student-section enrollment per AY with fixed index numbers.

```sql
CREATE TABLE section_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id),
  student_id UUID REFERENCES students(id),
  index_number SMALLINT NOT NULL,            -- fixed per AY, never reassigned
  enrollment_status TEXT NOT NULL            -- "active", "late_enrollee", "withdrawn"
    CHECK (enrollment_status IN ('active', 'late_enrollee', 'withdrawn')),
  enrollment_date DATE,
  withdrawal_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section_id, index_number),
  UNIQUE(section_id, student_id)
);
```

### `subjects`
```sql
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                        -- e.g., "MATH", "ENG", "SCI"
  name TEXT NOT NULL,                        -- e.g., "Mathematics", "English"
  is_examinable BOOLEAN DEFAULT true,        -- false = letter grade (A/B/C/IP/UG)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `subject_configs`
Per-subject grading configuration per AY. Weights may change each AY.

```sql
CREATE TABLE subject_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID REFERENCES academic_years(id),
  subject_id UUID REFERENCES subjects(id),
  level_id UUID REFERENCES levels(id),
  ww_weight NUMERIC(4,2) NOT NULL,           -- e.g., 0.40 for Primary Math
  pt_weight NUMERIC(4,2) NOT NULL,           -- e.g., 0.40 for Primary Math
  qa_weight NUMERIC(4,2) NOT NULL,           -- always 0.20
  ww_max_slots SMALLINT DEFAULT 5,           -- max number of written work columns
  pt_max_slots SMALLINT DEFAULT 5,           -- max number of PT columns
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(academic_year_id, subject_id, level_id),
  CHECK (ww_weight + pt_weight + qa_weight = 1.00)
);
```

### `grading_sheets`
One per subject + section + term. The primary unit of locking.

```sql
CREATE TABLE grading_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES terms(id),
  section_id UUID REFERENCES sections(id),
  subject_id UUID REFERENCES subjects(id),
  subject_config_id UUID REFERENCES subject_configs(id),
  teacher_name TEXT,
  -- Score maximums (can be updated by registrar with approval)
  ww_totals NUMERIC[] DEFAULT '{}',          -- e.g., [10, 10, 10] for W1, W2, W3
  pt_totals NUMERIC[] DEFAULT '{}',          -- e.g., [10, 10, 10] for PT1, PT2, PT3
  qa_total NUMERIC,                          -- e.g., 30
  -- Lock state
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,                            -- user id or name
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term_id, section_id, subject_id)
);
```

### `grade_entries`
One row per student per grading sheet. Stores raw scores as arrays.

```sql
CREATE TABLE grade_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grading_sheet_id UUID REFERENCES grading_sheets(id),
  section_student_id UUID REFERENCES section_students(id),
  -- Raw scores (null = not taken, 0 = taken and scored zero)
  ww_scores NUMERIC[] DEFAULT '{}',          -- e.g., [10, 8, null] for W1, W2, W3
  pt_scores NUMERIC[] DEFAULT '{}',          -- e.g., [9, 10, null]
  qa_score NUMERIC,
  -- Computed (stored for performance, recalculated on score change)
  ww_ps NUMERIC(6,4),                        -- WW percentage score
  pt_ps NUMERIC(6,4),                        -- PT percentage score
  qa_ps NUMERIC(6,4),                        -- QA percentage score
  initial_grade NUMERIC(6,4),
  quarterly_grade SMALLINT,                  -- transmuted, integer 60-100
  -- Letter grade for non-examinable subjects
  letter_grade TEXT,
  -- Metadata
  is_na BOOLEAN DEFAULT false,               -- late enrollee: all assessments N/A
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(grading_sheet_id, section_student_id)
);
```

### `grade_audit_log`
Every change to a grade_entry after the sheet is locked.

```sql
CREATE TABLE grade_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_entry_id UUID REFERENCES grade_entries(id),
  grading_sheet_id UUID REFERENCES grading_sheets(id),
  changed_by TEXT NOT NULL,
  field_changed TEXT NOT NULL,               -- e.g., "ww_scores[1]", "qa_score"
  old_value TEXT,
  new_value TEXT,
  approval_reference TEXT,                   -- email subject/reference for approval
  changed_at TIMESTAMPTZ DEFAULT now()
);
```

### `report_card_comments`
Teacher comments per student per term (used in report card).

```sql
CREATE TABLE report_card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES terms(id),
  section_id UUID REFERENCES sections(id),
  student_id UUID REFERENCES students(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term_id, section_id, student_id)
);
```

### `attendance_records`
Per student per term — synced or manually entered.

```sql
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES terms(id),
  section_student_id UUID REFERENCES section_students(id),
  school_days SMALLINT,
  days_present SMALLINT,
  days_late SMALLINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(term_id, section_student_id)
);
```

---

## Admissions DB Sync Query

Read-only. Used to populate `students` and `section_students` tables.

```sql
-- Run against the admissions Supabase instance
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

> **Warning:** The admissions DB uses year-specific table names (`ay2026_*`, `ay2027_*`). Update the table names in the sync query each AY. The grading app should have a config value for the current AY table prefix.

---

## Key Data Integrity Rules

1. `studentNumber` must never be null for any synced student
2. Index numbers in `section_students` are immutable once assigned
3. Withdrawn students keep their row with `enrollment_status = 'withdrawn'` — never deleted
4. Grade entries are never deleted — only nulled or updated with audit log
5. `ww_weight + pt_weight + qa_weight` must equal 1.00 (enforced by CHECK constraint)
