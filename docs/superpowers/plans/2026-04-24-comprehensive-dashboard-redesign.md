# Comprehensive Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit each of 7 module dashboards against the spec at `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md` and fix any gaps so every dashboard exactly matches its wireframe + KPI formulas + insight rules + §8 docs patterns.

**Architecture:** Grep-driven audit per module. For each module we verify (1) lib helpers reference columns that exist in the Phase 8 schema snapshot, (2) page section order matches wireframe, (3) insight thresholds match spec, (4) chart wrappers use serif titles + gradient `CardAction` tiles. Fix any drift inline. Net code changes expected to be small — this is a compliance pass, not a rebuild.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, Tailwind v4, shadcn primitives, recharts, `@tanstack/react-table`, existing `lib/dashboard/` primitives (range, insights, windows).

**References:**

- Spec: `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md`
- Schema snapshot: plan Phase 8 at `C:\Users\Ace\.claude\plans\for-all-our-module-curried-quail.md`
- Design system: `docs/context/09-design-system.md` + `docs/context/09a-design-patterns.md`

---

### Task 1: Baseline build + grep-drift baseline

**Files:**

- Read-only — no code changes.

- [ ] **Step 1: Run baseline build**

Run: `npx next build 2>&1 | tail -20`
Expected: all 79 routes compile, "Finalizing page optimization" at end.

- [ ] **Step 2: Grep for known-dead references**

Run:

```
grep -rn "report_card_comments" lib app components
```

Expected output: NO matches in `lib/` or `app/`. `report_card_comments` was dropped in migration 024; any residual reference is a bug.

- [ ] **Step 3: Grep for 2-digit AY slug references**

Run:

```
grep -rn "ay[0-9][0-9]_enrolment" lib app
```

Expected: NO matches. KD #53 requires `ay{YYYY}_*` (4-digit) slugs. Pre-026 2-digit slugs are dropped.

- [ ] **Step 4: Grep for gradient-tile compliance**

Run:

```
grep -rn "bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile" components/{admissions,sis,p-files,markbook} | wc -l
```

Expected: ≥ 12 matches (every chart wrapper's `CardAction`). If < 10, some wrapper lost its gradient tile during the earlier Phase 4/6 edits.

- [ ] **Step 5: Grep for `font-serif text-xl` CardTitle voice**

Run:

```
grep -rn "CardTitle className=\"font-serif text-xl" components/{admissions,sis,p-files,markbook}
```

Expected: ≥ 12 matches. Less means a chart wrapper lost its serif voice.

- [ ] **Step 6: Commit baseline findings**

```bash
# no commit needed for baseline — this task only verifies state
echo "Baseline checks complete. Proceeding with per-module audits."
```

---

### Task 2: Admissions audit — `/admissions`

**Files:**

- Audit: `app/(admissions)/admissions/page.tsx`
- Audit: `lib/admissions/dashboard.ts`
- Audit: `components/admissions/*-chart.tsx`
- Audit: `lib/dashboard/insights.ts` (admissionsInsights)

- [ ] **Step 1: Schema audit — lib helpers**

Read `lib/admissions/dashboard.ts`. Verify every column reference exists in the Phase 8 snapshot for `ay{YYYY}_enrolment_applications`, `ay{YYYY}_enrolment_status`, `ay{YYYY}_enrolment_documents`. Key columns:

- `created_at`, `enroleeNumber`, `studentNumber`, `levelApplied`, `enroleeFullName`, `firstName`, `lastName`, `howDidYouKnowAboutHFSEIS` (applications)
- `applicationStatus`, `applicationUpdatedDate`, `classLevel`, `assessmentGradeMath`, `assessmentGradeEnglish` (status)

Flag any helper that references a column NOT in Phase 8. Fix by removing the reference or renaming to the actual column.

- [ ] **Step 2: Page wireframe audit**

Read `app/(admissions)/admissions/page.tsx`. Confirm the section order matches spec §1 wireframe:

1. Hero + ComparisonToolbar
2. InsightsPanel
3. 4 MetricCards
4. Velocity TrendChart + Follow-up ActionList (lg:grid-cols-3, 2+1 split)
5. ConversionFunnelChart + time-to-enroll histogram (2+1)
6. PipelineStageChart + AssessmentOutcomesChart (2+1)
7. ReferralSourceChart + TimeToEnrollmentCard + Browse QuickLink (1+1+1)
8. Static AY counters (4 SummaryStats)
9. Full OutdatedApplicationsTable (print:hidden)
10. Trust strip

If any row is missing or out of order, rearrange with an `Edit` on the page.

- [ ] **Step 3: Insight-rule audit**

Read `lib/dashboard/insights.ts` → `admissionsInsights()`. Confirm thresholds match spec §1:

- Conversion rose: Δ ≥ +3pp → good
- Applications rising: Δ ≥ +5% → good
- Outdated count: ≥10 → bad, ≥3 → warn
- Top referral share: ≥15% → info
- Biggest funnel drop-off: ≥25% → warn

Fix any drift inline.

- [ ] **Step 4: Chart wrapper audit**

For each of `conversion-funnel-chart.tsx`, `assessment-outcomes-chart.tsx`, `referral-source-chart.tsx`, `time-to-enrollment-card.tsx` (in `components/admissions/`): confirm:

- `<CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">`
- `<CardAction>` contains `bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile`

Fix any wrapper missing either.

- [ ] **Step 5: Build verify**

Run: `npx next build 2>&1 | tail -10`
Expected: clean compile, all 79 routes.

- [ ] **Step 6: Commit**

```bash
git add app/(admissions) components/admissions lib/admissions lib/dashboard/insights.ts
git commit -m "chore(dashboard): admissions spec compliance audit"
```

---

### Task 3: Records audit — `/records`

**Files:**

- Audit: `app/(records)/records/page.tsx`
- Audit: `lib/sis/dashboard.ts` (shared with Admissions)
- Audit: `components/sis/document-backlog-chart.tsx`, `level-distribution-chart.tsx`, `pipeline-stage-chart.tsx`, `expiring-documents-panel.tsx`, `recent-activity-feed.tsx`

- [ ] **Step 1: Schema audit — lib helpers**

Read `lib/sis/dashboard.ts`. Verify column references against Phase 8 for `section_students` (`enrollment_status`, `enrollment_date`, `withdrawal_date`), `ay{YYYY}_enrolment_status` (21 `*UpdatedDate` cols + note typo `registrationUpdateDate` vs `*UpdatedDate`), `ay{YYYY}_enrolment_documents` (`{slot}Expiry` cols).

- [ ] **Step 2: Wireframe audit**

Confirm `app/(records)/records/page.tsx` row order matches spec §2:

1. Hero + Toolbar
2. InsightsPanel
3. 4 MetricCards (sparkline on #1)
4. Enrollment + Withdrawal velocity TrendCharts (lg:grid-cols-2)
5. Static AY counters (§8 SectionCards pattern)
6. Quick-link row (md:grid-cols-3)
7. DocumentBacklogChart + LevelDistributionChart (2+1)
8. PipelineStageChart + ExpiringDocumentsPanel (2+1)
9. ActionList "Documents to collect"
10. RecentActivityFeed
11. Trust strip

- [ ] **Step 3: Insight-rule audit**

`recordsInsights()` thresholds per spec §2:

- New enrollments Δ ≥ +5% → good
- Withdrawals > prior × 1.5 (and prior > 0) → bad
- Expiring ≤60d: ≥10 → warn, ≥3 → info

- [ ] **Step 4: Chart wrapper audit**

All 5 wrappers under `components/sis/` must have serif CardTitle + gradient CardAction tile.

- [ ] **Step 5: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add app/(records) components/sis lib/sis/dashboard.ts
git commit -m "chore(dashboard): records spec compliance audit"
```

---

### Task 4: P-Files audit — `/p-files`

**Files:**

- Audit: `app/(p-files)/p-files/page.tsx`
- Audit: `lib/p-files/dashboard.ts`
- Audit: `components/p-files/summary-cards.tsx`, `completion-by-level-chart.tsx`, `revisions-over-time-chart.tsx`, `top-missing-panel.tsx`

- [ ] **Step 1: Schema audit**

Verify `lib/p-files/dashboard.ts` uses:

- `p_file_revisions.replaced_at`, `ay_code`, `enrolee_number`, `slot_key`, `status_snapshot`, `expiry_snapshot`
- `ay{YYYY}_enrolment_documents.{slot}Status`, `{slot}Expiry` — expiring slots list must match `DOCUMENT_SLOTS` with `expires: true`

- [ ] **Step 2: Wireframe audit**

Confirm page row order per spec §3:

1. Hero + Toolbar
2. InsightsPanel
3. 4 range MetricCards
4. SummaryCards (4 all-time stats)
5. ActionList "Documents to collect"
6. RevisionsOverTimeChart (wide)
7. CompletionByLevelChart + Slot-status DonutChart (2+1)
8. TopMissingPanel + ExpiringDocumentsPanel (1+1)
9. Legend strip
10. CompletenessTable
11. Trust strip

- [ ] **Step 3: Insight-rule audit**

`pfilesInsights()` thresholds:

- Expiring ≥10 → bad, ≥1 → warn
- Pending ≥15 → warn, ≥3 → info
- Revisions Δ ≥ ±20% → info
- Completion ≥90% → good, <75% w/ pending > 0 → warn

- [ ] **Step 4: Chart wrapper audit**

`completion-by-level-chart.tsx`, `revisions-over-time-chart.tsx`, `top-missing-panel.tsx` — serif CardTitle + gradient CardAction tile.

- [ ] **Step 5: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add app/(p-files) components/p-files lib/p-files
git commit -m "chore(dashboard): p-files spec compliance audit"
```

---

### Task 5: Markbook audit — `/markbook`

**Files:**

- Audit: `app/(markbook)/markbook/page.tsx`
- Audit: `lib/markbook/dashboard.ts`
- Audit: `components/markbook/grade-distribution-chart.tsx`, `sheet-progress-chart.tsx`, `change-request-panel.tsx`, `publication-coverage-chart.tsx`, `recent-markbook-activity.tsx`

- [ ] **Step 1: Schema audit**

Verify columns:

- `grading_sheets.is_locked`, `locked_at`, `term_id`, `section_id`, `subject_id`
- `grade_entries.created_at`, `quarterly_grade` (smallint), `ww_scores numeric[]`, `pt_scores numeric[]`
- `grade_change_requests.status`, `requested_at`, `reviewed_at`, `reason_category`
- `report_card_publications.publish_from`, `publish_until`, `section_id`, `term_id`
- `audit_log` prefixes for Markbook (per `MARKBOOK_ACTION_PREFIXES` in lib/markbook/dashboard.ts)

Numeric precision note: `ww_ps`, `pt_ps`, `qa_ps`, `initial_grade` are `numeric(7,4)` (widened in mig 002). Charts/formatters should NOT assume `numeric(6,4)`.

- [ ] **Step 2: Wireframe audit**

Confirm page row order per spec §4:

1. Hero + Toolbar (no AY switcher)
2. InsightsPanel
3. 4 range MetricCards
4. Grade-entry + CR-velocity TrendCharts (2 cols)
5. Static AY counters (dashboard-01)
6. GradeDistributionChart + SheetProgressChart (2+1)
7. ChangeRequestPanel + PublicationCoverageChart (1+1)
8. RecentMarkbookActivity
9. Admin tools (3 QuickLinkCards)
10. Jump-back-in (2 QuickLinkCards)
11. Trust strip

- [ ] **Step 3: Insight-rule audit**

`markbookInsights()` thresholds:

- Change requests pending ≥5 → bad, ≥1 → warn
- lockedPct ≥90 → good, <50 (and total>0) → warn
- gradesEntered Δ ≥ ±15% → info

- [ ] **Step 4: Chart wrapper audit**

All 5 Markbook wrappers have serif CardTitle + gradient CardAction tile.

- [ ] **Step 5: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add app/(markbook) components/markbook lib/markbook
git commit -m "chore(dashboard): markbook spec compliance audit"
```

---

### Task 6: Attendance audit — `/attendance`

**Files:**

- Audit: `app/(attendance)/attendance/page.tsx`
- Audit: `lib/attendance/dashboard.ts`

- [ ] **Step 1: Schema audit**

Verify:

- `attendance_daily.status` ∈ (`P`,`L`,`EX`,`A`,`NC`), `ex_reason` ∈ (`null`,`mc`,`compassionate`,`school_activity`), `date`, `recorded_at`, `section_student_id`, `period_id` (nullable Phase 1)
- `attendance_records` rollup columns: `school_days`, `days_present`, `days_late`, `days_excused`, `days_absent`, `attendance_pct numeric(5,2)`
- `school_calendar.day_type` ∈ (`school_day`,`public_holiday`,`school_holiday`,`hbl`,`no_class`); note `is_holiday` is a trigger-derived column (prefer `day_type` in new code)

Encodable-day semantics: writes allowed only for `day_type` ∈ (`school_day`, `hbl`). The dashboard READS only — but confirm aggregations exclude `NC` rows from `school_days`.

- [ ] **Step 2: Wireframe audit**

Confirm page row order per spec §5:

1. Hero + "Mark attendance" primary CTA + Toolbar (no AY switcher)
2. InsightsPanel
3. 4 MetricCards (Attendance rate sparkline on #1)
4. Daily attendance % TrendChart (wide, yFormat="percent")
5. EX reason donut + Day-type donut (lg:grid-cols-2)
6. Top-absent students Table
7. Trust strip

- [ ] **Step 3: Insight-rule audit**

`attendanceInsights()` thresholds:

- attendancePct ≥95 → good; Δ ≤ −1pp (pct <90) → bad; (pct ≥90) → warn
- absent > absentPrior × 1.5 (prior > 0) → bad
- late > latePrior × 1.5 (prior > 0) → warn
- encodedDays == 0 → info

- [ ] **Step 4: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add app/(attendance) lib/attendance
git commit -m "chore(dashboard): attendance spec compliance audit"
```

---

### Task 7: Evaluation audit — `/evaluation`

**Files:**

- Audit: `app/(evaluation)/evaluation/page.tsx`
- Audit: `lib/evaluation/dashboard.ts`

- [ ] **Step 1: Schema audit**

Verify:

- `evaluation_writeups.created_at`, `updated_at`, `submitted_at`, `submitted bool`, `term_id`, `student_id`, `section_id`
- `terms.virtue_theme` (nullable)
- `evaluation_terms.is_open`, `opened_at`, `term_id` (unique)
- T4 exclusion: all queries filter `term_number ∈ (1,2,3)` — T4 is NEVER included.

- [ ] **Step 2: Wireframe audit**

Confirm page row order per spec §6 (dashboard band ABOVE existing hub):

1. Hero + Toolbar (no AY switcher)
2. InsightsPanel
3. 4 MetricCards (Submission % sparkline on #1)
4. Writeup submissions TrendChart (comparison = lastTerm)
5. Existing hub cards (2 HubCards: My sections / Virtue theme)
6. Existing evaluation-window strip (TermOpenToggle × 3 terms)
7. Trust strip

- [ ] **Step 3: Insight-rule audit**

`evaluationInsights()` thresholds:

- submissionPct ≥90 (expected > 0) → good
- submissionPct <50 (expected > 0) → bad
- lateSubmissions ≥5 → warn, ≥1 → info
- medianTimeToSubmit Δ ≥ ±2d → info/warn

- [ ] **Step 4: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add app/(evaluation) lib/evaluation
git commit -m "chore(dashboard): evaluation spec compliance audit"
```

---

### Task 8: SIS Admin audit — `/sis`

**Files:**

- Audit: `app/(sis)/sis/page.tsx`
- Audit: `lib/sis/dashboard.ts` (audit-activity aggregator)

- [ ] **Step 1: Schema audit**

Verify:

- `audit_log.created_at`, `action text`, `actor_email`, `entity_id`, `context jsonb`
- Module prefixes tracked (must match `lib/sis/dashboard.ts` `modules` array):
  - `sheet.`, `entry.`, `pfile.`, `sis.`, `attendance.`, `evaluation.`
- Index `audit_log_created_idx on (created_at desc)` exists (mig 006) — SIS audit-activity chart depends on it.

- [ ] **Step 2: Wireframe audit**

Confirm page row order per spec §7:

1. Hero
2. SystemHealthStrip (superadmin only)
3. Toolbar (no AY switcher)
4. InsightsPanel
5. 4 MetricCards
6. Audit activity by module ComparisonBarChart (horizontal)
7. Admin card grid (3 groups: Academic Year · Organisation · Access · Related)
8. Trust strip (optional)

- [ ] **Step 3: Insight-rule audit**

`sisInsights()` thresholds:

- auditEvents Δ ≥ ±25% → info/warn
- topModule.share ≥40% → info
- (trackedModules − activeModules) ≥2 → info
- auditEvents == 0 → info

- [ ] **Step 4: Data integrity note**

Confirm `getAuditActivityByModule` is **deterministic order** — module results must preserve input order so `current[i]` aligns with `comparison[i]`. The bug that produced the "negative timestamp" profiler warning earlier was an `out.push` inside `Promise.all(modules.map(async))`; current code uses `return` from each mapped promise and indexes the result. Verify.

- [ ] **Step 5: Build verify**

Run: `npx next build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add app/(sis) lib/sis/dashboard.ts
git commit -m "chore(dashboard): sis-admin spec compliance audit"
```

---

### Task 9: Shared primitives audit

**Files:**

- Audit: `components/dashboard/dashboard-hero.tsx`
- Audit: `components/dashboard/comparison-toolbar.tsx`
- Audit: `components/dashboard/insights-panel.tsx`
- Audit: `components/dashboard/action-list.tsx`
- Audit: `components/dashboard/metric-card.tsx`
- Audit: `components/dashboard/charts/*.tsx`
- Audit: `components/ui/date-range-picker.tsx`
- Audit: `lib/dashboard/range.ts`, `lib/dashboard/windows.ts`, `lib/dashboard/insights.ts`

- [ ] **Step 1: Hero voice**

Confirm `DashboardHero` renders:

- Eyebrow: `font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground`
- Headline: `font-serif text-[38px] md:text-[44px] font-semibold leading-[1.05] tracking-tight`
- Body: `text-[15px] leading-relaxed text-muted-foreground`

- [ ] **Step 2: MetricCard voice**

Confirm `MetricCard` renders:

- Card with dashboard-01 gradient: `bg-gradient-to-t from-primary/5 to-card shadow-xs`
- `CardDescription` mono 10px uppercase
- `CardTitle` `font-serif text-[32px] tabular-nums @[240px]/card:text-[38px]`
- Gradient icon tile in `CardAction`: `bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile`
- Delta chip uses §9.3 recipes (mint / destructive / muted)

- [ ] **Step 3: InsightsPanel voice**

Confirm `InsightsPanel` is a single Card with:

- `CardTitle` `font-serif text-xl`
- Gradient `CardAction` tile (Sparkles icon)
- Divided-row `<ul>` of observations
- Row title serif; row icon + severity pill use §9.3 mint/destructive/accent recipes

- [ ] **Step 4: `range.ts` preset completeness**

Confirm `resolvePreset` handles all 8: `last7d / last30d / last90d / thisTerm / lastTerm / thisAY / lastAY / custom`. Confirm `autoComparison` returns prior period of equal length.

- [ ] **Step 5: `windows.ts` uses service client**

Confirm `loadTermsUncached()` in `lib/dashboard/windows.ts` uses `createServiceClient()` (not cookie-scoped `createClient()`). Next 16 rejects `cookies()` inside `unstable_cache`.

- [ ] **Step 6: `insights.ts` all 7 exports**

Confirm `lib/dashboard/insights.ts` exports: `admissionsInsights`, `recordsInsights`, `pfilesInsights`, `markbookInsights`, `attendanceInsights`, `evaluationInsights`, `sisInsights`.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard components/ui/date-range-picker.tsx lib/dashboard
git commit -m "chore(dashboard): shared primitives spec audit"
```

---

### Task 10: Docs update

**Files:**

- Create or modify: `docs/context/20-dashboards.md`

- [ ] **Step 1: Check if docs/context/20-dashboards.md exists**

Run: `ls docs/context/20-dashboards.md`

Expected: either exists (update) or doesn't (create).

- [ ] **Step 2: Write the dashboard architecture one-pager**

Content:

```markdown
# Dashboard Architecture (20)

> This file documents the dashboard layer added in Sprints 16-19 (all-module dashboard upgrade). The detailed design spec is at `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md`; this is the canonical reference for anyone TOUCHING a dashboard.

## The pattern in one page

Every module's dashboard landing page composes from **one** vocabulary:

**Shared primitives (`components/dashboard/`):**

- `dashboard-hero.tsx` — canonical hero pattern (§8 hero header)
- `comparison-toolbar.tsx` — AY + date range + comparison period picker
- `insights-panel.tsx` — 3–5 auto-generated narrative observations
- `action-list.tsx` — compact follow-up table
- `metric-card.tsx` — dashboard-01 SectionCards KPI with delta + sparkline
- `charts/trend-chart.tsx` — area chart with gradient fill + comparison overlay
- `charts/comparison-bar-chart.tsx` — grouped bar (vertical or horizontal)
- `charts/donut-chart.tsx` — donut + inline legend with progress bars
- `charts/stacked-area-chart.tsx` — cumulative stacked area
- `charts/sparkline-chart.tsx` — inline 40px area line
- `charts/heatmap.tsx` — custom grid (solid-tint intensity steps)

**Shared lib (`lib/dashboard/`):**

- `range.ts` — preset resolution + delta math + shared types (`RangeInput`, `RangeResult<T>`)
- `windows.ts` — server-side term + AY window resolver (uses service client to stay inside `unstable_cache`)
- `insights.ts` — 7 module-specific insight generators (pure, data-driven)

## URL-param contract

Every dashboard page parses the same query shape:
```

?ay=AY2026&from=YYYY-MM-DD&to=YYYY-MM-DD&cmpFrom=YYYY-MM-DD&cmpTo=YYYY-MM-DD

````

Malformed `from`/`to` → fall back to `thisTerm` preset (else last-30d). Missing `cmpFrom`/`cmpTo` → auto-computed prior period of equal length.

Module-specific secondary filters (`?level=P3`, `?status=pending`, etc.) stack on top via URL params only — no dropdown UI.

## Library contract

Every `lib/<module>/dashboard.ts` file adds `*Range` sibling functions next to any AY-scoped existing functions:

```ts
export function getRevisionsOverTime(ayCode: string, weeks = 12): Promise<RevisionWeek[]>;                    // existing
export function getRevisionsOverTimeRange(input: RangeInput): Promise<RangeResult<RevisionWeek[]>>;          // added
````

Hoist `load*Uncached` at module scope (KD #46), wrap per-call with `unstable_cache` using cache key `['module', 'fn-name', ayCode, from, to, cmpFrom, cmpTo]` and tag = the existing per-AY tag.

## F-pattern row order

Every dashboard follows:

1. Hero + filters
2. InsightsPanel
3. 4 MetricCards (SectionCards grid)
4. Primary trend chart (wide)
5. Secondary trend or context
6. Breakdowns (donuts / horizontal bars)
7. Action lists + tables
8. Trust strip

Chart budget ≤ 8 per screen (sparklines inside MetricCards don't count).

## Comparison model

"Target" = **prior period of equal length** (auto-computed by `autoComparison()` in `lib/dashboard/range.ts`). No stored `kpi_targets` table. Delta chips on MetricCards read ±% / ±pp vs prior.

## Full spec

See `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md` for per-module business questions, KPI formulas, wireframes, insight rules, and deviation notes.

````

Write this content to `docs/context/20-dashboards.md`.

- [ ] **Step 3: Update CLAUDE.md table-of-contents**

Check `CLAUDE.md` for a reference table of docs/context/ files and confirm `20-dashboards.md` is listed with the trigger "Any dashboard work — before touching a module's landing page or `lib/<module>/dashboard.ts`." If not present, add it.

- [ ] **Step 4: Commit**

```bash
git add docs/context/20-dashboards.md CLAUDE.md
git commit -m "docs(dashboard): add dashboard architecture one-pager"
````

---

### Task 11: Final verification — full-system smoke test

**Files:** Read-only.

- [ ] **Step 1: Clean build**

Run: `rm -rf .next && npx next build 2>&1 | tail -30`
Expected: clean compile, 79 routes generated (or current count — may be 80+ with sections subroute).

- [ ] **Step 2: Spec-coverage check**

Open the spec: `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md`.

For each of the 7 modules, confirm the "Changes-from-current inventory" table entries are accurate now. If any module needs changes that weren't in the audit, add them.

- [ ] **Step 3: Grep for drift risks (negative control)**

Run:

```
grep -rn "text-lg font-semibold tracking-tight" app/ components/dashboard/
```

Expected: ZERO matches. If any remain, they're the earlier "modern Vercel-sans" override leftover and must be reverted to `font-serif text-xl`.

Run:

```
grep -rn "bg-accent text-accent-foreground shadow-brand-tile" app/ components/
```

Expected: ZERO matches (solid-tint + brand-tile shadow is an inconsistency — if bg is solid-tint, shadow should drop).

- [ ] **Step 4: Grep for chart-count compliance**

For each dashboard page, manually count `<TrendChart`, `<ComparisonBarChart`, `<DonutChart`, `<StackedAreaChart`, `<Heatmap`, `<GradeDistributionChart`, `<SheetProgressChart`, `<ConversionFunnelChart`, `<PipelineStageChart`, `<AssessmentOutcomesChart`, `<CompletionByLevelChart`, `<DocumentBacklogChart`, `<LevelDistributionChart`, `<RevisionsOverTimeChart`, `<PublicationCoverageChart`, `<ChangeRequestPanel` occurrences.

Confirm per spec:

- Admissions: 6 · Records: 5 · P-Files: 3 · Markbook: 6 · Attendance: 3 · Evaluation: 1 · SIS: 1

If any module exceeds 8, flag as violation.

- [ ] **Step 5: Record audit results**

If all checks pass, write a short summary comment in the PR description or commit log:

```
Spec-compliance audit complete for all 7 dashboards.
- Admissions: n changes · Records: n · P-Files: n · Markbook: n
- Attendance: n · Evaluation: n · SIS: n
- Build: clean (79 routes)
- Charts per dashboard: all within 8-chart budget
- Voices: serif headlines + gradient CardAction tiles verified everywhere
- Insight thresholds match spec
```

- [ ] **Step 6: Final commit**

```bash
git add -u
git commit --allow-empty -m "chore(dashboard): Phase 9 spec-compliance audit complete"
```

---

## Self-review (done by plan author)

**1. Spec coverage:** Every spec section mapped to a task.

- Shared design language → Tasks 9, 10
- Admissions (§1) → Task 2
- Records (§2) → Task 3
- P-Files (§3) → Task 4
- Markbook (§4) → Task 5
- Attendance (§5) → Task 6
- Evaluation (§6) → Task 7
- SIS (§7) → Task 8
- Implementation roadmap → Tasks 1, 11
- Open items: left for follow-up (documented in spec)

**2. Placeholder scan:** All steps have concrete grep commands + exact line numbers or file paths. No TBDs/TODOs. Code content inline where needed.

**3. Type consistency:** No new types introduced by this plan — everything audits against existing exported types from `lib/dashboard/*` and `lib/<module>/dashboard.ts`. No drift risk.
