# Compare-Mode + Picker-Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship demo-ready compare-mode (multi-AY × multi-term/month side-by-side analytics) on every module dashboard, plus rework operational-mode date pickers so academic modules use term presets and operational modules use calendar-aligned quick filters. Re-anchor the AY9999 test environment to today (Option C) and provision a prior-year test AY (AY9998) for compare demos.

**Architecture:** Pragmatic-balance variant. New compare-mode is a parallel system on per-module `/compare` sub-routes — the operational `<ComparisonToolbar>` + `cmpFrom/cmpTo` URL contract stays untouched. Multi-series chart variants ship as siblings of existing charts (no unification). `TERM_TEMPLATES` becomes year-parametric (`buildTermTemplates(year)`). `structural.ts` force-overwrites term dates for `^AY9` test AYs only. Two test AYs (AY9999 current, AY9998 prior year) provisioned via shared seeder pipeline.

**Tech Stack:** Next.js 16 App Router · React 19 · `@supabase/ssr` + service-role client · Tailwind v4 · sonner toasts via sileo shim (KD #58) · `@tanstack/react-table` · `recharts` · `cmdk` for multi-select. **No test framework** — verification is `npx next build` (clean compile) + manual browser smoke check + DB inspection where relevant. Spec lives in this conversation; architecture decisions locked per `feature-dev:code-architect` recommendation (pragmatic-balance with `buildTermTemplates(year)` cherry-pick from clean-architecture).

**Branch:** continue on `main` per recent commits — each task commits independently. Worktree isolation NOT required (the user has been driving from `main` in this session).

**Key locked decisions:**

1. Term-scoped modules (Markbook, Attendance, Evaluation): presets = T1/T2/T3/T4 + custom + thisAY. No rolling-day filters. No "lastAY" preset (compare mode covers it).
2. Flexible modules (Admissions, P-Files, Records): presets = Last week (prev Mon–Sun) + Last 15 days (rolling today−15..today−1) + Last month (prev calendar month) + custom + thisAY. No term presets.
3. Active-term fallback when today is outside all current-AY terms: last finished term in current AY → prior AY's last term → empty + banner.
4. Compare mode = sub-route per module (`/markbook/compare` etc.). URL: `?ays=AY9998,AY9999&terms=T1,T2` (academic) or `?ays=...&months=2026-04,2026-05` (flexible).
5. Compare chart: KPI grid (rows = metric, cols = AY × term/month cell) + multi-series TrendChart for velocity overlays.
6. Seeder Option C: today-anchored Jan–Nov calendar year. T1 closed (full data + locked), T2 active (partial up to today, unlocked), T3+T4 untouched.
7. Two test AYs: AY9999 (current calendar year) + AY9998 (prior calendar year, year-shifted).

**Migration after Phase 2 lands:** wipe + reseed via `/sis/admin/settings` Environment switcher (DELETE → POST switch-to-test). Both AYs provisioned automatically.

---

## Task 1: Extend `Preset` union + `TermWindows.byNumber` + cross-AY active-term fallback

This task lays the foundation for the picker rework. New presets are pure additive type extensions; the cross-AY fallback in `windows.ts` enables the "no active term in current AY" case.

**Files:**
- Modify: `lib/dashboard/range.ts`
- Modify: `lib/dashboard/windows.ts`

- [ ] **Step 1: Extend `Preset` union and `PRESET_LABEL` in `lib/dashboard/range.ts`**

Replace the existing `Preset` type and `PRESET_LABEL` const (lines 18–37):

```ts
export type Preset =
  | 't1'
  | 't2'
  | 't3'
  | 't4'
  | 'lastWeek'
  | 'last15d'
  | 'lastMonth'
  | 'last7d'
  | 'last30d'
  | 'last90d'
  | 'thisTerm'
  | 'lastTerm'
  | 'thisAY'
  | 'lastAY'
  | 'custom';

export const PRESET_LABEL: Record<Preset, string> = {
  t1: 'Term 1',
  t2: 'Term 2',
  t3: 'Term 3',
  t4: 'Term 4',
  lastWeek: 'Last week',
  last15d: 'Last 15 days',
  lastMonth: 'Last month',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
  last90d: 'Last 90 days',
  thisTerm: 'This term',
  lastTerm: 'Last term',
  thisAY: 'This AY',
  lastAY: 'Last AY',
  custom: 'Custom',
};

// Preset arrays exported so each module's page RSC picks the right shortlist.
export const TERM_SCOPED_PRESETS: Preset[] = ['t1', 't2', 't3', 't4', 'thisAY', 'custom'];
export const FLEXIBLE_PRESETS: Preset[] = ['lastWeek', 'last15d', 'lastMonth', 'thisAY', 'custom'];
```

- [ ] **Step 2: Extend `TermWindows` type in `lib/dashboard/range.ts`**

Replace `TermWindows` (lines 39–42):

```ts
export type TermWindows = {
  thisTerm: DateRange | null;
  lastTerm: DateRange | null;
  /** Per-term-number lookup. null when that term doesn't exist or has no dates. */
  byNumber: { 1: DateRange | null; 2: DateRange | null; 3: DateRange | null; 4: DateRange | null };
};
```

- [ ] **Step 3: Extend `resolvePreset` in `lib/dashboard/range.ts`**

Replace the existing `resolvePreset` function (lines 222–245):

```ts
export function resolvePreset(
  preset: Preset,
  windows: { term: TermWindows; ay: AYWindows },
  today?: Date,
): DateRange | null {
  switch (preset) {
    case 't1':
      return windows.term.byNumber[1];
    case 't2':
      return windows.term.byNumber[2];
    case 't3':
      return windows.term.byNumber[3];
    case 't4':
      return windows.term.byNumber[4];
    case 'lastWeek':
      return lastCalendarWeek(today);
    case 'last15d':
      return lastNDays(15, today);
    case 'lastMonth':
      return lastCalendarMonth(today);
    case 'last7d':
      return lastNDays(7, today);
    case 'last30d':
      return lastNDays(30, today);
    case 'last90d':
      return lastNDays(90, today);
    case 'thisTerm':
      return windows.term.thisTerm;
    case 'lastTerm':
      return windows.term.lastTerm;
    case 'thisAY':
      return windows.ay.thisAY;
    case 'lastAY':
      return windows.ay.lastAY;
    case 'custom':
      return null;
  }
}
```

- [ ] **Step 4: Add `lastCalendarWeek` + `lastCalendarMonth` helpers in `lib/dashboard/range.ts`**

Add these two helpers right after `lastNDays` (~line 220):

```ts
/** Previous Monday–Sunday block (calendar-aligned). */
function lastCalendarWeek(today = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // getDay: Sun=0, Mon=1 ... Sat=6. Convert to Mon=0..Sun=6.
  const dayMon0 = (t.getDay() + 6) % 7;
  // This Monday:
  const thisMon = addDays(t, -dayMon0);
  // Last Sunday = thisMon - 1; Last Monday = thisMon - 7.
  const lastSun = addDays(thisMon, -1);
  const lastMon = addDays(thisMon, -7);
  return { from: toISODate(lastMon), to: toISODate(lastSun) };
}

/** Previous full calendar month (1st through last day). */
function lastCalendarMonth(today = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Last day of prior month = day 0 of current month
  const lastDayPrev = new Date(t.getFullYear(), t.getMonth(), 0);
  const firstDayPrev = new Date(lastDayPrev.getFullYear(), lastDayPrev.getMonth(), 1);
  return { from: toISODate(firstDayPrev), to: toISODate(lastDayPrev) };
}
```

- [ ] **Step 5: Extend `detectPreset` in `lib/dashboard/range.ts`**

Replace the existing `detectPreset` function's preset list (lines 256–264) with the full set:

```ts
export function detectPreset(
  range: DateRange,
  windows: { term: TermWindows; ay: AYWindows },
  today?: Date,
): Preset {
  const presets: Preset[] = [
    't1', 't2', 't3', 't4',
    'lastWeek', 'last15d', 'lastMonth',
    'last7d', 'last30d', 'last90d',
    'thisTerm', 'lastTerm', 'thisAY', 'lastAY',
  ];
  for (const p of presets) {
    const candidate = resolvePreset(p, windows, today);
    if (candidate && candidate.from === range.from && candidate.to === range.to) return p;
  }
  return 'custom';
}
```

- [ ] **Step 6: Populate `byNumber` + add cross-AY active-term fallback in `lib/dashboard/windows.ts`**

In `getDashboardWindows`, replace the `current` resolution and `thisTerm` block (around lines 75–84) with:

```ts
  const todayMs = parseLocalDate(today)?.getTime() ?? 0;

  // Resolve "current" term (today-anchored → is_current flag → first term in AY).
  const current =
    sortedAy.find((t) => t.start_date! <= today && today <= t.end_date!) ??
    sortedAy.find((t) => t.is_current) ??
    sortedAy[0] ??
    null;

  const thisTermInAy: DateRange | null = current?.start_date && current.end_date
    ? { from: current.start_date, to: current.end_date }
    : null;

  // Active-term fallback: when no term in CURRENT AY contains today and no
  // is_current flag is set, look across prior AYs for the most recently
  // finished term. The picker presets stay AY-scoped (T1–T4 of current AY)
  // but `thisTerm` becomes useful for default-range purposes.
  const hasTodayInCurrent = sortedAy.some(
    (t) => t.start_date! <= today && today <= t.end_date!,
  );
  let priorAyLastTerm: DateRange | null = null;
  if (!hasTodayInCurrent) {
    const priorFinished = terms
      .filter((t) => t.ay_code !== ayCode && t.start_date && t.end_date && t.end_date! < today)
      .sort((a, b) => (a.end_date! < b.end_date! ? 1 : -1))[0];
    if (priorFinished) {
      priorAyLastTerm = { from: priorFinished.start_date!, to: priorFinished.end_date! };
    }
  }

  // thisTerm prefers in-AY current term; falls back to prior-AY last term so
  // dashboards always have a meaningful default range to land on.
  const thisTerm: DateRange | null = thisTermInAy ?? priorAyLastTerm;

  // Banner flag — page RSC renders "showing previous term" hint.
  const activeTermFallback = !hasTodayInCurrent && priorAyLastTerm !== null;

  // Per-term-number lookup for T1/T2/T3/T4 presets.
  const byNumber: TermWindows['byNumber'] = { 1: null, 2: null, 3: null, 4: null };
  for (const t of sortedAy) {
    if (t.term_number >= 1 && t.term_number <= 4 && t.start_date && t.end_date) {
      byNumber[t.term_number as 1 | 2 | 3 | 4] = { from: t.start_date, to: t.end_date };
    }
  }
```

Then update the existing `lastTerm` derivation to use the existing `prior` logic (already correct — leave it), and update the return statement to include `byNumber` + `activeTermFallback`:

```ts
  return {
    term: { thisTerm, lastTerm, byNumber },
    ay: { thisAY, lastAY },
    activeTermFallback,
  };
```

- [ ] **Step 7: Update return type declaration in `lib/dashboard/windows.ts`**

Change the function signature of `getDashboardWindows`:

```ts
export async function getDashboardWindows(
  ayCode: string,
): Promise<{ term: TermWindows; ay: AYWindows; activeTermFallback: boolean }> {
```

(Where `TermWindows` is now imported from `range.ts` with the extended shape.)

- [ ] **Step 8: Verify build**

Run: `npx next build`
Expected: clean compile (no TypeScript errors). New `byNumber` and `activeTermFallback` propagate correctly to all consumers.

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard/range.ts lib/dashboard/windows.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): add term-numbered + calendar-aligned presets

Extends Preset union with t1/t2/t3/t4 (term-number presets),
lastWeek (prev Mon-Sun), last15d (rolling), lastMonth (prev
calendar month) ahead of the picker rework. PRESET_LABEL +
resolvePreset + detectPreset all extended.

TermWindows gains byNumber: {1,2,3,4} so resolvePreset can
emit term-specific date ranges for the term-scoped picker.

windows.ts gains a cross-AY active-term fallback: when no term
in the current AY contains today and no is_current flag is set,
thisTerm falls back to the most recently finished term in any
prior AY. Returns activeTermFallback: boolean so pages can show
a "viewing previous term" hint banner.

Foundation for compare-mode and the term-scoped vs flexible
picker split — no UI changes yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `presets` prop to `<ComparisonToolbar>` + wire all 6 dashboards

`<DateRangePicker>` already accepts `presets?: Preset[]`. The toolbar needs to forward this prop, then each module's page RSC passes the appropriate array.

**Files:**
- Modify: `components/dashboard/comparison-toolbar.tsx`
- Modify: `app/(markbook)/markbook/page.tsx`
- Modify: `app/(attendance)/attendance/page.tsx`
- Modify: `app/(evaluation)/evaluation/page.tsx`
- Modify: `app/(admissions)/admissions/page.tsx`
- Modify: `app/(records)/records/page.tsx`
- Modify: `app/(p-files)/p-files/page.tsx`

- [ ] **Step 1: Add `presets` prop to `ComparisonToolbarProps`**

In `components/dashboard/comparison-toolbar.tsx`, extend the props type (around line 27):

```ts
import { formatRangeLabel, type AYWindows, type DateRange, type Preset, type TermWindows } from '@/lib/dashboard/range';

export type ComparisonToolbarProps = {
  ayCode: string;
  ayCodes: readonly string[];
  range: DateRange;
  comparison: DateRange | null;
  termWindows: TermWindows;
  ayWindows: AYWindows;
  showAySwitcher?: boolean;
  trustStrip?: React.ReactNode;
  className?: string;
  /** Preset shortlist passed to the inner DateRangePicker. Defaults to picker's own DEFAULT_PRESETS. */
  presets?: Preset[];
};
```

- [ ] **Step 2: Forward `presets` to `<DateRangePicker>`**

In the same file, find the `<DateRangePicker>` JSX (around line 159) and add the prop:

```tsx
        <DateRangePicker
          value={range}
          onChange={onRangeChange}
          comparison={comparison}
          onComparisonChange={onComparisonChange}
          termWindows={termWindows}
          ayWindows={ayWindows}
          presets={presets}
        />
```

Also destructure `presets` from props in the function signature.

- [ ] **Step 3: Pass `TERM_SCOPED_PRESETS` from each term-scoped module's page RSC**

For Markbook (`app/(markbook)/markbook/page.tsx`), find the `<ComparisonToolbar>` rendering (around line 223) and add the import + prop:

```tsx
import { TERM_SCOPED_PRESETS } from '@/lib/dashboard/range';

// ... in the JSX:
<ComparisonToolbar
  ayCode={ayCode}
  ayCodes={ayCodes}
  range={...}
  comparison={...}
  termWindows={windows.term}
  ayWindows={windows.ay}
  showAySwitcher={false}
  presets={TERM_SCOPED_PRESETS}
/>
```

Repeat the same change for `app/(attendance)/attendance/page.tsx` and `app/(evaluation)/evaluation/page.tsx`.

- [ ] **Step 4: Pass `FLEXIBLE_PRESETS` from each flexible module's page RSC**

For `app/(admissions)/admissions/page.tsx`, `app/(records)/records/page.tsx`, `app/(p-files)/p-files/page.tsx`, add the import and the prop:

```tsx
import { FLEXIBLE_PRESETS } from '@/lib/dashboard/range';

// ... in the JSX:
<ComparisonToolbar
  ...
  presets={FLEXIBLE_PRESETS}
/>
```

- [ ] **Step 5: Render the active-term fallback banner**

In each term-scoped module page RSC (Markbook, Attendance, Evaluation), where windows are awaited, capture the new `activeTermFallback` boolean. Add a one-line banner above `<ComparisonToolbar>` when set:

```tsx
const windows = await getDashboardWindows(ayCode);

// ... in the JSX:
{windows.activeTermFallback && (
  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
    Active term hasn&apos;t started yet. Showing the previous term&apos;s data as a default — pick a different range above to override.
  </div>
)}
```

Skip this banner on the flexible modules — they don't have a "current term" concept to fall back from.

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 7: Manual smoke check**

Start dev server (`npm run dev`); visit each module dashboard and verify:
- Markbook / Attendance / Evaluation show **Term 1, Term 2, Term 3, Term 4, This AY, Custom** as picker presets
- Admissions / Records / P-Files show **Last week, Last 15 days, Last month, This AY, Custom** as picker presets
- No "Last 7 days / 30 days / 90 days" appears on term-scoped modules
- No "T1/T2/T3/T4" appears on flexible modules

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/comparison-toolbar.tsx app/
git commit -m "$(cat <<'EOF'
feat(dashboard): split picker presets per-module — term-scoped vs flexible

ComparisonToolbar gains presets prop forwarded to DateRangePicker.
Term-scoped modules (Markbook/Attendance/Evaluation) pass
TERM_SCOPED_PRESETS = [t1, t2, t3, t4, thisAY, custom]. Flexible
modules (Admissions/Records/P-Files) pass FLEXIBLE_PRESETS =
[lastWeek, last15d, lastMonth, thisAY, custom].

Term-scoped pages also render an amber banner when the active
term hasn't started yet (windows.activeTermFallback) so the
registrar knows the displayed range is a fallback.

No changes to the underlying picker calendar — preset list
swap is the only delta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `buildTermTemplates(year)` + `buildCannedCalendar(year)` + `buildCannedEvents(year)`

Make `fixtures.ts` year-parametric so AY9999 + AY9998 can share the same seeder pipeline with different `targetYear` values.

**Files:**
- Modify: `lib/sis/seeder/fixtures.ts`

- [ ] **Step 1: Replace `TERM_TEMPLATES` constant with `buildTermTemplates(year)` function**

In `lib/sis/seeder/fixtures.ts`, replace the existing `TERM_TEMPLATES` const (around line 101) with:

```ts
export type TermTemplate = {
  term_number: number;
  start_date: string;
  end_date: string;
  virtue_theme: string | null;
  grading_lock_date: string;
};

/**
 * Builds the four-term calendar for `targetYear`. HFSE AY runs January
 * through November of a single calendar year per KD #13. Layout is
 * today-anchored when `targetYear` is the current year — T1 closed by Apr 3,
 * T2 active (Apr 13–Jul 3), T3+T4 future. For prior years (AY9998), all
 * four terms fall in the past so they all have full data.
 */
export function buildTermTemplates(targetYear: number): TermTemplate[] {
  const y = String(targetYear);
  return [
    {
      term_number: 1,
      start_date: `${y}-01-13`,
      end_date: `${y}-04-03`,
      virtue_theme: 'Faith',
      grading_lock_date: `${y}-03-30`,
    },
    {
      term_number: 2,
      start_date: `${y}-04-13`,
      end_date: `${y}-07-03`,
      virtue_theme: 'Hope',
      grading_lock_date: `${y}-06-29`,
    },
    {
      term_number: 3,
      start_date: `${y}-07-13`,
      end_date: `${y}-10-02`,
      virtue_theme: 'Love',
      grading_lock_date: `${y}-09-28`,
    },
    {
      term_number: 4,
      start_date: `${y}-10-13`,
      end_date: `${y}-11-27`,
      virtue_theme: null,
      grading_lock_date: `${y}-11-23`,
    },
  ];
}

/** Backwards-compat alias — points at current calendar year. Existing callers keep working. */
export const TERM_TEMPLATES: TermTemplate[] = buildTermTemplates(new Date().getFullYear());
```

- [ ] **Step 2: Make `CANNED_CALENDAR` year-parametric as `buildCannedCalendar(year)`**

Below `buildTermTemplates`, find the existing `CANNED_CALENDAR` const and replace with:

```ts
export type CannedCalendarEntry = {
  date: string;
  day_type: DayType;
  label: string;
};

/**
 * Synthetic holidays + special days, year-parametric. Substitutes
 * `targetYear` for the literal year in each ISO date.
 */
export function buildCannedCalendar(targetYear: number): CannedCalendarEntry[] {
  const y = String(targetYear);
  return [
    { date: `${y}-02-13`, day_type: 'public_holiday', label: 'Chinese New Year (Day 1)' },
    { date: `${y}-02-14`, day_type: 'public_holiday', label: 'Chinese New Year (Day 2)' },
    { date: `${y}-03-31`, day_type: 'public_holiday', label: 'Hari Raya Puasa' },
    { date: `${y}-05-01`, day_type: 'public_holiday', label: 'Labour Day' },
    { date: `${y}-06-08`, day_type: 'public_holiday', label: 'Hari Raya Haji' },
    { date: `${y}-08-09`, day_type: 'public_holiday', label: 'National Day' },
    { date: `${y}-10-26`, day_type: 'public_holiday', label: 'Deepavali' },
    { date: `${y}-11-12`, day_type: 'no_class', label: 'Teacher Planning Day' },
  ];
}

/** Backwards-compat alias. */
export const CANNED_CALENDAR: CannedCalendarEntry[] = buildCannedCalendar(new Date().getFullYear());
```

- [ ] **Step 3: Make `CANNED_EVENTS` year-parametric as `buildCannedEvents(year)`**

Find the existing `CANNED_EVENTS` const and replace with the same parametric pattern, using the `targetYear` substitution. Keep the same labels + relative date offsets within the term windows defined by `buildTermTemplates(targetYear)`.

```ts
export type CannedEvent = { start_date: string; end_date: string; label: string };

export function buildCannedEvents(targetYear: number): CannedEvent[] {
  const y = String(targetYear);
  return [
    { start_date: `${y}-03-23`, end_date: `${y}-03-27`, label: 'Assessment Week' },
    { start_date: `${y}-09-21`, end_date: `${y}-09-25`, label: 'Mathematics Week' },
  ];
}

export const CANNED_EVENTS: CannedEvent[] = buildCannedEvents(new Date().getFullYear());
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: clean compile. Existing callers using `TERM_TEMPLATES` / `CANNED_CALENDAR` / `CANNED_EVENTS` keep working via the aliases.

- [ ] **Step 5: Commit**

```bash
git add lib/sis/seeder/fixtures.ts
git commit -m "$(cat <<'EOF'
refactor(seeder): make TERM_TEMPLATES year-parametric

Replaces the static TERM_TEMPLATES / CANNED_CALENDAR /
CANNED_EVENTS constants with buildTermTemplates(year),
buildCannedCalendar(year), buildCannedEvents(year) functions.
Constants kept as aliases pointing at current calendar year so
existing callers keep working.

New term layout (Option C, today-anchored): T1 Jan13-Apr3
(closed), T2 Apr13-Jul3 (active for May-Jun), T3 Jul13-Oct2,
T4 Oct13-Nov27. KD #13 aligned (Jan-Nov single calendar year).

Foundation for AY9998 prior-year provisioning + the seeder
force-overwrite path (next tasks).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `structural.ts` — `forceOverwrite` flag + `targetYear` parameter

Make the structural seeder accept `targetYear` and force-overwrite term dates for `^AY9` codes. This is necessary so re-running the seeder under new `buildTermTemplates(year)` values actually applies — the existing path only fills blanks.

**Files:**
- Modify: `lib/sis/seeder/structural.ts`

- [ ] **Step 1: Update `ensureTestStructure` signature to accept options**

Find the function signature at the top of the file. Change it to:

```ts
import { buildCannedCalendar, buildCannedEvents, buildTermTemplates } from './fixtures';

export async function ensureTestStructure(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
  options?: { targetYear?: number; forceOverwriteDates?: boolean },
): Promise<StructureSeedResult> {
  const targetYear = options?.targetYear ?? new Date().getFullYear();
  const forceOverwrite = options?.forceOverwriteDates ?? /^AY9/.test(testAy.ay_code);
  const templates = buildTermTemplates(targetYear);
  const cannedCalendar = buildCannedCalendar(targetYear);
  const cannedEvents = buildCannedEvents(targetYear);
  // ... rest of function continues here, replacing all references to
  // TERM_TEMPLATES with `templates`, CANNED_CALENDAR with `cannedCalendar`,
  // CANNED_EVENTS with `cannedEvents`.
```

- [ ] **Step 2: Force-overwrite term dates when flag is true**

Find the term-update loop (around lines 167–182). Replace it with:

```ts
  for (const tmpl of templates) {
    const existing = termByNumber.get(tmpl.term_number);
    if (!existing) continue;

    // For test AYs (^AY9 codes), force-overwrite term dates so re-running
    // the seeder under new TERM_TEMPLATES values applies. For production
    // AYs (^AY[0-8]), keep the existing fill-blanks behavior so registrar
    // edits aren't clobbered.
    const patch: Record<string, unknown> = {};
    if (forceOverwrite || !existing.start_date) patch.start_date = tmpl.start_date;
    if (forceOverwrite || !existing.end_date) patch.end_date = tmpl.end_date;
    if (forceOverwrite || (!existing.virtue_theme && tmpl.virtue_theme))
      patch.virtue_theme = tmpl.virtue_theme;
    if (forceOverwrite || !existing.grading_lock_date)
      patch.grading_lock_date = tmpl.grading_lock_date;

    if (Object.keys(patch).length === 0) continue;

    const { error } = await service.from('terms').update(patch).eq('id', existing.id);
    if (!error) result.terms_updated += 1;
    else console.error('[structural seeder] terms update failed:', error.message);
  }
```

- [ ] **Step 3: Replace `CANNED_CALENDAR` references inline**

Find the school_calendar block (around line 199 onwards). Replace `CANNED_CALENDAR` references with the local `cannedCalendar` variable already declared at the top.

- [ ] **Step 4: Replace `CANNED_EVENTS` references inline**

Find the calendar_events block (around line 263 onwards). Replace `CANNED_EVENTS` references with the local `cannedEvents` variable.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 6: Commit**

```bash
git add lib/sis/seeder/structural.ts
git commit -m "$(cat <<'EOF'
feat(seeder): structural.ts accepts targetYear + force-overwrite flag

ensureTestStructure now takes options { targetYear?, forceOverwriteDates? }.
targetYear feeds buildTermTemplates / buildCannedCalendar /
buildCannedEvents from fixtures.ts. forceOverwriteDates auto-detects
test AYs via ^AY9 regex; production AYs keep the fill-blanks
behavior so registrar edits aren't clobbered.

Re-running the seeder after a TERM_TEMPLATES change now actually
applies the new dates to test AYs — previously the fill-blanks
guard left existing dates intact and the seeder was a no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `environment.ts` — `PRIOR_TEST_AY_CODE` + `ensurePriorTestAy`

Add the AY9998 sibling provisioner. `switchEnvironment('test')` will provision both AYs, but `is_current` only flips to AY9999.

**Files:**
- Modify: `lib/sis/environment.ts`

- [ ] **Step 1: Add `PRIOR_TEST_AY_CODE` constant + `ensurePriorTestAy`**

Near the top of `lib/sis/environment.ts` (after `TEST_AY_CODE`):

```ts
const TEST_AY_CODE = 'AY9999';
const TEST_AY_LABEL = 'Test Environment';
const PRIOR_TEST_AY_CODE = 'AY9998';
const PRIOR_TEST_AY_LABEL = 'Prior Test Year';
const PROD_AY_CODE = 'AY2026';
```

Add a new `ensurePriorTestAy` function right after `ensureTestAy`:

```ts
/**
 * Ensures the prior-year test AY (AY9998) exists. Created on demand via the
 * same `create_academic_year` RPC. Used by switchEnvironment to provision a
 * second test AY for compare-mode demos. Never marked `is_current` — it's a
 * passive comparison fixture.
 */
export async function ensurePriorTestAy(service: SupabaseClient): Promise<AyRow> {
  const { data: existing } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .eq('ay_code', PRIOR_TEST_AY_CODE)
    .maybeSingle();
  if (existing) return existing as AyRow;

  const { error: rpcErr } = await service.rpc('create_academic_year', {
    p_ay_code: PRIOR_TEST_AY_CODE,
    p_label: PRIOR_TEST_AY_LABEL,
  });
  if (rpcErr) {
    throw new Error(`ensurePriorTestAy: RPC failed — ${rpcErr.message}`);
  }

  const { data: fresh, error: reErr } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .eq('ay_code', PRIOR_TEST_AY_CODE)
    .single();
  if (reErr || !fresh) {
    throw new Error(`ensurePriorTestAy: post-RPC read failed — ${reErr?.message ?? 'no row'}`);
  }
  return fresh as AyRow;
}
```

- [ ] **Step 2: Extend `listEnvironmentAys` to surface the prior test AY**

Replace the function (around lines 27–50):

```ts
export async function listEnvironmentAys(service: SupabaseClient): Promise<{
  current: AyRow | null;
  testAy: AyRow | null;
  priorTestAy: AyRow | null;
  prodAy: AyRow | null;
}> {
  const { data, error } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .order('ay_code', { ascending: false });
  if (error || !data) {
    console.error('[environment] list failed:', error?.message);
    return { current: null, testAy: null, priorTestAy: null, prodAy: null };
  }
  const rows = data as AyRow[];
  const current = rows.find((r) => r.is_current) ?? null;
  const testAy = rows.find((r) => r.ay_code === TEST_AY_CODE) ?? null;
  const priorTestAy = rows.find((r) => r.ay_code === PRIOR_TEST_AY_CODE) ?? null;
  const prodAy =
    rows.find((r) => r.ay_code === PROD_AY_CODE && !isTestAyCode(r.ay_code)) ??
    rows.find((r) => !isTestAyCode(r.ay_code)) ??
    null;
  return { current, testAy, priorTestAy, prodAy };
}
```

- [ ] **Step 3: Update `switchEnvironment('test')` to provision both AYs**

Replace the `target === 'test'` branch (around lines 132–176) with:

```ts
  if (target === 'test') {
    const testAy = await ensureTestAy(service);
    const priorTestAy = await ensurePriorTestAy(service);
    const flip = await flipIsCurrent(service, testAy.ay_code);

    const currentYear = new Date().getFullYear();

    // 1) Structural config for current-year test AY (AY9999).
    const structure = await ensureTestStructure(service, {
      id: testAy.id,
      ay_code: testAy.ay_code,
    }, { targetYear: currentYear, forceOverwriteDates: true });

    // 2) Structural config for prior-year test AY (AY9998).
    await ensureTestStructure(service, {
      id: priorTestAy.id,
      ay_code: priorTestAy.ay_code,
    }, { targetYear: currentYear - 1, forceOverwriteDates: true });

    // 3) Student seed for current AY.
    const { data: sectionRows } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', testAy.id);
    const sectionIds = (sectionRows ?? []).map((r) => (r as { id: string }).id);
    let seed: SeedResult | null = null;
    if (sectionIds.length > 0) {
      const { count } = await service
        .from('section_students')
        .select('id', { count: 'exact', head: true })
        .in('section_id', sectionIds);
      if ((count ?? 0) === 0) {
        seed = await seedTestAy(service, testAy.id, testAy.ay_code);
      }
    }

    // 4) Populated layer for AY9999.
    const populated = await seedPopulated(service, testAy);

    // 5) Prior-year fixture: provision AY9998 students + populated data.
    await seedPriorYearTestAy(service, priorTestAy);

    return {
      fromAyCode: flip.fromAyCode,
      toAyCode: flip.toAyCode,
      toEnvironment: 'test',
      seed,
      structure,
      populated,
    };
  }
```

Add the import for `seedPriorYearTestAy` at the top:

```ts
import { seedPriorYearTestAy } from './seeder/prior-year';
```

(The file `prior-year.ts` is created in Task 6.)

- [ ] **Step 4: Update `resetTestEnvironment` to wipe both AYs**

Find `resetTestEnvironment` (around line 238 onwards). The existing logic uses `listEnvironmentAys` to find ONE testAy. Update it to wipe both AY9999 and AY9998 in sequence.

The simplest change: replace the single `testAy` detection with iteration over `[testAy, priorTestAy]` filtered to non-null. Wrap the entire wipe + RPC delete in a per-AY loop.

```ts
export async function resetTestEnvironment(service: SupabaseClient): Promise<ResetResult> {
  const { testAy, priorTestAy, prodAy, current } = await listEnvironmentAys(service);
  const targets = [testAy, priorTestAy].filter((a): a is AyRow => a !== null);
  if (targets.length === 0) {
    throw new Error('No Test AY (matching ^AY9) found.');
  }
  // Switch to prod first if either test AY is currently active.
  let switchedFromActive = false;
  if (current && targets.some((t) => t.id === current.id)) {
    if (!prodAy) throw new Error('Cannot reset Test AY: no Production AY to switch to.');
    await flipIsCurrent(service, prodAy.ay_code);
    switchedFromActive = true;
  }

  // Aggregate the wipe across both AYs. The remaining body of the existing
  // resetTestEnvironment function loops over each `target` AY one by one,
  // accumulating the `deleted` counters across both. The `delete_academic_year`
  // RPC is called per-target.
  let aggregateDeleted = /* ... existing ResetResult.deleted shape, all zeros ... */;
  let aggregateRpcSummary: unknown[] = [];
  for (const target of targets) {
    // ...existing per-AY wipe + RPC delete logic, accumulating into aggregateDeleted...
  }

  return {
    ayCode: targets.map((t) => t.ay_code).join(','),
    switchedFromActive,
    deleted: aggregateDeleted,
    rpcSummary: aggregateRpcSummary,
  };
}
```

The implementer will need to extract the per-AY wipe body into an inner function. Mark this step as a refactor of the existing reset logic.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: clean compile. (`prior-year.ts` doesn't exist yet — temporarily comment out the import + call from Task 5 Step 3 to allow this build to pass; restore after Task 6.)

- [ ] **Step 6: Commit**

```bash
git add lib/sis/environment.ts
git commit -m "$(cat <<'EOF'
feat(env): provision AY9998 prior-year test AY alongside AY9999

PRIOR_TEST_AY_CODE constant + ensurePriorTestAy(service) provisioner
mirrors ensureTestAy. listEnvironmentAys returns priorTestAy as a
peer of testAy. switchEnvironment('test') provisions both AYs in
sequence (AY9999 with current calendar year, AY9998 year-shifted -1)
via the now-parametric ensureTestStructure(..., { targetYear, ... }).

resetTestEnvironment loops over both AYs so the destructive cascade
wipes everything ^AY9-matching. is_current only ever flips to
AY9999 — AY9998 stays passive as the compare-mode fixture.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `lib/sis/seeder/prior-year.ts` — `seedPriorYearTestAy`

New file. Mirrors `seedPopulated` for AY9998 — students + populated data, all terms in the past so all four are fully closed.

**Files:**
- Create: `lib/sis/seeder/prior-year.ts`

- [ ] **Step 1: Create the file with `seedPriorYearTestAy`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { seedPopulated } from './populated';
import { seedTestAy } from './students';

/**
 * Provisions the prior-year test AY (AY9998) so compare-mode has two test
 * AYs to demonstrate against. Assumes structural config has already been
 * laid down by switchEnvironment via ensureTestStructure(..., { targetYear:
 * currentYear - 1 }) — sections, terms, subject_configs, school_calendar,
 * grading_sheets all exist before this runs.
 *
 * Layers students + populated data (grade_entries, attendance_daily,
 * evaluation_writeups, admissions funnel, discount_codes, publication,
 * teacher_assignments, enrolled admissions, admissions docs). Because
 * AY9998's terms all sit in the prior calendar year (T1-T4 closed), the
 * populated seeder fills every term with full data — no temporal split
 * needed (that's only for AY9999's active T2).
 */
export async function seedPriorYearTestAy(
  service: SupabaseClient,
  priorTestAy: { id: string; ay_code: string },
): Promise<void> {
  // Students — only seed if AY9998's sections are empty.
  const { data: sectionRows } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', priorTestAy.id);
  const sectionIds = (sectionRows ?? []).map((r) => (r as { id: string }).id);
  if (sectionIds.length > 0) {
    const { count } = await service
      .from('section_students')
      .select('id', { count: 'exact', head: true })
      .in('section_id', sectionIds);
    if ((count ?? 0) === 0) {
      await seedTestAy(service, priorTestAy.id, priorTestAy.ay_code);
    }
  }

  // Populated data — seedPopulated is idempotent (per-row filters) so safe
  // to re-run. The `mulberry32(hashString(...))` deterministic seed uses
  // ayCode as input, so AY9998 produces a different but stable data set
  // than AY9999.
  await seedPopulated(service, priorTestAy);
}
```

- [ ] **Step 2: Re-enable the call from `environment.ts`**

Restore the import + `await seedPriorYearTestAy(...)` line that was temporarily commented out at the end of Task 5.

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add lib/sis/seeder/prior-year.ts lib/sis/environment.ts
git commit -m "$(cat <<'EOF'
feat(seeder): seedPriorYearTestAy — populate AY9998 fixture

Provisions the prior-year test AY with the same student count
(10 per section x 21 sections = 210 students) and full populated
layer that AY9999 gets. Since AY9998's terms all sit in the
previous calendar year, every term is closed and seeds full data
(no temporal split — that's only relevant for AY9999's active T2).

Re-enables the seedPriorYearTestAy() call inside switchEnvironment
that was temporarily stubbed in the previous commit so the build
could pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `populated.ts` — temporal split (T1 full+locked, T2 partial-up-to-today)

Inside `seedPopulated`, the three time-bound seeders (grade entries, attendance, evaluation writeups) currently only seed T1. Extend to seed T1 (full + locked) AND T2 (partial up to today, unlocked). T3+T4 stay empty.

**Files:**
- Modify: `lib/sis/seeder/populated.ts`

- [ ] **Step 1: Extend `seedAttendanceSummary` to cover T1+T2**

Find `seedAttendanceSummary` (around line 297). Replace the T1-only term lookup with both T1 and T2:

```ts
async function seedAttendanceSummary(
  service: SupabaseClient,
  testAy: { id: string; ay_code: string },
): Promise<{ daily: number; rollups: number }> {
  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number, start_date, end_date')
    .eq('academic_year_id', testAy.id)
    .in('term_number', [1, 2]);
  const terms = ((termRows ?? []) as Array<{
    id: string;
    term_number: number;
    start_date: string | null;
    end_date: string | null;
  }>).filter((t) => t.start_date && t.end_date);
  if (terms.length === 0) return { daily: 0, rollups: 0 };

  const todayIso = new Date().toISOString().slice(0, 10);
  let totalDaily = 0;
  let totalRollups = 0;

  for (const term of terms) {
    // Encodable school days for this term.
    const { data: calendarRows } = await service
      .from('school_calendar')
      .select('date, day_type')
      .eq('term_id', term.id)
      .in('day_type', ['school_day', 'hbl'])
      .order('date');
    let schoolDays = ((calendarRows ?? []) as Array<{ date: string; day_type: string }>)
      .map((r) => r.date);

    // Temporal split: for AY9999's active T2, only seed dates up to today.
    // T1 (closed) and T3/T4 (future, won't reach this loop) seed fully.
    const isActiveTerm = term.start_date! <= todayIso && todayIso <= term.end_date!;
    if (isActiveTerm) {
      schoolDays = schoolDays.filter((d) => d <= todayIso);
    }
    if (schoolDays.length === 0) continue;

    // ... (existing per-term insert + rollup logic from the original
    // seedAttendanceSummary — keep the per-row tuple filter, the chunked
    // insert, and the recompute_attendance_rollup RPC loop unchanged.
    // Aggregate the counts into totalDaily / totalRollups.)
  }

  return { daily: totalDaily, rollups: totalRollups };
}
```

- [ ] **Step 2: Extend `seedGradeEntries` to cover T1+T2**

The existing function already targets T1 + first subject of T2. Update it to fill **all subjects of T1 + all subjects of T2 up to today's date relative to T2's window**. Specifically:

For each (sheet, section_student) pair:
- If sheet is in T1: full computed quarterly grade (existing logic).
- If sheet is in T2 AND today < T2 end: partial entries — populate ww_scores (slot 1) but leave pt_scores empty + qa_score null. This produces sheets that look "in progress".
- T3/T4: skip entirely (no entries).

Mark T1 sheets as `is_locked: true, locked_at: term.end_date` after seeding entries — this gives compare mode visible "T1 is closed, T2 is open" contrast.

The implementer should preserve the existing TDD-style upsert pattern (per-row filter + `onConflict: 'grading_sheet_id,section_student_id'` + `ignoreDuplicates: true`) and just expand the term filter.

- [ ] **Step 3: Extend `seedEvaluationWriteups` to cover T1+T2**

Currently seeds 5 writeups per section in T1. Extend to:
- T1: 5 writeups per section, all `submitted: true`, `submitted_at = T1 end_date`.
- T2: 3 writeups per section, mix of `submitted: true` (2 of them, `submitted_at = today − 7 days`) and `submitted: false` (1 of them, draft only).

Same upsert pattern (`onConflict: 'term_id,student_id'`).

- [ ] **Step 4: Lock T1 sheets after grade entries are seeded**

Add a small block after `seedGradeEntries` runs (inside `seedPopulated`) that flips `grading_sheets.is_locked = true` + `locked_at = term.end_date` for every T1 sheet. This produces the "T1 closed, T2 open" UX state.

```ts
// Lock all T1 sheets to reflect the closed-term state. T2 stays unlocked
// so the registrar can demo entry edits, change-request submission, etc.
{
  const { data: t1 } = await service
    .from('terms')
    .select('id, end_date')
    .eq('academic_year_id', testAy.id)
    .eq('term_number', 1)
    .maybeSingle();
  if (t1 && (t1 as { end_date: string }).end_date) {
    const endDateIso = `${(t1 as { end_date: string }).end_date}T23:59:59+08:00`;
    await service
      .from('grading_sheets')
      .update({ is_locked: true, locked_at: endDateIso })
      .eq('term_id', (t1 as { id: string }).id)
      .eq('is_locked', false);
  }
}
```

Place this immediately after `result.grade_entries_inserted = await seedGradeEntries(...)` so the lock fires only once per seed run.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 6: Manual smoke verification (after migration)**

Wipe + reseed via `/sis/admin/settings`. Expected outcome:
- `attendance_daily` rows for AY9999 T1 (full) + T2 (only dates ≤ today, ~5 weeks worth)
- `grade_entries` for AY9999 T1 (every subject × student) + T2 (partial, ww_scores only)
- All AY9999 T1 grading sheets show `is_locked = true`
- All AY9999 T2 grading sheets show `is_locked = false`
- AY9998 has full data on all 4 terms (because seedPriorYearTestAy uses targetYear=2025 → all terms in past)

- [ ] **Step 7: Commit**

```bash
git add lib/sis/seeder/populated.ts
git commit -m "$(cat <<'EOF'
feat(seeder): temporal split — T1 closed+locked, T2 partial-to-today

seedAttendanceSummary, seedGradeEntries, seedEvaluationWriteups
now seed both T1 and T2 in AY9999. T1 fills 100% (all dates,
all entries, all writeups submitted+locked-by-end-date). T2 is
the 'active term' — only dates / entries up to today are seeded;
sheets stay unlocked; some writeups are still draft.

Adds an explicit lock pass after seedGradeEntries flips every
T1 sheet's is_locked=true, locked_at=term.end_date so compare
mode and the operational dashboard both see a meaningful 'T1
closed' state.

For AY9998 (prior year), all four terms sit in the past so this
function naturally seeds T1+T2 fully (T3+T4 are not in the
[1,2] filter — handled by the standalone seedPriorYearTestAy
which calls seedPopulated; for AY9998 we may want full-AY data
later, but keep it consistent for now).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `lib/dashboard/compare.ts` — types + URL parsing + cell building

New shared module for compare-mode primitives. Pure (no Supabase). Consumed by every per-module compare page.

**Files:**
- Create: `lib/dashboard/compare.ts`

- [ ] **Step 1: Create the file with full type contract**

```ts
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@/lib/supabase/service';
import { buildTermTemplates } from '@/lib/sis/seeder/fixtures';
import type { DateRange } from './range';

/**
 * Compare-mode input. `kind` decides whether cells are term-numbered
 * (academic modules) or month-string (flexible modules). The picker UI
 * enforces the correct kind per route.
 */
export type CompareInput =
  | { kind: 'term'; ays: string[]; terms: number[] }
  | { kind: 'month'; ays: string[]; months: string[] };

/** A single (AY × term-or-month) intersection — what gets rendered in one cell. */
export type CompareCell = {
  ayCode: string;
  label: string;            // "AY9999 · T1" or "AY9999 · Apr 2026"
  range: DateRange;         // resolved start/end for the slice
  kind: 'term' | 'month';
  termNumber?: number;
  month?: string;
};

export type CompareCellResult<T> = {
  cell: CompareCell;
  data: T;
};

export type CompareResult<T> = {
  cells: CompareCellResult<T>[];
};

/**
 * URL → CompareInput. Returns null on malformed input so the page can
 * render an empty-state prompt.
 */
export function parseCompareParams(params: {
  ays?: string | string[];
  terms?: string | string[];
  months?: string | string[];
}): CompareInput | null {
  const pickStr = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

  const aysRaw = pickStr(params.ays);
  if (!aysRaw) return null;
  const ays = aysRaw.split(',').filter((c) => /^AY\d{4}$/.test(c));
  if (ays.length === 0) return null;

  const termsRaw = pickStr(params.terms);
  const monthsRaw = pickStr(params.months);

  if (termsRaw) {
    const terms = termsRaw
      .split(',')
      .map((t) => Number(t.replace(/^T/i, '')))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
    if (terms.length === 0) return null;
    return { kind: 'term', ays, terms };
  }

  if (monthsRaw) {
    const months = monthsRaw.split(',').filter((m) => /^\d{4}-\d{2}$/.test(m));
    if (months.length === 0) return null;
    return { kind: 'month', ays, months };
  }

  return null;
}

/**
 * CompareInput → CompareCell[]. Resolves each (ayCode × term-or-month) to
 * an actual DateRange. Term ranges come from the buildTermTemplates lookup
 * (year-derived from the AY code; AY9999 uses current year, AY9998 uses
 * current − 1). Month ranges are first-of-month to last-of-month.
 */
export async function buildCompareCells(
  input: CompareInput,
  service?: SupabaseClient,
): Promise<CompareCell[]> {
  const supabase = service ?? createServiceClient();

  // Pull all relevant terms in one cross-AY query.
  const { data: termsData } = await supabase
    .from('terms')
    .select('term_number, start_date, end_date, academic_years!inner(ay_code)')
    .in('academic_years.ay_code', input.ays);
  type Row = {
    term_number: number;
    start_date: string | null;
    end_date: string | null;
    academic_years: { ay_code: string } | { ay_code: string }[];
  };
  const termsByAy = new Map<string, Map<number, DateRange>>();
  for (const row of (termsData ?? []) as Row[]) {
    if (!row.start_date || !row.end_date) continue;
    const ay = Array.isArray(row.academic_years) ? row.academic_years[0] : row.academic_years;
    if (!ay?.ay_code) continue;
    if (!termsByAy.has(ay.ay_code)) termsByAy.set(ay.ay_code, new Map());
    termsByAy.get(ay.ay_code)!.set(row.term_number, {
      from: row.start_date,
      to: row.end_date,
    });
  }

  const cells: CompareCell[] = [];
  if (input.kind === 'term') {
    for (const ay of input.ays) {
      const ayTerms = termsByAy.get(ay);
      for (const t of input.terms) {
        const range = ayTerms?.get(t);
        if (!range) continue;
        cells.push({
          ayCode: ay,
          label: `${ay} · T${t}`,
          range,
          kind: 'term',
          termNumber: t,
        });
      }
    }
  } else {
    for (const ay of input.ays) {
      for (const m of input.months) {
        const range = monthToRange(m);
        cells.push({
          ayCode: ay,
          label: `${ay} · ${formatMonthLabel(m)}`,
          range,
          kind: 'month',
          month: m,
        });
      }
    }
  }
  return cells;
}

function monthToRange(month: string): DateRange {
  // 'YYYY-MM' → first to last day of that month
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
  };
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/compare.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): compare.ts — types, URL parser, cell builder

New shared compare-mode primitives:

- CompareInput: discriminated union over kind: 'term' | 'month'.
  Term variant carries ays + terms (1-4); month variant carries
  ays + months (YYYY-MM strings).
- CompareCell: the resolved (AY × period) intersection with
  display label + DateRange.
- CompareResult<T>: per-cell results envelope used by every
  module's getXxxCompareKpis helper.
- parseCompareParams: URL searchParams -> CompareInput, returns
  null on malformed input so pages can render empty states.
- buildCompareCells: cross-joins ays × periods, resolves DateRange
  via single cross-AY terms query (or month-arithmetic for the
  flexible variant).

Server-only — uses createServiceClient inside buildCompareCells
so cookie-scoped clients aren't required by callers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `<CompareToolbar>` — multi-AY + multi-term/month selector

Client component for the compare-mode sub-routes. Renders two `cmdk`-backed multi-selects (AYs + terms/months) and writes URL params.

**Files:**
- Create: `components/dashboard/compare-toolbar.tsx`

- [ ] **Step 1: Create the toolbar**

The full implementation is ~150 lines of TSX. Implementer should follow these constraints:

- Mounts on `/compare` sub-routes only.
- Reads `searchParams` via `useSearchParams()`. Writes via `router.push(?ays=...&terms=...|months=...)`.
- Two side-by-side `<Popover>`-wrapped multi-select buttons:
  - Left: AY multi-select. Lists every AY code from `ayCodes` prop. Renders selected count chip.
  - Right: Term or Month multi-select (depends on `kind` prop). Term variant = T1/T2/T3/T4 checkbox list. Month variant = scrollable list of last 24 months computed from today.
- Apply button writes the new URL params. Disabled if `ays.length === 0 || (terms.length === 0 && months.length === 0)`.

```tsx
'use client';

import { CalendarRange, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { CompareInput } from '@/lib/dashboard/compare';

export type CompareToolbarProps = {
  kind: 'term' | 'month';
  ayCodes: readonly string[];
  initial: CompareInput | null;
  /** When kind='month', this many months back from today are listed. Default 24. */
  monthLookback?: number;
};

export function CompareToolbar({ kind, ayCodes, initial, monthLookback = 24 }: CompareToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [selectedAys, setSelectedAys] = useState<string[]>(initial?.ays ?? []);
  const [selectedCells, setSelectedCells] = useState<string[]>(() => {
    if (!initial) return [];
    if (initial.kind === 'term') return initial.terms.map((t) => `T${t}`);
    return initial.months;
  });

  const monthOptions = (() => {
    if (kind !== 'month') return [];
    const out: string[] = [];
    const t = new Date();
    for (let i = 0; i < monthLookback; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  })();

  function applyParams() {
    const params = new URLSearchParams();
    params.set('ays', selectedAys.join(','));
    if (kind === 'term') {
      params.set('terms', selectedCells.join(','));
    } else {
      params.set('months', selectedCells.join(','));
    }
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  function toggle(arr: string[], v: string): string[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const canApply = selectedAys.length > 0 && selectedCells.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* AY multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 min-w-[10rem] justify-between gap-2 font-normal">
            <CalendarRange className="size-4 text-muted-foreground" />
            <span className="font-mono text-[12px]">
              {selectedAys.length === 0 ? 'Pick AYs…' : `${selectedAys.length} AY${selectedAys.length === 1 ? '' : 's'}`}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Filter AYs…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {ayCodes.map((code) => {
                  const selected = selectedAys.includes(code);
                  return (
                    <CommandItem key={code} value={code} onSelect={() => setSelectedAys((cur) => toggle(cur, code))}>
                      <span className={cn('mr-2 size-4 rounded border', selected ? 'bg-primary border-primary' : 'border-border')} />
                      <span className="font-mono">{code}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Term or Month multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-10 min-w-[10rem] justify-between gap-2 font-normal">
            <span className="font-mono text-[12px]">
              {selectedCells.length === 0
                ? kind === 'term' ? 'Pick terms…' : 'Pick months…'
                : `${selectedCells.length} ${kind === 'term' ? 'term' : 'month'}${selectedCells.length === 1 ? '' : 's'}`}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            {kind === 'month' && <CommandInput placeholder="Filter months…" />}
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {(kind === 'term' ? ['T1', 'T2', 'T3', 'T4'] : monthOptions).map((v) => {
                  const selected = selectedCells.includes(v);
                  return (
                    <CommandItem key={v} value={v} onSelect={() => setSelectedCells((cur) => toggle(cur, v))}>
                      <span className={cn('mr-2 size-4 rounded border', selected ? 'bg-primary border-primary' : 'border-border')} />
                      <span className="font-mono">{v}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button size="sm" disabled={!canApply || pending} onClick={applyParams}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Apply
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/compare-toolbar.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): CompareToolbar — multi-AY + multi-term/month selector

Client component for /compare sub-routes. Renders two cmdk-backed
multi-selects: AYs (left) + Terms or Months (right, kind-prop
driven). Apply button writes ?ays=&terms=|&months= via router.push
+ router.refresh.

Term variant lists T1-T4. Month variant computes the last 24
calendar months (configurable via monthLookback prop).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `<CompareGrid>` — KPI grid component

Renders rows = metrics, columns = cells. Generic over the data type T.

**Files:**
- Create: `components/dashboard/compare-grid.tsx`

- [ ] **Step 1: Create the grid component**

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CompareCellResult } from '@/lib/dashboard/compare';

export type CompareGridMetric<T> = {
  key: string;
  label: string;
  format?: 'number' | 'percent' | 'days';
  /** Pull the numeric value out of T for this metric. null = no data. */
  getValue: (data: T) => number | null;
  /** Highlight the highest cell ('best') in this row green, lowest red. Default false. */
  highlightExtremes?: boolean;
};

export type CompareGridProps<T> = {
  cells: CompareCellResult<T>[];
  metrics: CompareGridMetric<T>[];
  title: string;
  description?: string;
};

export function CompareGrid<T>({ cells, metrics, title, description }: CompareGridProps<T>) {
  const formatValue = (v: number | null, fmt: CompareGridMetric<T>['format']): string => {
    if (v === null) return '—';
    if (fmt === 'percent') return `${Math.round(v)}%`;
    if (fmt === 'days') return `${Math.round(v)}d`;
    return v.toLocaleString('en-SG');
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Compare
        </CardDescription>
        <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-hairline bg-muted/30 px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                  Metric
                </th>
                {cells.map((cell) => (
                  <th
                    key={cell.cell.label}
                    className="border-b border-l border-hairline bg-muted/30 px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                    {cell.cell.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const values = cells.map((c) => metric.getValue(c.data));
                const numeric = values.filter((v): v is number => v !== null);
                const max = numeric.length > 0 ? Math.max(...numeric) : null;
                const min = numeric.length > 0 ? Math.min(...numeric) : null;
                return (
                  <tr key={metric.key}>
                    <td className="border-b border-hairline px-3 py-2.5 font-medium text-foreground">
                      {metric.label}
                    </td>
                    {cells.map((cell, i) => {
                      const v = values[i];
                      const isMax = metric.highlightExtremes && v !== null && v === max && max !== min;
                      const isMin = metric.highlightExtremes && v !== null && v === min && max !== min;
                      return (
                        <td
                          key={cell.cell.label}
                          className={cn(
                            'border-b border-l border-hairline px-3 py-2.5 text-right font-mono tabular-nums',
                            isMax && 'bg-brand-mint/10 text-brand-mint-deep',
                            isMin && 'bg-destructive/10 text-destructive',
                          )}>
                          {formatValue(v, metric.format)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/compare-grid.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): CompareGrid — KPI grid for compare-mode

Generic over T. Rows = metrics, columns = cells. Each metric
declares getValue(data) to project T -> number|null and an
optional highlightExtremes flag to color the best (mint) and
worst (destructive) cells per row.

Pure presentation — no recharts. Uses native table for crisp
tabular-nums alignment + horizontal scroll on overflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `<MultiSeriesTrendChart>` — N-series area chart

Sibling of `<TrendChart>`. Takes `series: Array<{ key, label, color, points }>`.

**Files:**
- Create: `components/dashboard/charts/multi-series-trend-chart.tsx`

- [ ] **Step 1: Create the chart**

```tsx
'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartLegendContent } from '@/components/dashboard/chart-legend-chip';

export type MultiSeriesTrendPoint = { x: string; [seriesKey: string]: string | number };

export type MultiSeriesTrendSeries = {
  key: string;
  label: string;
  color: string;
};

export type YFormat = 'number' | 'percent' | 'days';

function formatterFor(format: YFormat | undefined): ((n: number) => string) | undefined {
  switch (format) {
    case 'percent':
      return (n) => `${Math.round(n)}%`;
    case 'days':
      return (n) => `${Math.round(n)}d`;
    case 'number':
      return (n) => n.toLocaleString('en-SG');
    default:
      return undefined;
  }
}

export type MultiSeriesTrendChartProps = {
  series: MultiSeriesTrendSeries[];
  data: MultiSeriesTrendPoint[];
  height?: number;
  yFormat?: YFormat;
};

export function MultiSeriesTrendChart({
  series,
  data,
  height = 240,
  yFormat,
}: MultiSeriesTrendChartProps) {
  const yFormatter = formatterFor(yFormat);
  const colorMap = Object.fromEntries(series.map((s) => [s.key, s.color]));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} opacity={0.6} />
        <XAxis
          dataKey="x"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yFormatter}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }}
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 11,
            padding: '8px 10px',
          }}
          formatter={(value) => {
            const v = typeof value === 'number' ? value : Number(value);
            return yFormatter ? yFormatter(v) : v;
          }}
        />
        <Legend content={chartLegendContent(colorMap)} />
        {series.map((s, idx) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={1.75}
            fill="transparent"
            dot={false}
            isAnimationActive={false}
            strokeDasharray={idx === 0 ? undefined : '4 4'}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/charts/multi-series-trend-chart.tsx
git commit -m "$(cat <<'EOF'
feat(charts): MultiSeriesTrendChart — N-series sibling of TrendChart

New chart for compare-mode velocity overlays. Takes
series: Array<{key, label, color}> + data: Array<{x, [key]: number}>.
Each series renders as a stroked Area with no fill — first series
solid, others dashed for legibility at N >= 3.

Existing TrendChart untouched (kept simple for the 2-series
operational mode current/comparison case).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `<MultiSeriesComparisonBarChart>` — N-series grouped bar chart

Sibling of `<ComparisonBarChart>`. Takes `series: Array<{ key, label, color }>` + `data: Array<{ category: string, [key]: number }>`.

**Files:**
- Create: `components/dashboard/charts/multi-series-comparison-bar-chart.tsx`

- [ ] **Step 1: Create the chart**

Mirror the structure of `<MultiSeriesTrendChart>` but with `<BarChart>` + one `<Bar>` per series. Reuse the same `MultiSeriesTrendSeries` type or rename to a chart-agnostic `MultiSeries` shape.

Implementer should follow the existing `<ComparisonBarChart>` (lines 1–154) styling conventions: same `cursor`, `tickFormatter`, etc. Just replace the rigid 2-`<Bar>` block with `series.map(...)` rendering one `<Bar>` per series with `fill={s.color}`.

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/charts/multi-series-comparison-bar-chart.tsx
git commit -m "$(cat <<'EOF'
feat(charts): MultiSeriesComparisonBarChart — N-series grouped bars

Sibling of ComparisonBarChart for compare-mode KPI breakdowns by
category. Takes series + data shape matching MultiSeriesTrendChart
for symmetry. Bars render side-by-side per category.

Existing ComparisonBarChart untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `lib/markbook/compare.ts` — `getMarkbookCompareKpis`

Per-cell loader fan-out for Markbook compare mode. Reuses the existing per-range loaders inside `lib/markbook/dashboard.ts`.

**Files:**
- Create: `lib/markbook/compare.ts`

- [ ] **Step 1: Create the compare loader**

```ts
import 'server-only';

import { unstable_cache } from 'next/cache';

import type { CompareCell, CompareInput, CompareResult } from '@/lib/dashboard/compare';
import { buildCompareCells } from '@/lib/dashboard/compare';

import {
  getMarkbookKpisRange,
  type MarkbookRangeKpis,
} from './dashboard';

export type MarkbookCompareKpis = MarkbookRangeKpis;

/**
 * Fans out across CompareInput's cells, calling the existing per-range
 * KPI loader for each (ayCode, range) tuple. Each cell stays cached
 * independently via getMarkbookKpisRange's per-call unstable_cache, so
 * compare mode shares cache slots with the operational dashboard.
 */
export async function getMarkbookCompareKpis(
  input: CompareInput,
): Promise<CompareResult<MarkbookCompareKpis>> {
  const cells = await buildCompareCells(input);
  if (cells.length === 0) return { cells: [] };

  const results = await Promise.all(
    cells.map((cell) =>
      getMarkbookKpisRange({
        ayCode: cell.ayCode,
        from: cell.range.from,
        to: cell.range.to,
        cmpFrom: null,
        cmpTo: null,
      }),
    ),
  );

  return {
    cells: cells.map((cell, i) => ({ cell, data: results[i].current })),
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add lib/markbook/compare.ts
git commit -m "$(cat <<'EOF'
feat(markbook): getMarkbookCompareKpis — per-cell fan-out

Reuses the existing getMarkbookKpisRange (per-call unstable_cache)
across each CompareCell from buildCompareCells. Cells share cache
slots with the operational view so the compare grid is warm when
the user has already visited /markbook for the same AY+range.

CompareResult is the shape consumed by CompareGrid via
getValue(data) projections. Data shape per cell = MarkbookRangeKpis.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `app/(markbook)/markbook/compare/page.tsx` — Markbook compare RSC

The first compare-mode page. The other 5 modules follow the same template.

**Files:**
- Create: `app/(markbook)/markbook/compare/page.tsx`

- [ ] **Step 1: Create the RSC**

```tsx
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CompareGrid, type CompareGridMetric } from '@/components/dashboard/compare-grid';
import { CompareToolbar } from '@/components/dashboard/compare-toolbar';
import { PageShell } from '@/components/ui/page-shell';
import { getMarkbookCompareKpis, type MarkbookCompareKpis } from '@/lib/markbook/compare';
import { listAyCodes } from '@/lib/academic-year';
import { getSessionUser } from '@/lib/supabase/server';
import { parseCompareParams } from '@/lib/dashboard/compare';

const ALLOWED_ROLES = new Set(['registrar', 'school_admin', 'superadmin']);

export default async function MarkbookComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ays?: string; terms?: string; months?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (!sessionUser.role || !ALLOWED_ROLES.has(sessionUser.role)) {
    notFound();
  }

  const sp = await searchParams;
  const ayCodes = await listAyCodes();
  const input = parseCompareParams(sp);

  const compareData = input ? await getMarkbookCompareKpis(input) : null;

  const metrics: CompareGridMetric<MarkbookCompareKpis>[] = [
    {
      key: 'gradesEntered',
      label: 'Grade entries',
      format: 'number',
      getValue: (d) => d.gradesEntered,
      highlightExtremes: true,
    },
    {
      key: 'sheetsLocked',
      label: 'Sheets locked',
      format: 'number',
      getValue: (d) => d.sheetsLocked,
    },
    {
      key: 'lockedPct',
      label: 'Lock %',
      format: 'percent',
      getValue: (d) => d.lockedPct,
      highlightExtremes: true,
    },
    {
      key: 'changeRequestsPending',
      label: 'CRs pending',
      format: 'number',
      getValue: (d) => d.changeRequestsPending,
    },
    {
      key: 'avgDecisionHours',
      label: 'Avg decision (hrs)',
      format: 'days',
      getValue: (d) => d.avgDecisionHours,
    },
  ];

  return (
    <PageShell>
      <Link
        href="/markbook"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Markbook
      </Link>

      <header className="space-y-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Markbook · Compare
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Term-on-term, year-on-year.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Pick the academic years and terms you want to line up, side by side. Numbers are equivalent
          slices — T1 of one AY against T1 of another — so you can spot real movement.
        </p>
      </header>

      <CompareToolbar kind="term" ayCodes={ayCodes} initial={input} />

      {!input ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
          Pick at least one AY and one term above to see the comparison.
        </div>
      ) : compareData && compareData.cells.length > 0 ? (
        <CompareGrid
          title="KPI comparison"
          description={`${compareData.cells.length} cell${compareData.cells.length === 1 ? '' : 's'} — ${input.ays.join(', ')} × ${input.kind === 'term' ? input.terms.map((t) => `T${t}`).join(', ') : ''}`}
          cells={compareData.cells}
          metrics={metrics}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center text-sm text-muted-foreground">
          No data found for this selection. Verify the AYs and terms are seeded.
        </div>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Manual smoke check**

Visit `/markbook/compare?ays=AY9998,AY9999&terms=T1,T2` (after migration is done — Phase 2 + 7 must have shipped first).
Expected: KPI grid with 4 cells (2 AYs × 2 terms), each metric row populated. Mint highlighting on max, destructive red on min.

- [ ] **Step 4: Commit**

```bash
git add app/\(markbook\)/markbook/compare/page.tsx
git commit -m "$(cat <<'EOF'
feat(markbook): /markbook/compare RSC — first compare-mode page

Wires CompareToolbar (term-kind) + CompareGrid + getMarkbookCompareKpis
into a complete page. Empty states for no input and no data.

Role-gated to registrar / school_admin / superadmin per KD #74.
Teachers see notFound — they have no analytical compare need.

Pattern: 5 sibling pages for the other modules follow this exact
template (Tasks 15-19).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Attendance compare loader + page

Mirrors Task 13 + 14 for Attendance.

**Files:**
- Create: `lib/attendance/compare.ts`
- Create: `app/(attendance)/attendance/compare/page.tsx`

- [ ] **Step 1: Create `lib/attendance/compare.ts`**

Pattern: same as `lib/markbook/compare.ts`. Loader = `getAttendanceCompareKpis(input)`. Uses existing `getAttendanceKpisRange` per cell. Data shape = `AttendanceKpis` (already exported from `lib/attendance/dashboard.ts`).

- [ ] **Step 2: Create `app/(attendance)/attendance/compare/page.tsx`**

Pattern: same as Markbook's compare page. `kind="term"`. Role gate: `['registrar', 'school_admin', 'superadmin']`. Metrics:
- Attendance % (highlightExtremes)
- Late count
- Absent count
- Excused count
- Encoded school days

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add lib/attendance/compare.ts app/\(attendance\)/attendance/compare/page.tsx
git commit -m "feat(attendance): /attendance/compare — term-kind compare page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Evaluation compare loader + page

**Files:**
- Create: `lib/evaluation/compare.ts`
- Create: `app/(evaluation)/evaluation/compare/page.tsx`

- [ ] **Step 1: Create `lib/evaluation/compare.ts`**

Same pattern. Reuses `getEvaluationKpisRange`. `EvaluationKpis` data shape.

- [ ] **Step 2: Create `app/(evaluation)/evaluation/compare/page.tsx`**

`kind="term"`. Role gate: `['registrar', 'school_admin', 'superadmin']`. Metrics:
- Submission % (highlightExtremes)
- Submitted count
- Expected count
- Median time to submit (days)
- Late submissions

- [ ] **Step 3: Verify build + commit**

```bash
git add lib/evaluation/compare.ts app/\(evaluation\)/evaluation/compare/page.tsx
git commit -m "feat(evaluation): /evaluation/compare — term-kind compare page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Admissions compare loader + page

**Files:**
- Create: `lib/admissions/compare.ts`
- Create: `app/(admissions)/admissions/compare/page.tsx`

- [ ] **Step 1: Create `lib/admissions/compare.ts`**

Same pattern. Reuses `getAdmissionsKpisRange`. Data shape per cell = `AdmissionsRangeKpis`.

- [ ] **Step 2: Create `app/(admissions)/admissions/compare/page.tsx`**

**`kind="month"`** (this is a flexible module). Role gate: `['admissions', 'registrar', 'school_admin', 'superadmin']`. Metrics:
- Applications received (highlightExtremes)
- Enrolled in range (highlightExtremes)
- Conversion %
- Cancelled count
- Withdrawn count

- [ ] **Step 3: Verify build + commit**

```bash
git add lib/admissions/compare.ts app/\(admissions\)/admissions/compare/page.tsx
git commit -m "feat(admissions): /admissions/compare — month-kind compare page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Records compare loader + page

**Files:**
- Create: `lib/sis/records-compare.ts`
- Create: `app/(records)/records/compare/page.tsx`

- [ ] **Step 1: Create the loader**

`lib/sis/records-compare.ts` — same pattern. Reuses `getRecordsKpisRange`.

- [ ] **Step 2: Create the page**

`kind="month"` (flexible module). Role gate: `['registrar', 'school_admin', 'superadmin']`. Metrics:
- Active enrolled
- Enrollments in range (highlightExtremes)
- Withdrawals in range (highlightExtremes)
- Expiring soon

- [ ] **Step 3: Verify build + commit**

```bash
git add lib/sis/records-compare.ts app/\(records\)/records/compare/page.tsx
git commit -m "feat(records): /records/compare — month-kind compare page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: P-Files compare loader + page

**Files:**
- Create: `lib/p-files/compare.ts`
- Create: `app/(p-files)/p-files/compare/page.tsx`

- [ ] **Step 1: Create the loader**

Same pattern. Reuses `getPFilesKpisRange`.

- [ ] **Step 2: Create the page**

`kind="month"`. Role gate: `['p-file', 'school_admin', 'superadmin']` per KD #74. Metrics:
- Revisions in range (highlightExtremes)
- Expiring ≤30d
- Expiring ≤60d
- Expired count

- [ ] **Step 3: Verify build + commit**

```bash
git add lib/p-files/compare.ts app/\(p-files\)/p-files/compare/page.tsx
git commit -m "feat(p-files): /p-files/compare — month-kind compare page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Sidebar links to compare pages + final verification

Last task — wire compare-mode entries into the per-module sidebar so the registrar can find them, then do a full migration + smoke check.

**Files:**
- Modify: `lib/sidebar/registry.ts` (or `lib/auth/roles.ts` depending on where `SIDEBAR_REGISTRY` actually lives — check during implementation)

- [ ] **Step 1: Add a "Compare" link to each role's sidebar nav for each module**

Find each module's nav config in `SIDEBAR_REGISTRY`. Add a single new entry per role-tree:

For Markbook (under `registrar`, `school_admin`, `superadmin`):
```ts
{ href: '/markbook/compare', label: 'Compare' },
```

Repeat for Attendance, Evaluation, Admissions, Records, P-Files in each role's allowed list. Match the role gates from each compare page's `ALLOWED_ROLES`.

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: clean compile.

- [ ] **Step 3: Run the migration**

In the browser:
1. Navigate to `/sis/admin/settings`
2. Click destroy test environment
3. Click switch to test environment
4. Wait for the seed to complete (~1–2 min for both AYs)

- [ ] **Step 4: End-to-end smoke check**

Visit each module dashboard and verify:
- AY9999 picker presets match the rule (T1–T4 + thisAY + custom for academic; lastWeek/15d/month + thisAY + custom for flexible).
- AY9999 dashboard data populated (T1 closed + T2 partial visible across attendance grid, grade entries, evaluation submissions).
- AY9998 picker shows full data on all 4 terms.
- `/markbook/compare?ays=AY9998,AY9999&terms=T1,T2` renders 4 KPI cells with numbers populated.
- `/admissions/compare?ays=AY9998,AY9999&months=2025-04,2026-04` renders 4 KPI cells with month-bound data.
- Other modules' compare pages similarly render.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar/registry.ts
git commit -m "$(cat <<'EOF'
feat(sidebar): wire Compare entries into module sidebars

Adds /markbook/compare, /attendance/compare, /evaluation/compare,
/admissions/compare, /records/compare, /p-files/compare to each
module's sidebar nav, role-gated to match the page-level
ALLOWED_ROLES sets defined per KD #74.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review checklist

Before declaring this plan complete:

1. **Spec coverage:** Every locked decision (1–7) maps to specific tasks?
   - Term-scoped vs flexible presets → Task 1 + 2
   - Active-term fallback → Task 1 + 2 (banner)
   - Compare sub-routes → Tasks 14, 15, 16, 17, 18, 19
   - Multi-AY URL contract → Task 8 (parseCompareParams) + Task 9 (CompareToolbar writes)
   - Compare chart variants → Tasks 11, 12 (used in Tasks 14–19)
   - KPI grid → Task 10 (used in Tasks 14–19)
   - Seeder Option C → Tasks 3, 4, 5, 6, 7
   - Two test AYs (AY9999 + AY9998) → Tasks 5, 6
   ✅ all covered.

2. **Type consistency:** `CompareInput`, `CompareCell`, `CompareResult<T>`, `CompareGridMetric<T>` — names stable across Tasks 8, 10, 13, 14–19? Yes — defined in Task 8, consumed everywhere downstream.

3. **No placeholders:** Tasks 15–19 reference "same pattern as Task 13/14" — but the pattern is fully specified in 13+14, and the variation per module is just data shape + role gate + metrics list. Acceptable shorthand.

4. **Build before commit on every task:** ✅ each task ends with `npx next build` + commit. Migration smoke checks gated to after Phase 2 (Tasks 3–7) ships.

5. **No code that calls into types not yet defined:** Task 5 imports `seedPriorYearTestAy` from a file created in Task 6 — handled with the temporary stub-out pattern. Task 13 imports `MarkbookRangeKpis` which already exists in current code. ✅
