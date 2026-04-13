# API Routes Reference

All API routes are Next.js App Router API routes (`/app/api/...`). Authentication is handled via Supabase Auth. All routes require a valid session except where noted.

## Authentication

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Email/password login via Supabase Auth |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/me` | GET | Current user + role |

## Students & Roster

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/students` | GET | registrar, admin | List all students with section assignments |
| `/api/students/sync` | POST | registrar | Trigger sync from admissions DB |
| `/api/students/sync/stats` | GET | registrar | Preview sync stats before committing |
| `/api/sections` | GET | all | List sections for current AY |
| `/api/sections/:id/students` | GET | teacher, registrar | List students in a section |

## Grading Sheets

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/grading-sheets` | GET | teacher, registrar | List sheets (filtered by teacher's assignments) |
| `/api/grading-sheets` | POST | registrar | Create a new grading sheet |
| `/api/grading-sheets/:id` | GET | teacher, registrar | Get sheet with all entries |
| `/api/grading-sheets/:id/lock` | POST | registrar | Lock a sheet |
| `/api/grading-sheets/:id/unlock` | POST | registrar | Unlock a sheet |
| `/api/grading-sheets/:id/totals` | PATCH | registrar | Update WW/PT/QA max totals (requires approval ref) |

## Grade Entries

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/grading-sheets/:id/entries` | GET | teacher, registrar | All entries for a sheet |
| `/api/grading-sheets/:id/entries/:studentId` | PATCH | teacher (unlocked), registrar (locked) | Update scores for one student |
| `/api/grading-sheets/:id/entries/:studentId/compute` | POST | system | Recompute initial + quarterly grade |

### PATCH Entry Payload
```json
{
  "ww_scores": [10, 8, null, 9, null],
  "pt_scores": [9, 10, null, null, null],
  "qa_score": 25,
  "letter_grade": null,
  "approval_reference": "Email from Ms. Chandana, 2026-03-15"
}
```

`approval_reference` is required for post-lock edits.

## Grade Computation

Computation runs server-side on every score update. Never trust client-side calculations.

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/compute/quarterly` | POST | system | Compute quarterly grade from raw scores |
| `/api/compute/overall` | POST | system | Compute overall annual grade |

### Computation Payload
```json
{
  "ww_scores": [10, 8, 9],
  "ww_totals": [10, 10, 10],
  "pt_scores": [9, 10, 8],
  "pt_totals": [10, 10, 10],
  "qa_score": 25,
  "qa_total": 30,
  "ww_weight": 0.40,
  "pt_weight": 0.40,
  "qa_weight": 0.20
}
```

### Computation Response
```json
{
  "ww_ps": 90.0,
  "pt_ps": 90.0,
  "qa_ps": 83.33,
  "initial_grade": 88.67,
  "quarterly_grade": 93
}
```

## Audit Log

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/audit-log` | GET | registrar, admin | All post-lock edits |
| `/api/audit-log?sheet_id=:id` | GET | registrar | Edits for a specific sheet |

## Attendance

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/attendance/:termId/:sectionId` | GET | registrar | Get attendance for a section/term |
| `/api/attendance/:termId/:sectionId` | POST | registrar | Bulk update attendance |

## Comments

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/comments/:termId/:sectionId` | GET | teacher, registrar | Get all comments for section |
| `/api/comments/:termId/:sectionId/:studentId` | PATCH | teacher | Update comment for student |

## Report Card

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/report-card/:studentId` | GET | registrar | Get aggregated report card data |
| `/api/report-card/:studentId/pdf` | POST | registrar | Generate and stream PDF |
| `/api/report-card/section/:sectionId/pdf` | POST | registrar | Batch PDF for whole section |

### PDF generation flow
1. Next.js route assembles all grade data, attendance, comments for the student
2. POSTs to Python PDF service
3. Streams the PDF binary response back to browser

## Configuration (Admin only)

| Route | Method | Role | Description |
|-------|--------|------|-------------|
| `/api/config/terms` | GET/POST | admin | Manage terms |
| `/api/config/subjects` | GET/POST | admin | Manage subjects |
| `/api/config/subject-configs` | GET/POST | admin | Set weights per subject per AY |
| `/api/config/sections` | GET/POST | admin | Manage sections per AY |

## PDF Microservice Routes

Separate FastAPI service deployed on Render/Railway.

| Route | Method | Description |
|-------|--------|-------------|
| `/generate-pdf` | POST | Generate report card PDF |
| `/health` | GET | Health check (used for keep-warm ping) |
| `/ping` | GET | Simple alive check |
