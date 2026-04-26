# Dashboard Architecture (20)

> This file documents the dashboard layer added in Sprint 21 (all-module dashboard upgrade). The detailed design spec is at `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md`; this is the canonical reference for anyone TOUCHING a dashboard.

## The pattern in one page

Every module's dashboard landing page composes from **one** vocabulary:

**Shared primitives (`components/dashboard/`):**
- `dashboard-hero.tsx` — canonical hero pattern (§8 hero header)
- `comparison-toolbar.tsx` — AY + date range + comparison period picker
- `priority-panel.tsx` — top-of-fold "what to act on right now?" banner (operational archetype only — see Layout archetypes below)
- `insights-panel.tsx` — 3–5 auto-generated narrative observations
- `action-list.tsx` — compact follow-up table (analytical archetype "supplement" placement)
- `metric-card.tsx` — dashboard-01 SectionCards KPI with delta + sparkline
- `chart-legend-chip.tsx` — gradient pill for severity / category labels (use for chart-series legends; for table/grid cell tints use a bespoke `*LegendItem` swatch helper instead — see `09a-design-patterns.md` §10)
- `charts/trend-chart.tsx` — area chart with gradient fill + comparison overlay
- `charts/comparison-bar-chart.tsx` — grouped bar (vertical or horizontal)
- `charts/donut-chart.tsx` — donut + inline legend with progress bars
- `charts/sparkline-chart.tsx` — inline 40px area line

**Shared lib (`lib/dashboard/`):**
- `range.ts` — preset resolution + delta math + shared types (`RangeInput`, `RangeResult<T>`)
- `windows.ts` — server-side term + AY window resolver (uses service client to stay inside `unstable_cache`)
- `insights.ts` — 7 module-specific insight generators (pure, data-driven)
- `priority.ts` — `PriorityPayload` type for the PriorityPanel; per-module computers live next to `dashboard.ts` (e.g. `lib/p-files/dashboard.ts::getPFilesPriority`)

## URL-param contract

Every dashboard page parses the same query shape:

```
?ay=AY2026&from=YYYY-MM-DD&to=YYYY-MM-DD&cmpFrom=YYYY-MM-DD&cmpTo=YYYY-MM-DD
```

Malformed `from`/`to` → fall back to `thisTerm` preset (else last-30d). Missing `cmpFrom`/`cmpTo` → auto-computed prior period of equal length.

Module-specific secondary filters (`?level=P3`, `?status=pending`, `?term=1`) stack on top via URL params only — no dropdown UI.

## Library contract

Every `lib/<module>/dashboard.ts` file adds `*Range` sibling functions next to any AY-scoped existing functions:

```ts
export function getRevisionsOverTime(ayCode: string, weeks = 12): Promise<RevisionWeek[]>;                    // existing
export function getRevisionsOverTimeRange(input: RangeInput): Promise<RangeResult<RevisionWeek[]>>;          // added
```

Hoist `load*Uncached` at module scope (KD #46), wrap per-call with `unstable_cache` using cache key `['module', 'fn-name', ayCode, from, to, cmpFrom, cmpTo]` and tag = the existing per-AY tag.

## Layout archetypes

Not every dashboard does the same job. The layout depends on what the user is trying to do when they arrive — **not** on what data the system happens to have. We classify each dashboard into one of three archetypes (Stephen Few taxonomy) and compose the top-of-fold accordingly.

| Archetype | Primary user task | Top-of-fold answer |
|---|---|---|
| **Operational** | "What do I owe / who needs action right now?" | A `PriorityPanel` headlining the single most important action |
| **Analytical** | "Is the funnel / cohort healthy?" | A 4-up `MetricCard` strip + `InsightsPanel` |
| **Hub** | "What configuration surface do I need?" | Admin nav cards. KPIs are *opt-in* via `?view=audit` |

### Module assignments

| Module | Archetype | Notes |
|---|---|---|
| `/markbook` (registrar view) | Operational | Lock-completion + change-request decision queue |
| `/markbook` (teacher view) | Operational | Sheets needing entry + assigned-section chips |
| `/attendance` | Operational | Sections that haven't marked today + compassionate-quota alerts |
| `/p-files` | Operational | Documents expiring + missing for newly enrolled |
| `/records` | Analytical | New enrolments / withdrawals / doc-expiry flow |
| `/admissions` | Analytical | Funnel conversion + time-to-enroll |
| `/evaluation` (registrar view) | Analytical | Submission velocity by section/term |
| `/evaluation` (teacher view) | Operational | Writeups due in current term + assigned-section chips |
| `/sis` | Hub | Admin nav cards; audit metrics live behind `?view=audit` |

### Composition per archetype

**Operational** (top-to-bottom):
1. `DashboardHero`
2. `PriorityPanel` (the headline answer — must fit in the first ~240px)
3. `ComparisonToolbar` (compact)
4. `MetricCard` strip — *secondary*, no sparklines (or omit entirely if PriorityPanel already covers the same metric)
5. Drill table (the work surface)
6. Charts (de-emphasized, below the fold)

**Analytical** (the original Sprint 21 F-pattern row order):
1. `DashboardHero` + `ComparisonToolbar`
2. `InsightsPanel`
3. 4 `MetricCard`s (SectionCards grid, with sparklines)
4. Primary trend chart (wide)
5. Secondary trend or context
6. Breakdowns (donuts / horizontal bars)
7. `ActionList` + tables + deep-link Cards
8. Trust strip

**Hub** (top-to-bottom):
1. `DashboardHero` + system-health strip (if relevant)
2. Admin nav cards (the navigation IS the page)
3. *(Optional)* tabbed entry to KPIs / audit metrics via `?view=audit`

Chart budget ≤ 8 per screen for analytical; operational and hub typically use ≤ 3 charts.

### Role-aware composition

Where one URL serves both teachers and registrars (Markbook, Evaluation), the page RSC branches on role at SSR and renders different top-of-fold composition per role:

```ts
const sessionUser = await getSessionUser();
return sessionUser.role === 'teacher' ? <TeacherView /> : <RegistrarView />;
```

The two views live in `components/<module>/<module>-{teacher,registrar}-view.tsx`. The URL stays single — the user always lands at `/markbook`, never at a per-role route.

### When to use which

- Default to **Analytical** for any new dashboard unless the user lands with a single concrete action
- Promote to **Operational** when the dashboard's first job is to surface "do this now" rather than "monitor this"
- Use **Hub** only when the page is genuinely a navigator (no aggregation; just routing into config surfaces)
- A dashboard CAN change archetype as the module matures; revisit during sync-docs passes

## Comparison model

"Target" = **prior period of equal length** (auto-computed by `autoComparison()` in `lib/dashboard/range.ts`). No stored `kpi_targets` table. Delta chips on MetricCards read ±% / ±pp vs prior.

## Gotchas (Next 16 + React 19)

- `cookies()` inside `unstable_cache` is forbidden → `windows.ts::loadTermsUncached` uses `createServiceClient()`, never the cookie-scoped `createClient()`.
- Array mutation via `.sort()` inside JSX causes React 19 profiler "negative timestamp" warnings → hoist derived values above the return.
- `Promise.all(modules.map(async → out.push))` produces non-deterministic order → return from each mapped promise and index the result (see `getAuditActivityByModule` in `lib/sis/dashboard.ts`).
- Function props on `'use client'` chart components are not serializable → use enum string props (`yFormat: 'number' | 'percent' | 'days'`) instead of `yFormatter: (n) => string`.

## Full spec

See `docs/superpowers/specs/2026-04-24-comprehensive-dashboard-redesign.md` for per-module business questions, KPI formulas, wireframes, insight rules, and deviation notes.
