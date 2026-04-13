# HFSE Grading Module — Project Overview

## What This Is

A web application to replace the current manual Google Sheets-based grading system at HFSE International School (Singapore). Teachers enter scores per subject per section per term. The system computes grades using the DepEd transmutation formula, locks sheets at the registrar's discretion, and generates printable PDF report cards.

## Organization Context

- **School:** HFSE International School, Singapore
- **Curriculum:** Aligned with DepEd Order No. 8, s. 2015
- **Levels:** Primary 1–6, Secondary 1–4
- **Terms:** 4 terms per academic year (T1, T2, T3, T4)
- **Class Types:** Global Class and Standard Class (different grading weights per subject)
- **Current AY:** 2025–2026

## Key People

| Person | Role | Relevance |
|--------|------|-----------|
| Joann Clemente | Registrar / Grading Admin (Vizserve) | Manages all grading sheets, locks/unlocks, applies post-lock edits |
| Ace Guevarra | Developer (Vizserve) | Building this app |
| Kurt Arciga | Developer (Vizserve) | Supporting development |
| Amier Ordonez | IT Lead (HFSE) | Client-side decision maker |
| Ms. Chandana | Principal (HFSE) | Approves grade adjustments and lock schedules |
| Ms. Tin | Academic Head (HFSE) | Co-approves adjustments |

## The Problem Being Solved

The current system is Google Sheets with:
- Formulas that break when teachers copy-paste into locked cells
- Manual setup of new sheets every term (clearing scores, re-linking formulas)
- No audit trail for who changed what
- Grade adjustments managed by email with no tracking
- Report card generation done manually via VLOOKUP across multiple files
- Student names manually maintained per sheet (not synced from admissions)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend + Backend API | Next.js (App Router) |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel |
| PDF Generation | Python + FastAPI + WeasyPrint |
| PDF Deployment | Render or Railway (free tier) |
| Student Data Source | Supabase admissions DB (existing) |

## High-Level Architecture

```
Browser
  └── Next.js App (Vercel)
        ├── /app — React frontend (teacher grade entry, admin dashboard)
        ├── /api — Next.js API routes (CRUD, grade computation, auth)
        └── → POST to Python PDF service (Render/Railway)
                └── WeasyPrint → PDF binary → streamed back to browser

Supabase (PostgreSQL)
  ├── Admissions DB (existing, read-only from grading app)
  │     ├── ay2026_enrolment_applications
  │     └── ay2026_enrolment_status
  └── Grading DB (new tables, owned by this app)
        ├── students
        ├── sections
        ├── grading_sheets
        ├── grade_entries
        ├── quarterly_grades
        └── report_card_comments
```

## Guiding Constraints

1. Teachers only enter raw scores — the system handles all computation
2. Grading sheets lock on a schedule set by the registrar (Ms. Chandana's instruction)
3. Post-lock edits require email approval from Ms. Chandana/Ms. Tin, then applied by Joann only
4. The system must produce a PDF report card that matches the existing physical format exactly
5. Student roster is sourced from the Supabase admissions DB — the grading app does not own student records
6. `studentNumber` is the stable cross-year student identifier (not `enroleeNumber`, which resets each AY)
