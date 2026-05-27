# Comprehensive Dashboard Redesign — All 7 Modules

**Date:** 2026-04-24
**Status:** Design spec, awaiting user review
**Author:** superpowers:brainstorming pair session

---

## Context

Each module's landing page should answer 3–5 **business questions** in 10 seconds of glancing. Today the pages show data; this spec makes them **decision surfaces** — KPIs + trends + breakdowns + actionable follow-ups — wired to the existing design system (`09-design-system.md` + `09a-design-patterns.md`) and grounded in the fresh schema snapshot (plan Phase 8, 2026-04-24).

Principles (user-provided):

1. Focus on 3–5 key business questions per dashboard
2. 1–2 KPIs per question with chart-type recommendation
3. F-pattern layout — KPIs top-left, trends above, breakdowns below
4. Contextual elements — trend arrows, comparison (vs prior period = target), insight text
5. Global filters (date range, AY, status via URL params)
6. ≤8 independent charts per screen (sparklines inside MetricCards don't count)
7. Every widget answers a specific question

---

## Shared design language

### Global filters (every dashboard)

Implemented via existing `components/dashboard/comparison-toolbar.tsx`:

- **AY switcher** — visible on AY-scoped modules (Admissions, Records, P-Files). Hidden on current-AY-only (Markbook, Attendance, Evaluation, SIS).
- **Date range preset** — `last7d · last30d · last90d · thisTerm · lastTerm · thisAY · lastAY · custom`
- **Comparison period** — prior period of equal length (auto-computed), manually overridable
- **Module secondary filters** — URL params only (`?level=P3`, `?status=pending`, `?stage=assessment`) — no dropdown UI

### Comparison model (= "target")

User chose: **prior-period comparison = target**. Delta chip on every KPI reads `±%` or `±pp` vs the equivalent prior period. No stored target schema needed.

### Color semantics (binding per §9.3)

| Signal                  | Token                                                       | Use                            |
| ----------------------- | ----------------------------------------------------------- | ------------------------------ |
| ▲ improvement / healthy | `border-brand-mint bg-brand-mint/30 text-ink`               | Favorable delta vs prior       |
| ▼ regression / alert    | `border-destructive/40 bg-destructive/10 text-destructive`  | Unfavorable delta vs prior     |
| ◆ informational         | `border-brand-indigo-soft bg-accent text-brand-indigo-deep` | Neutral context                |
| — watch / pending       | `border-brand-amber bg-brand-amber-light text-ink`          | Attention needed, not critical |
| Chart fills             | `var(--chart-1..5)` indigo→sky→mint ramp                    | All recharts series            |

### Typography voices (§3.3)

- **Eyebrow:** `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground`
- **Stat value:** `font-serif text-[32px] tabular-nums text-foreground`
- **Chart title:** `font-serif text-xl tracking-tight text-foreground`
- **Body:** `text-[15px] leading-relaxed text-muted-foreground`
- Units always explicit: days / % / pp / students / events

### F-pattern layout (every module)

1. **Row 1 — Hero + filters.** Eyebrow + serif headline + badges (AY, Current/Historical, primary CTA).
2. **Row 2 — InsightsPanel.** 3–5 auto-generated narrative observations in a Card with divided rows, severity-sorted.
3. **Row 3 — 4 MetricCards.** Headline KPIs, dashboard-01 SectionCards pattern (`@container/main` + gradient-subtle cards, serif 32px value, gradient icon tile in `CardAction`, sparkline on card 1 where available).
4. **Row 4 — Primary trend.** Widest chart first, comparison overlay, answers the #1 question.
5. **Row 5 — Secondary trend or comparison.**
6. **Row 6+ — Breakdowns.** Donuts (with inline legend), horizontal bars, stacked bars.
7. **Bottom — ActionList(s) + tables + deep-link Cards.** Navigation and follow-up.
8. **Trust strip.** Mono AY + cache-TTL + audit-logged note.

### Insight text format

Sentence form. Direction verb first. Comparison explicit.

- ✅ "Conversion rose 4.1pp vs prior 30 days — 38.2% this period."
- ❌ "Conversion at 38.2%."

### Chart budget

**≤ 8 independent charts per screen.** Sparklines inside MetricCards don't count (they are single-KPI adornments). Panels like `ExpiringDocumentsPanel` or `TopMissingPanel` are tables, not charts.

### Component vocabulary (no new primitives)

All designs compose from components already built:

- `DashboardHero`, `ComparisonToolbar`, `InsightsPanel`, `ActionList`
- `MetricCard` (with `SparklineChart` inside)
- `TrendChart` (area chart with gradient fill + optional comparison overlay)
- `ComparisonBarChart` (grouped bar, vertical or horizontal)
- `DonutChart` (donut + inline legend with progress bars)
- `StackedAreaChart`, `Heatmap`
- Existing module chart wrappers (already restored to docs in Phase 6)
- shadcn: `Card`, `Badge`, `Button`, `Table`, `Tabs`, `Sheet`, `Dialog`, `Alert`

---

## Module designs

### 1. Admissions — `/admissions`

**Primary operator:** admissions team + registrar + CEO.
**Primary purpose:** pre-enrolment funnel health.

**Business questions:**

1. Is intake healthy? (volume)
2. Are we converting? (rate + speed)
3. Which applicants are stuck? (action)
4. Where are the bottlenecks? (funnel drop-offs)
5. How do we compete? (referral + assessment)

**KPIs**

| #   | KPI                       | Formula                                                                                                           | Direction | Answers |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ------- |
| 1   | Applications in range     | `COUNT(ay{YY}_enrolment_applications WHERE created_at ∈ [from,to])`                                               | ↑ good    | Q1      |
| 2   | Enrolled in range         | `COUNT(*) WHERE applicationStatus ∈ ('Enrolled','Enrolled (Conditional)') AND applicationUpdatedDate ∈ [from,to]` | ↑ good    | Q2      |
| 3   | Conversion rate %         | `enrolled / applications × 100`                                                                                   | ↑ good    | Q2      |
| 4   | Avg time-to-enroll (days) | `AVG(applicationUpdatedDate − created_at) WHERE applicationStatus='Enrolled'`                                     | ↓ good    | Q2      |

KPI 1 carries a 14-day sparkline; 2–4 show delta pp/percent vs prior period.

**Wireframe**

| Row | Section                                                                                   | Chart count     |
| --- | ----------------------------------------------------------------------------------------- | --------------- |
| 1   | Hero + ComparisonToolbar                                                                  | 0               |
| 2   | InsightsPanel (5 rows)                                                                    | 0               |
| 3   | 4 MetricCards (SectionCards grid)                                                         | 0 (1 sparkline) |
| 4   | [2/3] Applications velocity `TrendChart` · [1/3] Follow-up today `ActionList`             | **1**           |
| 5   | [2/3] `ConversionFunnelChart` · [1/3] Time-to-enroll histogram (`ComparisonBarChart`)     | **2**           |
| 6   | [2/3] `PipelineStageChart` · [1/3] `AssessmentOutcomesChart`                              | **2**           |
| 7   | [1/3] `ReferralSourceChart` donut · [1/3] `TimeToEnrollmentCard` · [1/3] Browse QuickLink | **1**           |
| 8   | Static AY counters (4 `SummaryStat`)                                                      | 0               |
| 9   | Full `OutdatedApplicationsTable` (`print:hidden`)                                         | 0               |
| 10  | Trust strip                                                                               | 0               |

**Chart count: 6 ≤ 8 ✅**

**Insight rules (already in `admissionsInsights()`):**

- `conversionPct - conversionPctPrior ≥ 3pp` → good: "Conversion improving · {now}% vs {prior}% prior ({+delta}pp)"
- `appsDelta.pct ≥ 5%` → good: "Applications rising — {N} this period, {+%} vs prior"
- `outdatedCount ≥ 10` → bad: "{N} applicants need follow-up — stages not moved ≥7 days"
- `topReferral.share ≥ 15%` → info: "Top source: {name} · {%}% of intake"
- `biggestFunnelDropOff.pct ≥ 25%` → warn: "Drop-off at {stage} · {%}% of applicants don't advance"

**Filters:** `?ay=AY2026&from=...&to=...&cmpFrom=...&cmpTo=...` (ComparisonToolbar) + optional `?level=P3`.

**Deviation from current code:** none structural. Admissions is 95% aligned already.

---

### 2. Records — `/records`

**Primary operator:** registrar.
**Primary purpose:** enrolled-student operations.

**Business questions:**

1. Is enrollment on pace? (new-student velocity)
2. Are we losing students? (withdrawal velocity)
3. Are documents current? (expiring + backlog)
4. Where are students in the pipeline? (stage breakdown)
5. How are levels distributed? (level donut)

**KPIs**

| #   | KPI                   | Formula                                                                                           | Direction            | Answers |
| --- | --------------------- | ------------------------------------------------------------------------------------------------- | -------------------- | ------- |
| 1   | New enrollments       | `COUNT(section_students WHERE enrollment_status='active' AND enrollment_date ∈ [from,to])`        | ↑ good               | Q1      |
| 2   | Withdrawals           | `COUNT(section_students WHERE enrollment_status='withdrawn' AND withdrawal_date ∈ [from,to])`     | ↓ good (bad-when-up) | Q2      |
| 3   | Active enrolled total | `COUNT(section_students WHERE enrollment_status='active')` (snapshot)                             | ↑ good               | Q1      |
| 4   | Docs expiring ≤60d    | `COUNT(ay{YY}_enrolment_documents WHERE {slot}Expiry ∈ (today, today+60d])` across expiring slots | ↓ good               | Q3      |

KPI 1 carries sparkline.

**Wireframe**

| Row | Section                                                                         | Chart count            |
| --- | ------------------------------------------------------------------------------- | ---------------------- |
| 1   | Hero + ComparisonToolbar                                                        | 0                      |
| 2   | InsightsPanel                                                                   | 0                      |
| 3   | 4 MetricCards                                                                   | 0 (1 spark)            |
| 4   | [1/2] Enrollment velocity `TrendChart` · [1/2] Withdrawal velocity `TrendChart` | **2**                  |
| 5   | Static AY counters (4 `SummaryStat`)                                            | 0                      |
| 6   | Quick-link row (3 `QuickLink`: Students / Discount Codes / Audit Log)           | 0                      |
| 7   | [2/3] `DocumentBacklogChart` · [1/3] `LevelDistributionChart` (donut)           | **2**                  |
| 8   | [2/3] `PipelineStageChart` (horizontal bar) · [1/3] `ExpiringDocumentsPanel`    | **1** (panel is table) |
| 9   | `ActionList` "Documents to collect"                                             | 0                      |
| 10  | `RecentActivityFeed`                                                            | 0                      |
| 11  | Trust strip                                                                     | 0                      |

**Chart count: 5 ≤ 8 ✅**

**Insight rules (extend `recordsInsights()`):**

- `enrollmentDelta.pct ≥ 5%` → good: "{N} new enrollments · {+%} vs prior"
- `withdrawals > withdrawalsPrior × 1.5 AND withdrawalsPrior > 0` → bad: "Withdrawal spike · {N} vs {prior}"
- `expiringSoon ≥ 10` → warn: "{N} documents expire ≤60d — flag for collection via P-Files"
- `activeEnrolled > 0` → info: "{N} active enrolled across all sections"

**Filters:** AY + date range; optional `?level=P3` to narrow doc-backlog and level donut.

**Deviation from current code:** withdrawal velocity card is new (helper `getWithdrawalVelocityRange` landed this session).

---

### 3. P-Files — `/p-files`

**Primary operator:** P-Files officer.
**Primary purpose:** document repository — upload health + validation backlog.

**Business questions:**

1. Are we keeping up with uploads? (revision velocity)
2. What's expiring? (expiring panel)
3. What's pending review? (pending KPI)
4. Where are the gaps by level? (completion-by-level)
5. Which slots are problem children? (top missing)

**KPIs**

| #   | KPI                | Formula                                                               | Direction            | Answers |
| --- | ------------------ | --------------------------------------------------------------------- | -------------------- | ------- |
| 1   | Revisions in range | `COUNT(p_file_revisions WHERE ay_code=? AND replaced_at ∈ [from,to])` | ↑ info               | Q1      |
| 2   | Expiring ≤60d      | From `{slot}Expiry` cols on `ay{YY}_enrolment_documents`              | ↓ good               | Q2      |
| 3   | Pending review     | `COUNT(*) WHERE {slot}Status = 'Uploaded'`                            | ↓ good (bad-when-up) | Q3      |
| 4   | Total docs tracked | `COUNT(*) WHERE {slot}Status IS NOT NULL`                             | ↑ info               | context |

KPI 1 carries sparkline.

**Wireframe**

| Row | Section                                                                                        | Chart count |
| --- | ---------------------------------------------------------------------------------------------- | ----------- |
| 1   | Hero + ComparisonToolbar                                                                       | 0           |
| 2   | InsightsPanel                                                                                  | 0           |
| 3   | 4 MetricCards                                                                                  | 0 (1 spark) |
| 4   | All-time `SummaryCards` (4 cards: Total students / Fully complete / Has expired / Has missing) | 0           |
| 5   | `ActionList` "Documents to collect"                                                            | 0           |
| 6   | `RevisionsOverTimeChart` (TrendChart, wide)                                                    | **1**       |
| 7   | [2/3] `CompletionByLevelChart` · [1/3] Slot status donut (`DonutChart`)                        | **2**       |
| 8   | [1/2] `TopMissingPanel` · [1/2] `ExpiringDocumentsPanel`                                       | 0 (panels)  |
| 9   | Legend strip (on file / pending / expired / missing)                                           | 0           |
| 10  | Full `CompletenessTable`                                                                       | 0           |
| 11  | Trust strip                                                                                    | 0           |

**Chart count: 3 ≤ 8 ✅**

**Insight rules (`pfilesInsights()`):**

- `expiringSoon ≥ 10` → bad: "{N} documents expire ≤60d — contact families for renewal"
- `pendingReview ≥ 15` → warn: "{N} docs pending admissions review"
- `revisionsDelta.pct ≥ 20%` → info: "Upload volume {up/down} · {N} revisions · {+%} vs prior"
- `completionPct ≥ 90` → good: "Validation on track · {%}% of {N} tracked docs validated"
- `completionPct < 75 AND pendingReview > 0` → warn: "Validation coverage low — {%}% validated"

**Filters:** AY + date range; optional `?status=expired|missing|uploaded|complete` narrows the CompletenessTable.

**Deviation from current code:** none structural. Row order (Action list above velocity) matches P-Files officer workflow — see the action queue first, then the trend context.

---

### 4. Markbook — `/markbook`

**Primary operator:** registrar + school_admin. Teachers redirect to `/markbook/grading`.
**Primary purpose:** grading + report-card publishing health.

**Business questions:**

1. Is grade entry on track? (entry velocity)
2. Are sheets locking on schedule? (lock progress)
3. Is the approval pipeline fast? (change-request SLA)
4. Are grades healthy? (mastery distribution)
5. Are report cards published on schedule? (publication coverage)

**KPIs**

| #   | KPI                     | Formula                                                                      | Direction            | Answers |
| --- | ----------------------- | ---------------------------------------------------------------------------- | -------------------- | ------- |
| 1   | Grades entered in range | `COUNT(grade_entries WHERE created_at ∈ [from,to])`                          | ↑ good               | Q1      |
| 2   | Sheets locked in range  | `COUNT(grading_sheets WHERE is_locked AND locked_at ∈ [from,to])`            | ↑ good               | Q2      |
| 3   | Change requests pending | `COUNT(grade_change_requests WHERE status='pending')`                        | ↓ good (bad-when-up) | Q3      |
| 4   | Avg decision (hours)    | `AVG(reviewed_at − requested_at) WHERE status ∈ (approved,rejected,applied)` | ↓ good               | Q3      |

KPI 1 carries sparkline.

**Wireframe**

| Row | Section                                                                                         | Chart count |
| --- | ----------------------------------------------------------------------------------------------- | ----------- |
| 1   | Hero + ComparisonToolbar (no AY switcher, current AY only)                                      | 0           |
| 2   | InsightsPanel                                                                                   | 0           |
| 3   | 4 MetricCards                                                                                   | 0 (1 spark) |
| 4   | [1/2] Grade entry velocity `TrendChart` · [1/2] Change-request velocity `TrendChart`            | **2**       |
| 5   | Static AY counters (4 `StatCard`: Students / Sheets / Locked% / Publications)                   | 0           |
| 6   | [2/3] `GradeDistributionChart` · [1/3] `SheetProgressChart`                                     | **2**       |
| 7   | [1/2] `ChangeRequestPanel` (has mini-bars, count as 1 chart) · [1/2] `PublicationCoverageChart` | **2**       |
| 8   | `RecentMarkbookActivity`                                                                        | 0           |
| 9   | Admin tools row (3 `QuickLinkCard`: Sync / Sections / Audit log)                                | 0           |
| 10  | Jump back in (2 `QuickLinkCard`: Grading / Report Cards)                                        | 0           |
| 11  | Trust strip                                                                                     | 0           |

**Chart count: 6 ≤ 8 ✅**

**Insight rules (`markbookInsights()`):**

- `changeRequestsPending ≥ 5` → bad: "{N} change requests pending — avg decision {X}h"
- `lockedPct ≥ 90` → good: "Sheets nearly all locked · {%}% of {N} sheets finalized"
- `lockedPct < 50 AND sheetsTotal > 0` → warn: "Locking behind · only {%}% of {N} sheets locked"
- `gradesDelta.pct ≥ 15%` → info: "Entry velocity {up/down} · {N} grades · {+%} vs prior"

**Filters:** date range only (current AY locked). Optional `?term=1..4`.

**Deviation from current code:** current page already matches; row order minor tweak (velocity above static counters, not below).

---

### 5. Attendance — `/attendance`

**Primary operator:** registrar + school_admin. Teachers redirect to `/attendance/sections`.
**Primary purpose:** daily attendance analytics; sole writer per KD #47.

**Business questions:**

1. Is attendance rate healthy? (rate vs prior; "high attendance" threshold ≥95%)
2. Why are students out? (EX reason breakdown)
3. Who needs attention? (top-absent)
4. What was the calendar mix? (day-type)

**KPIs**

| #   | KPI               | Formula                                                              | Direction            | Answers |
| --- | ----------------- | -------------------------------------------------------------------- | -------------------- | ------- |
| 1   | Attendance rate % | `(present + late + excused) / encoded × 100` from `attendance_daily` | ↑ good               | Q1      |
| 2   | Late incidents    | `COUNT WHERE status='L' AND date ∈ [from,to]`                        | ↓ good (bad-when-up) | Q1      |
| 3   | Excused           | `COUNT WHERE status='EX'`                                            | ◆ info               | Q2      |
| 4   | Absences          | `COUNT WHERE status='A'`                                             | ↓ good (bad-when-up) | Q1      |

KPI 1 carries sparkline.

**Wireframe**

| Row | Section                                                     | Chart count |
| --- | ----------------------------------------------------------- | ----------- |
| 1   | Hero + "Mark attendance" primary CTA + ComparisonToolbar    | 0           |
| 2   | InsightsPanel                                               | 0           |
| 3   | 4 MetricCards                                               | 0 (1 spark) |
| 4   | Daily attendance % `TrendChart` (wide, `yFormat="percent"`) | **1**       |
| 5   | [1/2] EX reason `DonutChart` · [1/2] Day-type `DonutChart`  | **2**       |
| 6   | Top-absent students table (shadcn `Table`, ≤10 rows)        | 0           |
| 7   | Trust strip                                                 | 0           |

**Chart count: 3 ≤ 8 ✅**

**Insight rules (`attendanceInsights()`):**

- `attendancePct ≥ 95` → good: "High attendance · {%}% over {N} encoded days"
- `attendancePct − attendancePctPrior ≤ -1pp` → `bad if <90% else warn`: "Attendance dropping · {%}% vs {prior}% prior"
- `absent > absentPrior × 1.5 AND absentPrior > 0` → bad: "Absence spike · {N} vs {prior} prior"
- `late > latePrior × 1.5 AND latePrior > 0` → warn: "Late incidents up · {N} lates vs {prior}"
- `encodedDays == 0` → info: "No attendance data — pick a range covering school days"

**Filters:** date range only (current AY). Optional `?section={id}` to narrow to one section.

**Deviation from current code:** none. Attendance dashboard is already structured this way.

---

### 6. Evaluation — `/evaluation`

**Primary operator:** registrar (oversight) + advisers (submit).
**Primary purpose:** form-class-adviser write-up tracking (T1–T3 only; KD #49).

**Business questions:**

1. Are advisers submitting? (submission rate; "on track" threshold ≥80%, "behind" <50%)
2. Who's behind? (late submissions count)
3. How long does review take? (median time-to-submit)
4. Is pace on track? (submission velocity vs `lastTerm`)

**KPIs**

| #   | KPI                       | Formula                                                                | Direction            | Answers |
| --- | ------------------------- | ---------------------------------------------------------------------- | -------------------- | ------- |
| 1   | Submission %              | `submitted / expected × 100`, where expected = `students × {T1,T2,T3}` | ↑ good               | Q1      |
| 2   | Submitted (of expected)   | `{submitted} of {expected}`                                            | ↑ good               | Q1/Q2   |
| 3   | Median time-to-submit (d) | `median(submitted_at − created_at) WHERE submitted`                    | ↓ good               | Q3      |
| 4   | Late submissions (>14d)   | `COUNT WHERE submitted AND submitted_at − created_at > 14 days`        | ↓ good (bad-when-up) | Q2      |

KPI 1 carries sparkline.

**Wireframe (intentionally thin — existing hub cards and TermOpenToggle row remain below)**

| Row | Section                                                          | Chart count |
| --- | ---------------------------------------------------------------- | ----------- |
| 1   | Hero + ComparisonToolbar (no AY switcher)                        | 0           |
| 2   | InsightsPanel                                                    | 0           |
| 3   | 4 MetricCards                                                    | 0 (1 spark) |
| 4   | Writeup submissions `TrendChart` (comparison = `lastTerm`)       | **1**       |
| 5   | Existing hub cards (2 `HubCard`: My sections / Virtue theme)     | 0           |
| 6   | Existing evaluation window strip (3 terms with `TermOpenToggle`) | 0           |
| 7   | Trust strip                                                      | 0           |

**Chart count: 1 ≤ 8 ✅** (intentionally minimal — this is a hub + thin analytics band)

**Insight rules (`evaluationInsights()`):**

- `submissionPct ≥ 90 AND expected > 0` → good: "Submissions on track · {%}% of {N} expected"
- `submissionPct < 50 AND expected > 0` → bad: "Submissions behind · only {%}% of {N} expected"
- `lateSubmissions ≥ 5` → warn: "{N} late submissions (>14 days after term opened)"
- `Δ medianTimeToSubmit ≥ 2d` → info/warn: "{Slower/Faster} turnaround · {X}d median vs {Y}d prior"

**Filters:** date range (within current AY). No term-dropdown — presets `thisTerm` / `lastTerm` cover it.

**Deviation from current code:** none structural.

---

### 7. SIS Admin — `/sis`

**Primary operator:** superadmin + admin.
**Primary purpose:** system config hub + light activity visibility. **Intentionally thin** — this page is mostly navigation, not analytics.

**Business questions:**

1. Is the system active? (audit event trend)
2. Which module is most active? (module breakdown)
3. Are setup tasks complete? (admin card navigation — not a metric)

**KPIs**

| #   | KPI                      | Formula                                                     | Direction | Answers |
| --- | ------------------------ | ----------------------------------------------------------- | --------- | ------- |
| 1   | Audit events             | `COUNT(audit_log WHERE created_at ∈ [from,to])`             | ◆ info    | Q1      |
| 2   | Most-active module       | `argmax(count) by action prefix` (e.g., "Markbook — entry") | ◆ info    | Q2      |
| 3   | Prior period total       | `COUNT(audit_log WHERE created_at ∈ [cmpFrom,cmpTo])`       | context   | Q1      |
| 4   | Active modules / tracked | `COUNT(modules WHERE count>0) / 6` (6 tracked prefixes)     | context   | Q2      |

KPI 1 carries sparkline.

**Wireframe**

| Row | Section                                                                      | Chart count |
| --- | ---------------------------------------------------------------------------- | ----------- |
| 1   | Hero                                                                         | 0           |
| 2   | `SystemHealthStrip` (superadmin only)                                        | 0           |
| 3   | ComparisonToolbar (no AY switcher)                                           | 0           |
| 4   | InsightsPanel                                                                | 0           |
| 5   | 4 MetricCards                                                                | 0 (1 spark) |
| 6   | Audit activity by module `ComparisonBarChart` (horizontal, current vs prior) | **1**       |
| 7   | Admin card grid (3 groups: Academic Year · Organisation · Access · Related)  | 0           |
| 8   | Trust strip                                                                  | 0           |

**Chart count: 1 ≤ 8 ✅**

**Insight rules (`sisInsights()`):**

- `Δ auditEvents ≥ 25%` → info/warn: "System activity {up/down} · {N} events · {+%} vs prior"
- `topModule.share ≥ 40%` → info: "{Module} dominates · {%}% of all audit events"
- `activeModules < trackedModules AND (trackedModules − activeModules) ≥ 2` → info: "{N} modules quiet in range"
- `auditEvents == 0` → info: "No audit activity in range — pick a broader range"

**Filters:** date range only. No AY switcher.

**Deviation from current code:** none structural.

---

## Implementation roadmap

### Phase A — Verify (no code, just audit)

1. Grep every `lib/<module>/dashboard.ts` helper — confirm column names match Phase 8 schema snapshot. Flag any drift (e.g., `report_card_comments` references — that table was dropped in mig 024).
2. Grep every dashboard page — confirm section order matches the wireframes above.
3. Grep every chart wrapper — confirm serif titles + gradient `CardAction` icon tiles per §8.

### Phase B — Fill gaps (code)

Per module, add any missing helpers enumerated in Phase 8's "Schema-driven opportunities" if the KPI/chart needs them. Each follows KD #46 cache-wrapper pattern (hoist `load*Uncached`, wrap `unstable_cache` per-call with per-AY tags).

Priority order: Admissions has zero gaps · Records needs `getWithdrawalVelocityRange` (done) · P-Files/Markbook/Attendance need nothing for the above designs · Evaluation uses existing velocity · SIS uses existing audit-by-module.

### Phase C — Insight rules

Each module's generator in `lib/dashboard/insights.ts` already implements the rules above. Verify thresholds match this spec (severity boundaries + copy template).

### Phase D — Verification

1. `npx next build` clean across all 79 routes.
2. Per dashboard, open with no query params and confirm:
   - Hero renders serif 38–44px headline
   - InsightsPanel shows 3–5 narrative observations
   - 4 MetricCards render with deltas + (KPI 1) sparkline
   - Chart count ≤ 8 (sparklines excluded)
   - All widgets can be mapped to one of the business questions
3. Apply each preset (`last7d → lastAY`) and verify deltas flip sign correctly.
4. Browser-print Admissions + Records — confirm one-page exec-summary layout via `print:hidden` classes.

### Phase E — Docs

Update `docs/context/20-dashboards.md` (exists per plan) with pointer to this spec.

---

## Open items

1. **`?level=P3` URL filter** is proposed for Admissions + Records but not yet implemented in dashboard pages. Either add now or defer.
2. **`?status=…` URL filter** already works on P-Files (`CompletenessTable` consumes `initialStatusFilter`). Records + Admissions could adopt.
3. **Historical AY dashboards** — `/records?ay=AY2025` should return historical-only counters (withdrawal since cohort graduated, etc.). Current code handles via `isCurrentAy` branch; verify insight text adapts ("Historical AY · no velocity comparison available").
4. **Teacher dashboard subset** — teachers see Markbook's `/markbook/grading` list, not the main dashboard. Confirm this is still the intended workflow (it is per KD #43).
5. **Print-preview CEO exec summary** — current `print:hidden` placement on Admissions' full outdated table is the only print cleanup done. Records + P-Files would benefit from the same.

---

## Changes-from-current inventory

| Module     | What changes                                                                      | New helpers needed                  |
| ---------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| Admissions | None structural — 95% aligned. Remove stray `CardHeader className="pb-3"` if any. | 0                                   |
| Records    | Withdrawal velocity chart added (done this session).                              | `getWithdrawalVelocityRange` (done) |
| P-Files    | None structural. Maybe move ActionList above velocity to match workflow.          | 0                                   |
| Markbook   | None structural.                                                                  | 0                                   |
| Attendance | None structural.                                                                  | 0                                   |
| Evaluation | None structural.                                                                  | 0                                   |
| SIS        | None structural.                                                                  | 0                                   |

Net: the "full comprehensive dashboard" is already 95%+ built. This spec locks the pattern + formalizes insight rules + documents the F-pattern for future modules.
