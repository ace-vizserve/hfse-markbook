# Dashboard performance audit + Option B fixes — design

**Date:** 2026-04-25
**Branch:** `feat/dashboard-drilldowns` (or follow-up branch)
**Status:** Spec — implementation pending
**Predecessor:** 28th-pass drill-down sprint shipped earlier today across all four operational modules.

## 1. Goal

Eliminate dashboard payload bloat at 500–1000-student scale. The drill-down sprint introduced a "pre-fetch every row server-side and ship as `initialRows`" pattern that scales poorly: Attendance ships ~30–50 MB JSON per page load, Markbook ships ~8–15 MB. Most of that data the user never looks at.

The fix is **architectural-first** (Option B): change the per-module data strategy so server pre-fetches only the small rolled-up shapes and raw row sets lazy-fetch on first drill open. Then layer in nine tactical optimizations.

## 2. Audit findings (from 4 parallel module audits)

### 2.1 Universal Critical issue

Every dashboard's `buildAllRowSets()` runs unconditionally on every page render and ships full row arrays through the RSC payload to the client.

| Module | Pre-fetched rows (1000 students) | JSON payload (est.) |
|---|---|---|
| **Attendance** | 180,000 entries + rollups | **30–50 MB** |
| **Markbook** | 40,000 entries + 1,600 sheets + CRs | **8–15 MB** |
| Evaluation | 3,000 writeups + rollups | ~600 KB |
| Admissions | 400 applicants × 16 fields | ~150 KB |

**Attendance and Markbook are the high-impact targets.** Evaluation and Admissions are small enough that pre-fetching is fine — instant-drill-open value beats the modest payload cost.

### 2.2 Tactical issues (ordered by impact)

| # | Module | File | Issue | Fix sketch |
|---|---|---|---|---|
| 2 | Markbook | `lib/markbook/drill.ts` (entry loader) | `service.auth.admin.listUsers({perPage:1000})` blocks loader on every cache miss | Separate cached email map keyed by user-id, or DB-side join through `auth.users` |
| 3 | Evaluation | `lib/evaluation/drill.ts` (writeup loader) | Same `auth.admin.listUsers` pattern | Same fix |
| 4 | Admissions + Markbook | `lib/<module>/drill.ts` | Cache stores `scope='all'` then filters client-side; defeats range scoping | Push scope filter into cache key + DB query |
| 5 | Admissions | `lib/admissions/drill.ts:loadDrillRows` | Always fetches docs even when only 5 of 12 targets need them | Hoist docs fetch into separate helper; only call from doc-related targets |
| 6 | Admissions | `lib/admissions/dashboard.ts:bucketByDay` | Per-row `Array.indexOf` (O(n×k) on 90 days × 1000 rows = 90k ops) | Pre-build label→index Map |
| 7 | Admissions + Markbook | drill-sheet client components | `preFiltered` does separate filter passes for status + level | Single combined `.filter()` pass |
| 8 | Markbook | `lib/markbook/drill.ts:loadSheetRows` | `report_card_publications` + `grade_entries` queries lack `.in('term_id', termIds)` filter | Add explicit term filter |
| 9 | Markbook | DB schema | Indexes likely missing on critical query columns | Verify before adding; if missing, ship `028_markbook_drill_indexes.sql` |
| 10 | Attendance | `lib/attendance/drill.ts:rollupCompassionate` | Re-loads all entries even when range pre-fetch is cached | Take entries as parameter, don't re-fetch |
| 11 | Attendance | `lib/attendance/dashboard.ts:loadDailyRowsUncached` | Doesn't filter by current term — index `(term_id, section_student_id, date)` not used | Add `eq('term_id', currentTermId)` |
| 12 | Attendance | duplicate `loadTopAbsentRange` impls | Drift hazard | Unify on the `lib/attendance/drill.ts` shape |

### 2.3 Verified clean

Cache tags · revalidation strategy · most useMemo deps · auth gates · CSV serialization · client/server boundary correctness.

## 3. Per-module pre-fetch contract (the architectural change)

The new contract: **`buildAllRowSets()` returns only rolled-up shapes; raw row arrays lazy-fetch on first drill open.**

### 3.1 Attendance

**Current:**
```ts
buildAllRowSets() → { entries, topAbsent, sectionAttendance, calendar, compassionate }
//                    ^^^^^^^ 180k rows, dropped from server pre-fetch
```

**New:**
```ts
buildAllRowSets() → { topAbsent, sectionAttendance, calendar, compassionate }
//                    rolled-up + small (calendar ≤ 200 days, compassionate = students)
// entries lazy-fetched by AttendanceDrillSheet on first scope-toggle / mount
```

Drill sheet behavior change: on mount, if `kind === 'entry'` and `initialEntries === undefined`, immediately fetch via `/api/attendance/drill/{target}?...`. Show a 6-row skeleton until rows arrive. Subsequent scope changes already trigger fetch.

**Estimated payload reduction**: 30–50 MB → ~200 KB.

### 3.2 Markbook

**Current:**
```ts
buildAllRowSets() → { entries, sheets, changeRequests }
//                    ^^^^^^^ 40k rows, dropped from server pre-fetch
```

**New:**
```ts
buildAllRowSets() → { sheets, changeRequests }  // both small
// entries lazy-fetched by MarkbookDrillSheet on first mount when kind='entry'
```

Same skeleton pattern as Attendance.

**Estimated payload reduction**: 8–15 MB → ~80 KB.

### 3.3 Evaluation — KEEP current pre-fetch

3,000 writeups ≈ 600 KB. Below the threshold where lazy-fetch is worth the complexity. Apply tactical fixes only.

### 3.4 Admissions — KEEP current pre-fetch

400 applicants ≈ 150 KB. Same call.

## 4. New shared primitive: `DrillSheetSkeleton`

Lazy-fetched drill sheets need a skeleton during the first fetch. New component:

`components/dashboard/drill-sheet-skeleton.tsx` — renders the SheetContent shell (header + filter bar + 6 placeholder rows + table-shaped shimmer). Used by `AttendanceDrillSheet` and `MarkbookDrillSheet` while the entry-kind initial fetch resolves.

```tsx
{loading && initialRows.length === 0 ? <DrillSheetSkeleton /> : <DrillDownSheet ... />}
```

Skeleton matches the table density / column count via target prop so no layout shift on data arrival.

## 5. Tactical fixes

### 5.1 Auth admin listUsers de-blocking (Markbook + Evaluation)

New `lib/auth/teacher-emails.ts`:

```ts
export async function getTeacherEmailMap(): Promise<Map<string, string>> {
  return unstable_cache(
    async () => {
      const service = createServiceClient();
      const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
      const map = new Map<string, string>();
      for (const u of data?.users ?? []) {
        if (u.email) map.set(u.id, u.email);
      }
      return map;
    },
    ['teacher-emails-map'],
    { revalidate: 300, tags: ['teacher-emails'] },
  )();
}
```

5-minute TTL is fine — teachers don't change emails often. Markbook + Evaluation drill loaders consume this instead of calling `listUsers` directly. Both module loaders gain a single shared cache.

### 5.2 Cache scope correctness (Admissions + Markbook)

Replace AY-only cache keys with `[ayCode, scope, from, to, segment]` where scope='range' was supposed to filter. Push the filter into the loader (or apply at API-route level rather than re-applying in `buildDrillRows`).

### 5.3 Algorithmic fixes

- `bucketByDay`: pre-build `Map<isoDate, index>` once outside the loop
- Drill-sheet `preFiltered`: single `.filter(r => statusOK(r) && levelOK(r))` pass; short-circuit when both sets empty
- `rollupCompassionate`: accept `entries` parameter instead of re-loading
- `loadSheetRows`: add `.in('term_id', termIds)` to publications + entries queries
- `loadDailyRowsUncached`: add `.eq('term_id', currentTermId)` to push-down
- `getApplicationsByLevelRange`: use single-pass derivation already

### 5.4 Doc fetch waste (Admissions)

`buildDrillRows` calls 3 tables. Of the 12 targets, only 5 use `documentsComplete` / `hasMissingDocs`. Split:
- `loadCoreDrillRows()` — apps + status (no docs)
- `loadDocCompleteness(rows)` — adds doc fields when needed

Targets `doc-completion`, `applications`, `enrolled`, `outdated`, `applications-by-level` call the enriched version. Others use the lighter row.

### 5.5 DB indexes (Markbook — verify before adding)

Audit suggested missing indexes on:
- `grade_entries(grading_sheet_id, created_at)`
- `grading_sheets(term_id, section_id, is_locked)`
- `report_card_publications(section_id, term_id)`
- `section_students(section_id, enrollment_status)`

**Verification step**: `select indexname, indexdef from pg_indexes where tablename in ('grade_entries', 'grading_sheets', 'report_card_publications', 'section_students')` — if any are missing, ship `028_markbook_drill_indexes.sql`.

### 5.6 Drift cleanup (Attendance)

Two implementations of `loadTopAbsentRange` exist (`lib/attendance/dashboard.ts` + `lib/attendance/queries.ts`). Pick one canonical implementation; have the other re-export. Both currently work but the divergence is a maintenance hazard.

## 6. Build sequence

Six bites. Each is independently shippable / verifiable.

1. **Attendance pre-fetch reshape** — drop entries from `buildAllRowSets()`; add lazy-fetch path in `AttendanceDrillSheet`; add `DrillSheetSkeleton` primitive. Build clean. Smoke-test 4 attendance drill paths.
2. **Markbook pre-fetch reshape** — same shape; reuse the skeleton. Smoke-test 4 markbook drill paths.
3. **Auth admin listUsers de-blocking** — new `lib/auth/teacher-emails.ts`; Markbook + Evaluation drill loaders consume it.
4. **Cache scope correctness** — fix Admissions + Markbook drill cache keys.
5. **Algorithmic + tactical fixes** — bucketByDay Map; preFiltered single-pass; rollupCompassionate parameter; loadSheetRows term filter; loadDailyRowsUncached term filter.
6. **DB index audit + migration if needed** + **Attendance duplicate cleanup** + **Admissions doc-fetch split.**

After all six: `npx next build` + manual smoke across all 4 dashboards. Update CLAUDE.md + dev-plan with a 29th-pass row.

## 7. KD update

KD #56 currently says: "Page-level pre-fetch via `buildAllRowSets()` per module, passed as `initialRows` so first-open is instant."

Update to: "Page-level pre-fetch via `buildAllRowSets()` returns rolled-up shapes only; raw row arrays (entries / writeup-level rows) lazy-fetch on drill open with a `DrillSheetSkeleton` placeholder. Modules with bounded row counts (≤ 5,000 rows) keep current full pre-fetch — Evaluation and Admissions today."

## 8. Out of scope

- React Query / TanStack — already discussed and rejected
- `<Suspense>` streaming — Option C; we're on B
- URL-persistent drill state — was punted in the original drill spec, still punted
- Real-time row invalidation when teachers mutate — current 60s revalidate is fine

## 9. Success criteria

After implementation:
- `/attendance` page-load HTML response < 500 KB (today: ~30 MB at 1000 students)
- `/markbook` page-load HTML response < 500 KB (today: ~10 MB)
- First drill open on a lazy target: skeleton ≤ 100 ms; rows ≤ 800 ms (cache cold)
- Subsequent drill opens (cache warm): rows in ≤ 200 ms
- `npx next build` clean, zero errors / zero warnings
- No regressions in drill UX (toolkit, CSV, sorting, grouping all still work)
