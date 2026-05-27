# Drill perf — Phases A + B + D design spec

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation planning
**Companion plan:** `docs/superpowers/plans/2026-05-06-drill-perf-phases-a-b-d.md` (to be written by `superpowers:writing-plans`)

---

## 1. Goal

Continue the drill-perf initiative beyond Phase C (UI virtualization + transitions, shipped 2026-05-06 in commits `87e1506` / `5fb2c75` / `88da646`). Phase A/B/D harden three independent layers:

- **A** — browser cache for drill API responses
- **B** — write-then-read freshness (replace 60s lag with immediate consistency)
- **D** — JS bundle size + RSC payload size + drill-sheet UX simplification

**Non-goal:** the 9.1s cold-render of `/attendance` (and similar across modules) is **out of scope**. That's an SSR loader-path problem; A/B/D do not move that needle. A separate diagnostic + fix is needed for cold-render and is tracked separately.

## 2. Context — what shipped in Phase C

- `<DrillDownSheet>` virtualized via `@tanstack/react-virtual` spacer-row pattern
- All 6 module drill wrappers wrap `setRows` in `startTransition`
- `useDeferredValue` on filter input
- `React.memo` sweep on chart primitives
- Commit `88da646` moved `unstable_cache` from raw-row loaders (>2MB silent failure) to rolled-up output loaders in markbook + attendance — this is the "server cache outputs" item from the original Phase A wording, **already done**.

What remained from the CLAUDE.md sketch and is addressed here:

- Phase A's `Cache-Control` headers on `/api/<module>/drill/[target]` routes
- Phase B's mutation invalidation
- Phase D's bundle splitting + `<MetricCard>` refactor
- Phase D.iii (new this design) — remove the dual-source-of-truth in-drill scope toggle

## 3. Phase A — browser cache for drill API responses

### 3.1 Change

Each `app/api/<module>/drill/[target]/route.ts` (markbook, attendance, evaluation, admissions, records, p-files; sis if present) sets:

```
Cache-Control: private, max-age=60, stale-while-revalidate=300
```

on the `NextResponse` for JSON responses only. CSV exports (`Accept: text/csv` or explicit `?format=csv`) skip the header — one-shot downloads.

### 3.2 Rationale

- Today: every drill open re-hits the route handler even within the same session; the route handler is fast (server `unstable_cache` hit) but adds ~50-100ms of network + auth + handler overhead per open.
- After: same drill re-opened within 60s skips the network entirely (`(memory cache)` in devtools).
- `private` excludes shared caches/CDNs because drill responses contain teacher-row-scoped data (per `requireRole(...)` + email row-filtering in `lib/auth/teacher-emails.ts`).
- 60s `max-age` mirrors the server-side `unstable_cache` 60s revalidate — the browser cache contract aligns exactly with the server cache contract.
- 300s `stale-while-revalidate` means a stale response can be served instantly for up to 5 minutes after expiry while a background refetch happens.

### 3.3 Files

```
app/api/markbook/drill/[target]/route.ts
app/api/attendance/drill/[target]/route.ts
app/api/evaluation/drill/[target]/route.ts
app/api/admissions/drill/[target]/route.ts
app/api/records/drill/[target]/route.ts
app/api/p-files/drill/[target]/route.ts
app/api/sis/drill/[target]/route.ts        # if present
```

### 3.4 Out of scope

- Per-target cache tuning. Uniform value for all targets keeps the contract obvious.
- Service worker drill caching. Not justified for the volume.

## 4. Phase B — mutation → tag invalidation

### 4.1 Helper

New file `lib/cache/invalidate-drill-tags.ts`:

```ts
import { revalidateTag } from 'next/cache';

export type DrillModule =
  | 'markbook'
  | 'attendance'
  | 'evaluation'
  | 'admissions'
  | 'records'
  | 'p-files';

/**
 * Invalidates the per-AY drill cache tag for a single module. Call after
 * any DB mutation that affects rolled-up dashboard data, before returning
 * the response. The next read rebuilds the cache from fresh DB state.
 *
 * Cross-cutting mutations (e.g. POST /api/sections/[id]/students) call
 * this multiple times — once per affected module.
 */
export function invalidateDrillTags(module: DrillModule, ayCode: string): void {
  revalidateTag(`${module}-drill:${ayCode}`);
}
```

### 4.2 Mutation route audit

Apply `invalidateDrillTags(<module>, ayCode)` after the DB write succeeds in every mutation route below. The `ayCode` is already resolved in each route's existing logic (most via the section/student/AY context). Cross-module mutations call the helper for each affected module.

| Route file                                                              | Module(s) to invalidate                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/api/grading-sheets/route.ts` (POST)                                | markbook                                                                                |
| `app/api/grading-sheets/[id]/route.ts` (PATCH/DELETE)                   | markbook                                                                                |
| `app/api/grading-sheets/[id]/lock/route.ts` (PATCH)                     | markbook                                                                                |
| `app/api/grading-sheets/[id]/unlock/route.ts` (PATCH)                   | markbook                                                                                |
| `app/api/grading-sheets/[id]/entries/[entryId]/route.ts` (PATCH)        | markbook                                                                                |
| `app/api/grading-sheets/[id]/totals/route.ts` (PATCH)                   | markbook                                                                                |
| `app/api/change-requests/route.ts` (POST)                               | markbook                                                                                |
| `app/api/change-requests/[id]/route.ts` (PATCH/DELETE)                  | markbook                                                                                |
| `app/api/report-card-publications/route.ts` (POST)                      | markbook                                                                                |
| `app/api/report-card-publications/[id]/route.ts` (PATCH/DELETE)         | markbook                                                                                |
| `app/api/attendance/daily/route.ts` (PATCH)                             | attendance                                                                              |
| `app/api/attendance/calendar/route.ts` (POST)                           | attendance                                                                              |
| `app/api/attendance/calendar/events/route.ts` (POST)                    | attendance                                                                              |
| `app/api/attendance/calendar/copy-from-prior-ay/route.ts` (POST)        | attendance                                                                              |
| `app/api/evaluation/writeups/route.ts` (POST/PATCH)                     | evaluation                                                                              |
| `app/api/sections/[id]/students/route.ts` (POST)                        | markbook + attendance + evaluation + records + p-files                                  |
| `app/api/sections/[id]/students/[enrolmentId]/route.ts` (PATCH/DELETE)  | markbook + attendance + evaluation + records + p-files                                  |
| `app/api/p-files/[enroleeNumber]/revisions/route.ts` (POST)             | p-files                                                                                 |
| `app/api/p-files/[enroleeNumber]/upload/route.ts` (POST)                | p-files                                                                                 |
| `app/api/p-files/[enroleeNumber]/promise/route.ts` (POST)               | p-files (existing partial `revalidateTag('sis:${ayCode}')` stays; helper call is added) |
| `app/api/p-files/[enroleeNumber]/notify/route.ts` (POST)                | p-files                                                                                 |
| `app/api/p-files/notify/bulk/route.ts` (POST)                           | p-files                                                                                 |
| `app/api/sis/students/[enroleeNumber]/transfer-section/route.ts` (POST) | markbook + attendance + evaluation + records + p-files                                  |

The implementation plan should re-walk `app/api/**` once during the audit pass to catch any routes the explore agent missed; the table above is the floor, not the ceiling.

### 4.3 Failure mode

A missing or wrong invalidation = stale data after a write (60s max). This is strictly no worse than today (always 60s lag for everyone). Per-AY tag (no per-section/per-student variants) keeps the audit tractable — it's one tag per mutation, derived from `ayCode` which every route already has.

## 5. Phase D — bundle + RSC payload + drill UX

### 5.1 D.i — bundle-split chart wrappers via `next/dynamic`

For each of:

```
components/dashboard/charts/trend-chart.tsx
components/dashboard/charts/comparison-bar-chart.tsx
components/dashboard/charts/donut-chart.tsx
components/dashboard/charts/multi-series-trend-chart.tsx
components/dashboard/charts/multi-series-comparison-bar-chart.tsx
```

Pattern:

1. Move the existing `'use client'` body into a sibling `<name>.client.tsx`.
2. Replace the original file with a thin wrapper using `next/dynamic`:

```tsx
'use client';
import dynamic from 'next/dynamic';
import { ChartSkeleton } from './chart-skeleton';
import type { TrendChartProps } from './trend-chart.client';

const TrendChartImpl = dynamic(
  () => import('./trend-chart.client').then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton kind="trend" />,
  }
);

export function TrendChart(props: TrendChartProps) {
  return <TrendChartImpl {...props} />;
}
export type { TrendChartProps };
```

3. New `components/dashboard/charts/chart-skeleton.tsx` provides per-kind layout-stable placeholders. Skeleton dimensions match recharts `<ResponsiveContainer>` output — same height, same legend slot, same axis padding. Uses semantic tokens from `app/globals.css` (no raw colors per Hard Rule #7).

`components/dashboard/charts/sparkline-chart.tsx` (~34 lines) excluded — too small to justify a separate chunk.

### 5.2 D.ii — `<MetricCard>` `drillSheet` render-prop refactor

Change in `components/dashboard/metric-card.tsx`:

```ts
// before
drillSheet?: React.ReactNode;
// after
drillSheet?: () => React.ReactNode;
```

Render site invokes `drillSheet()` inside the `<Sheet>` body. Today every dashboard ships the JSX for ~6-10 drill sheets in the RSC payload even though users open at most one — the function-prop shape defers JSX construction to render time.

All call sites (~30 across the 6 module dashboards) wrap their existing JSX:

```tsx
// before
drillSheet={<TopAbsentDrill {...props} />}
// after
drillSheet={() => <TopAbsentDrill {...props} />}
```

Mechanical. No semantic change to the rendered output.

### 5.3 D.iii — remove in-drill scope toggle

Each drill sheet today renders a `ScopeToggle` (`This range / Current AY / All time`) that re-fetches with a different `?scope=` param. This duplicates the page-level date range picker and creates a "which one wins" confusion against the `<ComparisonToolbar>` source of truth.

**Behavior change:** drill sheets always reflect the page-level `from`/`to` window. No in-drill scope control. Users who want a different range widen the page-level picker.

**Removals:**

- `ScopeToggle` (or equivalent) UI element from each of:
  - `components/markbook/drills/markbook-drill-sheet.tsx`
  - `components/attendance/drills/attendance-drill-sheet.tsx`
  - `components/evaluation/drills/evaluation-drill-sheet.tsx`
  - `components/admissions/drills/admissions-drill-sheet.tsx`
  - `components/records/drills/records-drill-sheet.tsx`
  - `components/p-files/drills/p-files-drill-sheet.tsx`
- `?scope=` parameter handling from each `/api/<module>/drill/[target]/route.ts`
- `scope` field from each `lib/<module>/drill.ts:DrillRangeInput` type
- `applyScopeFilter` (or equivalent) — collapse to always-range or rename to `applyRangeFilter`. Range filtering still happens; only the scope toggle goes away.

**KD #56 update:** the design doc reference to "Range-scope toggle (`This range` / `Current AY` / `All time`) re-fetches via raw `fetch`" is removed.

## 6. Build sequence

5 independent workstreams. Recommended order minimizes merge conflicts:

1. **Phase A** — `Cache-Control` headers. Touches 6 route files. Smallest. Lands first.
2. **Phase D.iii** — drop in-drill scope toggle. Touches the same 6 route files (plus client + lib). Lands second to consolidate route-file edits.
3. **Phase B** — mutation tag invalidation. Touches ~28 mutation routes. Independent of A and D.iii.
4. **Phase D.i** — chart bundle split. Touches 5 chart files + 1 new skeleton. Independent.
5. **Phase D.ii** — `<MetricCard>` render prop. Touches 1 component + ~30 call sites. Independent. Can run in parallel with B and D.i.

Phases 3, 4, 5 can run as parallel subagents after 1+2 land. The Phase C precedent (feature-dev + subagent-driven-development with fresh workers per phase) applies here.

## 7. Verification per phase

| Phase | Manual check                                                                                                                                                                 | Build/type check          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| A     | Open a drill, reload tab, confirm second open shows `(memory cache)` or `(disk cache)` in devtools Network.                                                                  | `npx next build` clean.   |
| B     | Write a grade entry as a teacher, navigate back to `/markbook`, confirm new entry appears immediately (not after 60s). Repeat for one mutation per module.                   | `npx tsc --noEmit` clean. |
| D.i   | `npx next build` output: `/markbook` (and similar) main chunk shrinks; chart components appear as separate chunks. Visual: hero charts show skeleton briefly on first paint. | Build clean.              |
| D.ii  | Devtools Network: RSC payload size for `/markbook` drops (drill JSX no longer ships eagerly).                                                                                | TS clean.                 |
| D.iii | Open a drill, confirm no scope toggle visible. Change page-level date picker, re-open same drill, confirm rows reflect new range.                                            | TS + build clean.         |

No automated tests — project has no test framework (per dev-plan cross-cutting backlog).

## 8. Out of scope

- 9.1s cold render of `/attendance` and similar. SSR loader-path problem; addressed separately.
- Per-section / per-student finer cache tags. Rejected as scope creep — per-AY is sufficient for write-then-read freshness.
- Service-worker drill caching.
- DB index audits (already done where applicable; not perf-relevant for A/B/D).
- Migration of remaining `auth.admin.listUsers` callers to `getTeacherEmailMap` if any still exist (separate cleanup).

## 9. Risk

| Risk                                                                                       | Probability | Mitigation                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B audit misses a mutation route                                                            | Medium      | Implementation plan includes a final grep pass over `app/api/**` for `.from('<table>').insert/update/upsert/delete` matching the cached tables; subagent reports any new routes it found.                                                                                   |
| D.i above-the-fold chart skeletons feel janky                                              | Low         | Skeletons match recharts dimensions exactly; first navigation caches the chunk so subsequent loads don't re-skeleton.                                                                                                                                                       |
| D.iii surprises users who relied on the in-drill toggle                                    | Low         | KD #56 documents the toggle as a designed escape hatch, but the page-level `thisAY` preset (KD #79) is one-click equivalent. CLAUDE.md session-context entry will note the change.                                                                                          |
| A's `Cache-Control` + B's `revalidateTag` create a double-invalidation that confuses users | Very low    | Browser cache + server cache are separate layers. `revalidateTag` invalidates the server cache only. Browser cache expires by `max-age=60`. The two layers compose: server invalidation takes effect on the next browser-cache miss, max 60s lag. Same as today's contract. |

## 10. Documentation updates after implementation

- `CLAUDE.md` session context — add bullet for Phase A/B/D shipped
- `.claude/rules/key-decisions.md` KD #56 — strip the scope-toggle reference
- `docs/sprints/development-plan.md` — new sprint row
- This file (`2026-05-06-drill-perf-phases-a-b-d-design.md`) stays as the design record
