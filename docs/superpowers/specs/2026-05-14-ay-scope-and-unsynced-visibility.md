# 2026-05-14 — AY-scope hardening + unsynced-student visibility

## Why

Two related demo-day pain points:

1. **Cross-AY leak via sidebar badge.** The Markbook "Change requests" sidebar badge counted CRs across every AY in the database; the page itself AY-scoped via `grading_sheet.section.academic_year_id`. Switching environment to a test AY left a leftover badge from a different AY's pending CR. Fixed earlier today in `lib/change-requests/sidebar-counts.ts` + `lib/sidebar/use-realtime-badges.ts` — but the user reported the broader concern that "all module features should be tied to the current active AY."
2. **Hard-to-detect chronic gap.** Enrolled students with `classSection IS NULL` (KD #90's unsynced queue) live at `/records/unsynced` with a chip on the Records hero and a sidebar count badge. During demo the chip was easy to miss; the registrar had to know to look at the sidebar.

## Scope (small, demo-grade)

This spec does **not** redesign AY routing or introduce a per-page AY selector. The system already centralises "current AY" on `academic_years.is_current = true`, surfaces the `<AyBanner>` + `<TestModeBanner>` on every module layout, and most module dashboards / data tables / drills correctly filter to that AY via `getCurrentAcademicYear()` → `getDashboardWindows()` / inner-join filters.

### Phase A — AY-scope audit (verify, fix any leaks)

Sweep every server-side query on AY-bound tables (`grading_sheets`, `grade_entries`, `grade_change_requests`, `attendance_daily`, `evaluation_*`, `report_card_publications`, `school_calendar`, `calendar_events`) and confirm each call path either:

- Filters via a section/term join to `current_ay.id`, **or**
- Is deliberately cross-AY (e.g. Records cross-year via `studentNumber` per KD #4, `/records/movements` with `?scope=all`, `/admissions/upcoming` per KD #77, the audit-log timeline). Cross-AY surfaces are explicit, not accidental.

The three sidebar badges (single highest-leverage signal, always visible) are confirmed AY-scoped post-audit:

- `changeRequests` (Markbook) — fixed earlier today.
- `unsyncedStudents` (Records) — already `countUnsyncedEnrolledStudents(currentAy.ay_code)`.
- `pendingDocValidation` (Admissions) — already `countPendingDocValidation(currentAy.ay_code)`.

Outcome of Phase A is documentation, not net-new code, unless the audit surfaces a real leak. The grep targets are already mapped; expected delta is 0–2 small fixes.

### Phase B — Unsynced visibility, loud edition

The chronic-gap surface today:

- `/records/unsynced` operational queue with the assign-section flow.
- Records sidebar entry "Students needing setup" with the SSR-static `unsyncedStudents` badge.
- A small amber chip on the Records dashboard hero when count > 0.

What changes:

- **Records dashboard — promote the chip to an Alert banner.** Replace the inline amber pill with a full-width `<Alert variant="warning">` mounted just below the `<DashboardHero>` and above the `<ComparisonToolbar>`, gated on `unsyncedCount > 0 && isCurrentAy && isOperational`. Includes the count, a one-sentence why ("Grading and attendance can't reach them until a class section is assigned"), and a primary "Review queue" button that routes to `/records/unsynced`. Oversight roles (school_admin/admin/superadmin) stay on the lighter chip — they don't act on the queue.
- **`/records/students` list — banner above the table.** Same wording, same destination. Currently the unsynced students don't appear in the student list at all (they're stranded outside `public.students`), so a registrar browsing the roster gets no signal. The banner closes that loop.
- **Sidebar badge** — keep as-is. Already works.

The Records hero KPI grid stays at 4 cards; we don't add a 5th unsynced KPI because the banner already carries the count and the click-through.

## Non-goals

- No realtime subscription on `unsyncedStudents` / `pendingDocValidation` badges. Both refresh on next navigation; admissions mutations invalidate `sis:${ayCode}` and the next render reads fresh.
- No new sidebar badges.
- No new mutation routes. KD #90's `POST /api/sis/students/[enroleeNumber]/assign-section` stays the single writer.
- No layout-level AY redirects when `is_current` flips. The existing `<AyBanner>` + `<TestModeBanner>` are already the cross-page signal; this spec doesn't relitigate that.

## Files touched

- `app/(records)/records/page.tsx` — replace chip with `<Alert variant="warning">` when operational; oversight roles keep the chip.
- `app/(records)/records/students/*` — find the list page, add the banner above the table.
- Per Phase-A audit: 0–2 small fixes in any module loader that turns out to query AY-bound tables without scoping (the grep is exhaustive; expected delta is 0).

## Acceptance

- Demo registrar in test AY9999 with one unsynced enrolled student: dashboard shows the alert banner top-of-page with "Review queue" CTA; students list shows the banner above the table; sidebar item "Students needing setup" shows the count badge.
- Same demo with current AY having zero unsynced: no banner on dashboard or list page; sidebar item has no badge.
- Phase-A audit produces a one-paragraph confirmation that all AY-bound queries scope (or an explicit list of intentional cross-AY surfaces).
- `npx next build` clean.
