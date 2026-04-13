# Development Sprints

## Overview

Development is split into 6 sprints. Each sprint produces working, testable software. Later sprints build on earlier ones. Do not start a sprint until the previous one is verified working.

**Stack:** Next.js 16 (App Router) + Supabase + Vercel. Python/FastAPI/WeasyPrint PDF service from the original plan has been deferred (see Sprint 6 decision note); browser print handles current volume.

## Status snapshot (last updated 2026-04-14)

| Sprint | Title | Status |
|---|---|---|
| 1 | Foundation | ✅ Done |
| 2 | Student Roster | ✅ Done |
| 3 | Grade Entry | 🔶 Mostly done (comparison column deferred) |
| 4 | Locking & Audit Trail | 🔶 Mostly done (blank-counts dashboard pending; `is_na` has API but no UI toggle) |
| 5 | Comments, Attendance & Report Card Data | 🔶 Done with deferrals (Sec 3–4 profile, attendance import) |
| 6 | PDF Generation & Polish | 🔶 PDF service deferred; **design system pass Bite 1 shipped** (Bites 2–5 in progress); Vercel deploy still pending |
| — | Teacher Assignments _(added mid-flight)_ | ✅ Done — `teacher_assignments` table + CRUD UI + gates on grading list & comments |
| 7 | Admissions Dashboard (Phase 2) | ⏸️ Not started |

### Cross-cutting improvements backlog

These came up during sprints but were intentionally deferred to keep scope tight:

- Tighten per-table RLS policies (Sprint 1 shipped permissive `authenticated`-read; revisit before production)
- Previous-term comparison column on the grade entry grid (Sprint 3)
- Dedicated UI toggle for the `is_na` late-enrollee flag (Sprint 4)
- Registrar "sheets with blanks remaining" summary dashboard (Sprint 4)
- Automated PDF generation + Supabase Storage archival (Sprint 6)
- Mobile / tablet responsive pass (Sprint 6)
- End-of-year "mid-year T1–T3" vs "full year T1–T4" report card toggle (Sprint 5)
- Secondary Sec 3–4 Economics variant template (Sprint 5)
- Virtue-theme header label on comments / report card (Sprint 5)

**Reference docs:**

- `docs/context/01-project-overview.md` — architecture and people
- `docs/context/02-grading-system.md` — formula and rules
- `docs/context/03-workflow-and-roles.md` — workflow and sections
- `docs/context/04-database-schema.md` — full DB schema
- `docs/context/05-report-card.md` — report card structure
- `docs/context/06-admissions-integration.md` — Supabase admissions sync
- `docs/context/07-api-routes.md` — all API routes
- `docs/context/09-design-system.md` — tokens, components, forbidden patterns (read before any UI work)

---

## Sprint 1 — Foundation ✅ Done

**Goal:** Project scaffolding, database setup, authentication working

### Tasks

- [x] Initialize Next.js project with App Router and TypeScript _(Next.js 16.2.3, Tailwind v4)_
- [x] Set up Supabase project (or connect to existing) _(single shared project with admissions)_
- [x] Create all database tables from `docs/context/04-database-schema.md` _(`001_initial_schema.sql`; `002_widen_grade_entry_numerics.sql` fixed a numeric precision bug)_
- [x] Seed reference data: levels, subjects, subject_configs (weights), academic_years, terms _(levels/subjects/AY2026/sections in Sprint 1, terms + subject_configs seeded in Sprint 3)_
- [x] Implement Supabase Auth (email/password) _(via `@supabase/ssr`)_
- [x] Implement role-based access: `teacher`, `registrar`, `admin`, `superadmin` _(stored in `app_metadata.role`; enforced in `proxy.ts`)_
- [x] Basic layout: sidebar navigation, role-aware menu items _(`NAV_BY_ROLE` in `lib/auth/roles.ts`)_
- [x] Environment variables — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `PDF_SERVICE_URL` _(admissions vars dropped; single shared project)_

### Seed Data to Insert

```sql
-- Levels
INSERT INTO levels (code, label, level_type) VALUES
('P1','Primary 1','primary'), ('P2','Primary 2','primary'),
('P3','Primary 3','primary'), ('P4','Primary 4','primary'),
('P5','Primary 5','primary'), ('P6','Primary 6','primary'),
('S1','Secondary 1','secondary'), ('S2','Secondary 2','secondary'),
('S3','Secondary 3','secondary'), ('S4','Secondary 4','secondary');

-- Subjects (Primary)
INSERT INTO subjects (code, name, is_examinable) VALUES
('ENG','English',true), ('MATH','Mathematics',true),
('MT','Mother Tongue',true), ('SCI','Science',true),
('SS','Social Studies',true), ('MUSIC','Music Education',false),
('ARTS','Arts Education',false), ('PE','Physical Education',false),
('HE','Health Education',false), ('CL','Christian Living',false);

-- Subjects (Secondary)
INSERT INTO subjects (code, name, is_examinable) VALUES
('HIST','History',true), ('LIT','Literature',true),
('HUM','Humanities',true), ('ECON','Economics',true),
('CA','Contemporary Art',false),
('PEH','Physical Education and Health',false),
('PMPD','Pastoral Ministry and Personal Development',false),
('CCA','Co-curricular Activities',false);
```

### Definition of Done

- User can log in and see a dashboard appropriate to their role
- All tables exist in Supabase with correct constraints
- Role middleware correctly blocks unauthorized routes

---

## Sprint 2 — Student Roster ✅ Done

**Goal:** Admissions sync working, students visible per section

### Tasks

- [x] Build admissions sync API route (`POST /api/students/sync`)
- [x] Handle null `studentNumber` — skip and report to registrar
- [x] Normalize section names on sync (typos + hyphens: "Courageos" → "Courageous", "Integrity-1" → "Integrity 1")
- [x] Build sync preview (`GET /api/students/sync/stats`) — show counts before committing
- [x] Admin UI: Sync Students page with preview and confirm button
- [x] Create sections for AY2026 per level
- [x] Index number assignment on sync (append-only, never reassign)
- [x] Withdrawn student handling (grey out, preserve index)
- [x] Section roster view: list students per section with index number and status
- [x] Manual student add (fallback when admissions data is missing) _(edit-existing not built; add covers the stated need)_
- [x] Also added: level-label normalizer ("Primary Two" → "Primary 2")

### Definition of Done

- [x] Registrar can trigger sync and see a summary of changes
- [x] All AY2026 sections show correct student rosters _(90 students synced; 1 genuine admissions-data inconsistency left visible in the error list by design)_
- [x] Withdrawn students appear greyed out with index preserved
- [x] Manual add works as a fallback

---

## Sprint 3 — Grade Entry 🔶 Mostly done

**Goal:** Teachers can enter scores, system computes grades correctly

### Tasks

- [x] Build grading sheet creation (registrar creates per subject + section + term)
- [x] Grade entry UI: grid view — rows = students, columns = W1..W5, PT1..PT5, QA
- [x] Display index number, student name alongside score inputs
- [x] Configure max scores (WW totals, PT totals, QA total) per sheet _(inline `TotalsEditor` panel also lets registrars add/remove slots mid-term, with automatic recompute)_
- [x] Real-time computation on score change (server-side, not client-side):
  - WW_PS, PT_PS, QA_PS
  - Initial Grade
  - Quarterly Grade (transmutation formula) _(pure `lib/compute/quarterly.ts` with self-test asserting `quarterly=93` on module load)_
- [x] Validate: score cannot exceed max for that column
- [x] Blank vs zero distinction: empty input = null, explicit "0" = 0
- [x] Non-examinable subjects: show letter grade dropdown (A/B/C/IP/UG/NA/INC/CO/E) instead of score inputs
- [ ] Term-over-term comparison column: show previous term's quarterly grade, highlight if delta > 5 points _(deferred — no prior-term data exists yet; revisit after a full term cycle)_
- [x] Teacher sees only their assigned subjects and sections _(done in Sprint 6 / teacher assignments, not Sprint 3; list filter now gated by `teacher_assignments`)_

### Transmutation Implementation

```python
import math

def compute_quarterly_grade(
    ww_scores: list[float | None],
    ww_totals: list[float],
    pt_scores: list[float | None],
    pt_totals: list[float],
    qa_score: float | None,
    qa_total: float,
    ww_weight: float,
    pt_weight: float,
    qa_weight: float
) -> dict:
    # Only count non-null scores
    ww_sum = sum(s for s in ww_scores if s is not None)
    ww_max = sum(t for t, s in zip(ww_totals, ww_scores) if s is not None)
    pt_sum = sum(s for s in pt_scores if s is not None)
    pt_max = sum(t for t, s in zip(pt_totals, pt_scores) if s is not None)

    ww_ps = (ww_sum / ww_max * 100) if ww_max > 0 else 0
    pt_ps = (pt_sum / pt_max * 100) if pt_max > 0 else 0
    qa_ps = (qa_score / qa_total * 100) if qa_score is not None and qa_total > 0 else 0

    initial = (ww_ps * ww_weight) + (pt_ps * pt_weight) + (qa_ps * qa_weight)

    if initial < 60:
        quarterly = math.floor(60 + (15 * initial / 60))
    else:
        quarterly = math.floor(75 + (25 * (initial - 60) / 40))

    return {
        "ww_ps": round(ww_ps, 4),
        "pt_ps": round(pt_ps, 4),
        "qa_ps": round(qa_ps, 4),
        "initial_grade": round(initial, 4),
        "quarterly_grade": quarterly
    }
```

### Definition of Done

- [x] Teacher can open a grading sheet and enter scores
- [x] Grades compute correctly against known test cases from existing sheets _(verified end-to-end: 89.33 → 93 on real P1 Patience × Math row)_
- [x] Blank and zero are handled distinctly
- [x] Non-examinable subjects show letter grade selector
- [ ] Comparison column shows previous term grade _(deferred)_

---

## Sprint 4 — Locking & Audit Trail 🔶 Mostly done

**Goal:** Registrar can lock sheets, post-lock edits are tracked

### Tasks

- [x] Lock/unlock API routes with role guard (registrar only)
- [x] Locked sheet: all inputs become read-only for teachers _(server 403 + disabled UI)_
- [x] Registrar can still edit a locked sheet (post-lock edit mode)
- [x] Post-lock edit requires `approval_reference` field (email subject/ref) _(enforced server-side; grid prompts once and caches for the session)_
- [x] All post-lock edits written to `grade_audit_log` _(per-field diff rows with bracket notation, e.g. `ww_scores[1]`)_
- [x] Audit log UI: filterable by sheet _(date/editor filters are a small follow-up; `?sheet_id=` and `?entry_id=` work)_
- [x] Update QA/WW/PT totals (max scores) post-lock also requires approval ref and is logged _(full-sheet recompute cascades automatically)_
- [x] Lock timestamp and locked-by recorded on `grading_sheets`
- [x] Late enrollee flag: registrar can mark specific assessments as N/A per student _(`is_na` supported in PATCH + audit-logged; no dedicated UI toggle yet — set via DB or API)_
- [ ] Registrar dashboard: overview of all sheets — which are locked, which have blanks _(lock status shown on `/grading` list; "sheets with blanks remaining" indicator not built)_

### Definition of Done

- [x] Locked sheet is read-only for teachers
- [x] Registrar edits on locked sheet create audit log entries
- [x] Approval reference is mandatory for post-lock edits
- [x] Registrar dashboard shows lock status across all sections _(on the grading list page; a dedicated summary dashboard with blank-counts is a polish follow-up)_

---

## Sprint 5 — Comments, Attendance & Report Card Data 🔶 Done with deferrals

**Goal:** All report card data is collectable and viewable

### Tasks

- [x] Teacher comment entry UI per student per term (per section) _(registrar path at `/admin/sections/[id]/comments`; teacher/form-adviser path at `/grading/advisory/[id]/comments`; gated server-side to `form_adviser` role)_
- [x] Attendance entry UI: school days, days present, days late per student per term _(registrar at `/admin/sections/[id]/attendance`; teachers cannot edit)_
- [ ] Attendance import from existing system _(no attendance module exists at HFSE; deferred until one does)_
- [x] Report card data aggregation API (`GET /api/report-card/[studentId]`)
  - All quarterly grades per subject across T1–T4
  - Overall annual grade (T1×0.2 + T2×0.2 + T3×0.2 + T4×0.4, rounded 2dp) _(pure `lib/compute/annual.ts` with self-test)_
  - Attendance per term
  - Teacher comment
- [x] Report card preview UI (HTML rendering, matches PDF layout) _(`/report-cards/[studentId]` with print-friendly styles and a browser Print / Save as PDF button)_
- [ ] Student development profile (secondary only — Sec 3–4 Economics handling) _(deferred — no Sec 3–4 students yet in AY2026)_

### Definition of Done

- [x] Teacher can enter comments for all their students _(form adviser only)_
- [x] Attendance is recordable per term per student
- [x] Report card preview shows correctly assembled data
- [x] Overall grade formula matches the masterfile formula exactly

---

## Sprint 6 — PDF Generation & Polish 🔶 Mostly deferred / in progress

**Decision (2026-04):** The Python/WeasyPrint service is deferred indefinitely. HFSE's actual volume (one registrar, ~90 students × 4 terms) is comfortably handled by the browser's Print / Save as PDF dialog, which is already wired into the preview page. If automation or archival becomes a need, the next step is Puppeteer-in-Next.js (no second deployment), with optional Supabase Storage archival.

**Design system pass (2026-04):** Added `docs/context/09-design-system.md` — industrial / utilitarian dark theme with DM Sans + DM Mono, token palette in Tailwind v4 `@theme`, no gradients, no emoji in UI, square containers. Being applied in 5 bites; see the "Design system pass" subsection below.

### Tasks

#### Python PDF Service — ⏭️ deferred

- [ ] Initialize FastAPI project
- [ ] Create Jinja2 HTML templates:
  - `templates/primary_report_card.html`
  - `templates/secondary_sec12_report_card.html`
  - `templates/secondary_sec34_report_card.html`
- [ ] Style templates with CSS to match existing report card layout exactly
- [ ] `POST /generate-pdf` endpoint — accepts JSON, returns PDF binary
- [ ] `GET /health` and `GET /ping` endpoints
- [ ] Deploy to Render or Railway

#### Next.js Integration — ⏭️ deferred (browser print covers the use case)

- [ ] `POST /api/report-card/[studentId]/pdf` — calls PDF service, streams back PDF
- [ ] `POST /api/report-card/section/[sectionId]/pdf` — batch PDF for whole section
- [ ] Keep-warm ping to PDF service every 10 minutes (to avoid Render cold start)
- [x] Download button in report card preview UI _(browser Print / Save as PDF — user picks destination)_

#### Polish & Hardening

- [ ] Error handling: what happens if PDF service is down _(N/A while PDF service is deferred)_
- [ ] Loading states for all async operations _(partial — grading grid has saving/error states; broader pass pending)_
- [x] Input validation on all grade entry fields _(server-side range checks; client-side blank-vs-zero preserved)_
- [ ] Mobile-responsive layout (at minimum tablet-friendly for teachers entering grades) _(deferred — desktop-only for now)_
- [x] User management: teachers created in Supabase dashboard, assigned via `teacher_assignments` on the section page
- [x] End-to-end test: create sheet → enter grades → lock → post-lock edit with approval → audit log → report card preview _(manually walked through; no automated E2E suite)_
- [ ] Deploy to Vercel _(blocked on design system pass completion + RLS tightening)_

#### Design system pass — in progress

Per `docs/context/09-design-system.md`. Sweeping in bites so direction can be verified before propagating.

- [x] **Bite 1** — token palette in `@theme`, DM Sans + DM Mono via `next/font/google`, dark body, sidebar (sectioned nav with active indicator), dashboard layout, login page _(app/app/globals.css, app/app/layout.tsx, app/components/ui/sidebar.tsx, app/app/(dashboard)/layout.tsx, app/app/(auth)/login/page.tsx, app/lib/auth/roles.ts)_
- [ ] **Bite 2** — shared component primitives (`.btn-*`, `.badge-*`, `.card`, `.field`, `.table`, `.score-input`, `.stat-card`) in globals.css
- [ ] **Bite 3** — sweep data pages (grading list + detail grid, sections list + detail + roster, audit log, sync students preview, admin landing)
- [ ] **Bite 4** — sweep forms + remaining pages (new grading sheet, comments grid, attendance grid, teacher assignments panel, report card list + preview — preserve print styles)
- [ ] **Bite 5** — special rules polish: grade color coding on quarterly column (<75 danger, 75–84 warning, 85+ neutral), locked-sheet plain-text mode, Tab key navigation between score cells, `.score-input.exceeds-max` red border + danger bg, withdrawn-row line-through

### Definition of Done

- [x] Report card preview matches the spec layout _(browser-rendered; PDF service deferred)_
- [ ] Batch PDF generation works for a full section _(deferred)_
- [ ] System is deployed and accessible to Joann for UAT _(next up)_
- [x] At least one full term's worth of data has been entered and a report card successfully previewed

---

## Phase 2

> Phase 2 begins only after all 6 Phase 1 sprints are complete and the grading module has been verified in production (UAT signed off by Joann and Amier).

---

## Sprint 7 — Admissions Dashboard & Inquiry Tracking

**Goal:** Admissions team has a real-time dashboard for pipeline visibility, outdated application alerts, and inquiry tracking from SharePoint

**Full spec:** `docs/context/08-admissions-dashboard.md`

### Part A — Applications Dashboard (no blockers)

- [ ] Applications pipeline overview — summary cards per `applicationStatus` (Submitted, Processing, Enrolled, Withdrawn, Cancelled, Enrolled Conditional)
- [ ] Outdated applications table — applications not updated in 7+ days, with red/amber/green staleness indicators
- [ ] Day counter per application — days from `created_at` to enrolled (or today if still open)
- [ ] Average time to enrollment metric
- [ ] Applications by level bar chart — Submitted vs Enrolled per level
- [ ] Conversion funnel visualization — Submitted → Verification → Processing → Enrolled with drop-off %
- [ ] Document completion rate — % of applicants with required docs submitted (from `enrolment_documents`)
- [ ] Assessment outcomes chart — pass/fail rate from `assessmentGradeMath` + `assessmentGradeEnglish`
- [ ] Referral source breakdown — bar chart from `howDidYouKnowAboutHFSEIS`
- [ ] AY switcher — configurable table prefix (ay2026, ay2027, etc.) — do not hardcode the year
- [ ] Cache dashboard queries for 5–15 minutes (use Next.js fetch cache)

### Part B — Inquiry Tracking via SharePoint (blocked until HFSE provides credentials)

**Blockers — get these from HFSE before starting Part B:**

1. SharePoint site URL and list name (to resolve site ID and list ID via Graph Explorer)
2. Azure AD app registration — Tenant ID, Client ID, Client Secret
3. Exact column names in the SharePoint inquiries list

**Tasks (after blockers resolved):**

- [ ] Set up M365 Graph API client in Next.js — client credentials flow (server-side only)
- [ ] Add environment variables: `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_LIST_ID`
- [ ] Build SharePoint list sync API route — polls Graph API every 15 minutes, caches results
- [ ] Inquiry dashboard view — total inquiries, converted to application count, conversion rate
- [ ] Last updated timestamp — when was the most recent inquiry record added to SharePoint
- [ ] Staleness alert — warning banner if inquiry list not updated in 3+ school days
- [ ] Inquiry-to-application matching — match by email to show conversion funnel from inquiry to enrolled
- [ ] Unmatched inquiries view — leads that never became applications
- [ ] Weekly inquiry trend chart — volume over time vs same period last AY

### Access Control

| Role         | Access                    |
| ------------ | ------------------------- |
| `registrar`  | View only                 |
| `admin`      | Full dashboard access     |
| `superadmin` | Full access + data export |
| `teacher`    | No access                 |

### Definition of Done

- Applications dashboard is live and showing correct pipeline data for current AY
- Outdated applications table correctly flags stale records
- Day counter is accurate against known application dates
- Conversion funnel percentages are verified against raw counts
- Part B: Inquiry list last-updated timestamp is visible and staleness alert triggers correctly
- Part B: Inquiry-to-application matching correctly identifies converted leads

---

## Testing Checklist (before each sprint sign-off)

### Formula verification

Use these known values from the actual Math grading sheet (P1 Patience, student 1):

- WW: W1=10, W2=10 out of 10,10 → WW_PS = 100, WW_WS = 40.0
- PT: PT1=6, PT2=10, PT3=10 out of 10,10,10 → PT_PS = 86.67, PT_WS = 34.67
- QA: 22 out of 30 → QA_PS = 73.33, QA_WS = 14.67
- Initial Grade: 89.34
- Quarterly Grade (transmuted): **93** ✓

### Section names to use for testing

```
P1 Patience, P1 Obedience
P2 Honesty, P2 Humility
S1 Discipline 2, S2 Integrity 2
```

### Known data quality issues to test

- Student with all null WW scores (late enrollee)
- Student with zero QA score (took exam, scored zero)
- Section name typo normalization ("Courageos" → "Courageous")
