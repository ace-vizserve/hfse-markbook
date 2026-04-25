# Admissions drill-downs — design

**Date:** 2026-04-25
**Branch:** `feat/dashboard-drilldowns`
**Status:** Spec — implementation pending
**Predecessor:** Tasks 1+2 of the drill-down pilot already shipped (`MetricCard.drillSheet` slot + `DrillDownSheet` shell + `lib/csv.ts` BOM fix). This spec is **Task 3** — wiring the Admissions module end-to-end.

---

## 1. Goal

Convert the Admissions dashboard from a read-only display into a **highly interactive analytics surface** where every aggregating element (KPI tile, chart segment, list row) can be clicked to drill into the underlying applicants — with a uniform toolkit of filters, toggles, and CSV export.

This is the pilot module. The pattern proven here is replicated to Markbook / Attendance / Evaluation in follow-up sprints.

## 2. Scope

Every aggregating surface on `/admissions` becomes a drill trigger. Twelve drill targets:

| # | Surface | Click target | Drill content |
|---|---|---|---|
| 1 | MetricCard: Applications (range) | Whole card | Apps created in range |
| 2 | MetricCard: Enrolled (range) | Whole card | Apps that enrolled in range |
| 3 | MetricCard: Conversion rate | Whole card | Apps in range with `enrolled? Y/N` flag + days-to-enroll |
| 4 | MetricCard: Avg time to enroll | Whole card | Apps enrolled in range with days-to-enroll |
| 5 | Conversion Funnel | Each stage bar | Apps reaching that stage |
| 6 | Time-to-enroll histogram | Each bucket bar | Apps in that bucket |
| 7 | Pipeline Stage | Each stage bar | Apps currently at that stage |
| 8 | Assessment Outcomes | Each outcome bar | Apps with that outcome |
| 9 | Referral Source | Each source row | Apps from that source |
| 10 | Outdated Applications (existing list) | Already row-level — gets the new toolkit + CSV |
| 11 | **NEW** — Applications by level | Each level bar | Apps in that level |
| 12 | **NEW** — Document completion by level | Each level row | Apps in that level with doc-completeness flag |

Targets 11 + 12 close out the deferred backlog items `getApplicationsByLevelRange` + `getDocumentCompletionByLevel`.

**Out of scope:** virtualization (datasets are bounded), URL-persistent drill state (the dashboard's own `?ay=&from=&to=` already covers shareable views), XLSX export (CSV+BOM handles Excel-on-Windows), saved filter presets.

## 3. Universal drill toolkit

Every drill sheet exposes the same control bar — extending today's `DrillDownSheet`:

| Control | Type | Behavior |
|---|---|---|
| Search | `Input` (text) | Free-text fuzzy across name, enroleeNumber, studentNumber. Local state. |
| Range scope | `Tabs variant="segmented"` | `This range` (default — uses dashboard `?from=&to=`) · `Current AY` · `All time`. Triggers refetch. |
| Status | Multi-select chip toolbar | Inquiry · Applied · Interviewed · Offered · Accepted · Enrolled · Withdrawn. Local state. |
| Level | Multi-select chip toolbar | P1..P6 · S1..S4. Local state. |
| Group by | `Tabs variant="segmented"` | `None` (default) · `Level` · `Status` · `Stage`. Re-renders the table with grouped sections. |
| Density | Toggle button | `Comfortable` (default) / `Compact` (`py-2` → `py-1`). Local state. |
| Columns | `DropdownMenu` w/ checkboxes | Shows/hides each column. Local state. Default visible set is per-target. |
| Sort | Already on `<TableHead>` | Existing — no change. |
| CSV export | Button | Downloads currently filtered + sorted + visible-only rows. UTF-8 BOM via `lib/csv.ts`. |

**Filter persistence:** Drill-local React state. Closing sheet resets all controls. Reasoning: URL bloat, dashboard already URL-persistent at the section level.

## 4. Data + API

### 4.1 Unified row shape

```ts
// lib/admissions/drill.ts
export type DrillRow = {
  enroleeNumber: string;
  studentNumber: string | null;
  fullName: string;
  status: string;            // applicationStatus
  level: string | null;       // classLevel preferred, falls back to levelApplied
  stage: string | null;       // current pipeline stage (rightmost *UpdatedDate)
  referralSource: string | null;
  assessmentOutcome: string | null;
  applicationDate: string;
  enrollmentDate: string | null;
  daysToEnroll: number | null;
  daysSinceUpdate: number | null;
  hasMissingDocs: boolean;
};
```

One shape per row → every drill differs only by which rows it pre-filters and which columns it surfaces by default.

### 4.2 API

`GET /api/admissions/drill/[target]?ay=&from=&to=&scope=range|ay|all&segment=<value>&format=json|csv`

**Targets:** `applications` · `enrolled` · `funnel-stage` · `pipeline-stage` · `referral` · `assessment` · `time-to-enroll-bucket` · `applications-by-level` · `doc-completion` · `outdated`.

**Auth:** `requireRole('admissions', 'registrar', 'school_admin', 'admin', 'superadmin')`.

**Cache:** Each call wraps the underlying loader in `unstable_cache(['admissions:drill', ayCode, scope, target, segment])`, 60s TTL — drill consumption is interactive but not realtime, and the dashboard-level cache is already 10m.

**Format:** `?format=json` (default) returns `{ rows: DrillRow[], total: number, target, segment }`; `?format=csv` returns `text/csv` with UTF-8 BOM + filename `drill-admissions-<target>-<YYYY-MM-DD>.csv`.

**Segment param:** required for chart-segment drills (e.g., `?target=funnel-stage&segment=interviewed`); ignored for whole-card drills.

### 4.3 Library

**New file `lib/admissions/drill.ts`:**
- `DrillRow` type
- `buildDrillRows(client, { ayCode, scope })` — one fetch, returns `DrillRow[]` enriched with stage + days
- `applyTargetFilter(rows, target, segment?)` — narrows the row set per target
- `defaultColumnsForTarget(target)` — returns the default visible-column array

**Extended `lib/admissions/dashboard.ts`:**
- `getApplicationsByLevelRange(rangeInput)` — array of `{ level, count }` per range (closes deferred item)
- `getDocumentCompletionByLevel(ayCode)` — array of `{ level, complete, partial, missing }` (closes deferred item)

## 5. UI architecture

```
/admissions page
  ├── 4 MetricCards
  │     drillSheet={<AdmissionsDrillSheet target={target} ... />}
  ├── ConversionFunnel Card
  │     wrapped in <Sheet open={openStage} onOpenChange={...}>
  │       segments → setOpenStage(stage)
  │       <SheetContent>: <AdmissionsDrillSheet target="funnel-stage" segment={openStage} />
  ├── PipelineStage Card     (same pattern)
  ├── AssessmentOutcomes Card (same pattern)
  ├── ReferralSource Card     (same pattern; rows clickable)
  ├── TimeToEnroll histogram  (same pattern; bucket-clickable)
  ├── NEW: ApplicationsByLevel Card (new card, same pattern)
  ├── NEW: DocCompletion Card       (new card, same pattern)
  └── OutdatedApplications table — toolkit-aligned, in-place
```

`AdmissionsDrillSheet` is a single component. The `target` prop drives:
- which columns to render (`defaultColumnsForTarget`)
- which filters are visible (e.g., the Stage filter is hidden on stage-specific drills)
- which CSV endpoint variant to hit
- the eyebrow + title text

This collapses 12 would-be drill components to one.

## 6. Chart-segment click handlers

Recharts charts gain `onClick` on the relevant element:

| Chart | Element | Recharts API |
|---|---|---|
| `ConversionFunnelChart` | `<Bar onClick={(data) => onSegmentClick(data.stage)}>` | `<Bar onClick>` |
| `PipelineStageChart` | `<Bar onClick>` | same |
| `AssessmentOutcomesChart` | `<Bar onClick>` | same |
| `ReferralSourceChart` | row `<button onClick>` (rows are already JSX, not recharts) | inline |
| Time-to-enroll histogram (uses `ComparisonBarChart`) | `<Bar onClick>` | extend `ComparisonBarChart` with `onSegmentClick?: (category: string) => void` |
| ApplicationsByLevel (new) | `<Bar onClick>` | same as ComparisonBarChart |
| DocumentCompletionByLevel (new) | row `<button onClick>` | inline |

The card shell hosts the `<Sheet>`. Pattern:

```tsx
const [activeSegment, setActiveSegment] = useState<string | null>(null);
return (
  <Sheet open={!!activeSegment} onOpenChange={(o) => !o && setActiveSegment(null)}>
    <Card>...
      <Chart onSegmentClick={setActiveSegment} />
    </Card>
    {activeSegment && (
      <AdmissionsDrillSheet target="funnel-stage" segment={activeSegment} />
    )}
  </Sheet>
);
```

The card itself is **not** a `<SheetTrigger>` — only the chart segments are. Click on whitespace = no drill.

## 7. CSV column spec

Default visible columns per target (Columns dropdown can toggle others on):

| Target | Default visible |
|---|---|
| `applications` | EnroleeNo · Name · Status · Level · App Date · Days Since Update |
| `enrolled` | EnroleeNo · Name · Level · App Date · Enroll Date · Days to Enroll |
| `funnel-stage` | EnroleeNo · Name · Stage · Level · Days at Stage · Days Since Update |
| `pipeline-stage` | EnroleeNo · Name · Stage · Level · Days at Stage |
| `referral` | EnroleeNo · Name · Source · Status · Level · App Date |
| `assessment` | EnroleeNo · Name · Outcome · Level · Assessment Date |
| `time-to-enroll-bucket` | EnroleeNo · Name · Level · App Date · Enroll Date · Days to Enroll |
| `applications-by-level` | EnroleeNo · Name · Status · Level · App Date |
| `doc-completion` | EnroleeNo · Name · Level · Missing Docs? · Days Since Update |
| `outdated` | EnroleeNo · Name · Status · Level · Days Since Update |

Hidden-by-default columns available for any drill: StudentNumber · Enrollment Date · Referral Source · Assessment Outcome · Days to Enroll. Toggle via Columns dropdown.

## 8. Hard rules + KD compliance

- **Hard Rule #4** — `studentNumber` is the only stable cross-year ID. Drill rows include `studentNumber` for cross-module linking; no `enroleeNumber` linking across AYs.
- **Hard Rule #7** — Aurora Vault tokens only. Multi-select chips reuse `Badge` primitive variants (`success` for selected, `outline` for unselected).
- **KD #20** — RHF + zod for forms. Drill toolkit is **not** a form (no submit semantics) — uses raw React state. Fits the rule.
- **KD #24** — Raw fetch + `toast.error`, no React Query. **Data flow:** the page (Server Component) fetches the unified `DrillRow[]` once via `buildDrillRows()` and passes it as a prop to every drill sheet. All 12 drills filter that shared row set client-side — no per-drill network call, no loading states. Range-scope toggle (`This range` / `Current AY` / `All time`) does trigger a client-side `fetch('/api/admissions/drill/...')` because it changes the dataset; otherwise interactions are pure local-state. CSV download goes via the API endpoint (so the server can stream and apply identical filtering).
- **KD #44** — DatePicker primitive for date inputs. **Not relevant** — drill toolkit has no date inputs (range scope is a 3-state Tab).
- **KD #46** — Cache wrapper pattern. New helpers use the `loadXxxUncached` + per-call `unstable_cache` shape.
- **KD #54** — Dashboard framework. Drill components live under `components/dashboard/*` (shell) + `components/admissions/drills/*` (admissions-specific wrapper).

## 9. Files to touch

### New
- `lib/admissions/drill.ts` — `DrillRow`, `buildDrillRows`, `applyTargetFilter`, `defaultColumnsForTarget`
- `app/api/admissions/drill/[target]/route.ts` — unified GET endpoint
- `components/admissions/drills/admissions-drill-sheet.tsx` — single target-aware sheet body
- `components/admissions/applications-by-level-card.tsx` — new chart card w/ drill
- `components/admissions/document-completion-card.tsx` — new chart card w/ drill

### Extended
- `components/dashboard/drill-down-sheet.tsx` — adds toolkit (status multi-select, level multi-select, range-scope, group-by, density, column-visibility); existing filename props retained
- `components/dashboard/charts/comparison-bar-chart.tsx` — adds optional `onSegmentClick(category: string)`
- `components/admissions/conversion-funnel-chart.tsx` — adds `onSegmentClick`
- `components/admissions/assessment-outcomes-chart.tsx` — adds `onSegmentClick`
- `components/admissions/referral-source-chart.tsx` — adds `onSegmentClick`
- `components/sis/pipeline-stage-chart.tsx` — adds `onSegmentClick`
- `components/admissions/outdated-applications-table.tsx` — adopts new toolkit + CSV button
- `app/(admissions)/admissions/page.tsx` — wires drill slots
- `lib/admissions/dashboard.ts` — adds `getApplicationsByLevelRange` + `getDocumentCompletionByLevel`

## 10. Build sequence

1. **Foundation** — extend `DrillDownSheet` with the universal toolkit; build `lib/admissions/drill.ts`; build `/api/admissions/drill/[target]` endpoint.
2. **Single-component drill** — build `AdmissionsDrillSheet` with target-driven column/filter/CSV logic.
3. **MetricCard wiring** — wire 4 cards to the drill sheet.
4. **Chart-segment click pattern** — extend `ComparisonBarChart` with `onSegmentClick`; wrap chart cards in `Sheet`; hook up funnel + pipeline + assessment + referral + histogram.
5. **New cards** — build `ApplicationsByLevelCard` + `DocumentCompletionCard` with their own drill targets.
6. **Outdated table cleanup** — adopt toolkit + CSV button on the existing outdated table.
7. **Verify** — `npx next build`, manual happy-path on every drill, CSV downloads correct in Excel-on-Windows.

## 11. What I won't do

- Add React Query or SWR (KD #24).
- Add a date-range picker INSIDE the drill (range-scope Tabs is enough).
- Virtualize the table.
- Persist drill filter state in the URL.
- Add XLSX export.
- Touch other modules' dashboards (this is the Admissions pilot).
