# AY-scope hardening + unsynced-student visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every operational module surface respects the current AY, then promote the "unsynced enrolled student" signal from a quiet chip to a full Alert banner on the Records dashboard + student list so the registrar can't miss it during demo.

**Architecture:** Two phases. Phase A is a read-only audit confirming the AY-bound queries already scope correctly (the bug class was just sidebar badges — fixed earlier today). Phase B replaces the small amber chip on `/records` with a `<Alert variant="warning">` carrying a "Review queue" CTA, and adds the same banner above the `/records/students` table.

**Tech Stack:** Next.js 16 App Router RSC, shadcn `<Alert>` primitive, existing `lib/sis/unsynced-students.ts::countUnsyncedEnrolledStudents` loader (already AY-scoped + `unstable_cache`d with `sis:${ayCode}` tag).

**Verification model:** No unit-test infrastructure in this repo per `.claude/rules/workflow.md`. Each task ends with `npx next build` (clean compile required) + a manual browser-path verification.

---

## Phase A — AY-scope audit

### Task A1: Sweep the high-risk queries

**Files:** none modified — produces a paragraph of findings the spec references.

- [ ] **Step 1: Grep every `from('grade_change_requests')` / `from('grading_sheets')` / `from('grade_entries')` / `from('attendance_daily')` / `from('evaluation_writeups')` / `from('evaluation_checklist_items')` / `from('evaluation_checklist_responses')` / `from('school_calendar')` / `from('calendar_events')` / `from('report_card_publications')` call across `app/` and `lib/`.**

```
Use the Grep tool, pattern: from\(.(grade_change_requests|grading_sheets|grade_entries|attendance_daily|evaluation_writeups|evaluation_checklist_items|evaluation_checklist_responses|school_calendar|calendar_events|report_card_publications).\)
```

- [ ] **Step 2: For each hit, read the surrounding 30 lines and classify.**

Each call must satisfy at least one of:

- Filters by AY via section/term join (`.eq('...academic_year_id', currentAyId)` on an inner join, OR `.eq('term_id', termId)` where `termId` was resolved from the current AY).
- Is keyed on a record-level identifier whose AY is already constrained (e.g. `.eq('grading_sheet_id', sheetId)` where the sheet was fetched in an AY-scoped query upstream).
- Is intentionally cross-AY: Records via `studentNumber` (KD #4), `/records/movements?scope=all`, audit-log timeline, parent portal cross-AY publication list (KD #65), `/admissions/upcoming` (KD #77).

- [ ] **Step 3: Record findings in the plan as a comment block.**

If 0 leaks: append a paragraph at the bottom of this task confirming the sweep. If ≥1 leak: open a sub-task A2/A3/… with the file path, line range, and the AY filter to add.

- [ ] **Step 4: Commit the spec + plan if any new files; otherwise skip.**

```bash
git add docs/superpowers/specs/2026-05-14-ay-scope-and-unsynced-visibility.md docs/superpowers/plans/2026-05-14-ay-scope-and-unsynced-visibility.md
git commit -m "docs: spec + plan for AY-scope audit + unsynced visibility pass"
```

---

## Phase B — Unsynced visibility, loud edition

### Task B1: Replace dashboard chip with Alert banner (operational)

**Files:**

- Modify: `app/(records)/records/page.tsx:182-191` (the existing amber `<Link>` chip)

- [ ] **Step 1: Read the current chip block.**

Existing code at lines 182-191:

```tsx
{
  unsyncedCount > 0 && isCurrentAy && (
    <Link
      href="/records/unsynced"
      className="inline-flex items-center gap-2 self-start rounded-full border border-brand-amber/40 bg-gradient-to-b from-brand-amber/15 to-brand-amber/5 px-3 py-1 text-sm font-medium text-brand-amber transition-colors hover:bg-brand-amber/20"
    >
      <AlertTriangle className="size-3.5" />
      {unsyncedCount.toLocaleString('en-SG')} student
      {unsyncedCount === 1 ? '' : 's'} without a class section — review
    </Link>
  );
}
```

- [ ] **Step 2: Add the Alert + Button imports if not present.**

Verify the page already imports from `@/components/ui/alert`. If not, add:

```tsx
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
```

(The eval-checklist page is the reference for the `<Alert variant="warning">` import shape.)

- [ ] **Step 3: Replace the chip with the operational Alert banner; keep the chip for non-operational roles.**

Replace lines 182-191 with:

```tsx
{
  unsyncedCount > 0 && isCurrentAy && isOperational && (
    <Alert variant="warning">
      <AlertIcon variant="warning">
        <AlertTriangle className="size-4" />
      </AlertIcon>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-0.5">
          <AlertTitle>
            {unsyncedCount.toLocaleString('en-SG')} enrolled student
            {unsyncedCount === 1 ? '' : 's'} without a class section
          </AlertTitle>
          <AlertDescription>
            Grading and attendance can&rsquo;t reach them until a section is
            assigned.
          </AlertDescription>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="self-start sm:self-auto"
        >
          <Link href="/records/unsynced">Review queue</Link>
        </Button>
      </div>
    </Alert>
  );
}
{
  unsyncedCount > 0 && isCurrentAy && !isOperational && (
    <Link
      href="/records/unsynced"
      className="inline-flex items-center gap-2 self-start rounded-full border border-brand-amber/40 bg-gradient-to-b from-brand-amber/15 to-brand-amber/5 px-3 py-1 text-sm font-medium text-brand-amber transition-colors hover:bg-brand-amber/20"
    >
      <AlertTriangle className="size-3.5" />
      {unsyncedCount.toLocaleString('en-SG')} student
      {unsyncedCount === 1 ? '' : 's'} without a class section — review
    </Link>
  );
}
```

- [ ] **Step 4: Run `npx next build`.**

```bash
npx next build
```

Expected: clean compile, all routes listed.

- [ ] **Step 5: Manual verification.**

Open `/records` as the registrar in the test AY9999. If there is an unsynced student in the seed, the Alert banner appears between the hero and the comparison toolbar with the "Review queue" button routing to `/records/unsynced`. Open the same URL as a school_admin — the small chip renders instead (oversight view).

- [ ] **Step 6: Commit.**

```bash
git add app/(records)/records/page.tsx
git commit -m "feat(records): promote unsynced-students chip to Alert banner for operational role"
```

---

### Task B2: Add banner above the Records student list

**Files:**

- Modify: `app/(records)/records/students/page.tsx` — insert a banner between the hero `</header>` and the `<section>` containing the summary stats.

- [ ] **Step 1: Add the imports.**

At the top of the file alongside the existing imports:

```tsx
import { AlertTriangle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { countUnsyncedEnrolledStudents } from '@/lib/sis/unsynced-students';
```

(`Link` and `AlertTriangle` may already be imported — leave existing imports alone.)

- [ ] **Step 2: Compute the count once, alongside the existing `Promise.all`.**

Find the existing line:

```tsx
const [allStudents, summary] = await Promise.all([
  listStudents(selectedAy, 'name_asc'),
  getSisDashboardSummary(selectedAy),
]);
```

Replace with:

```tsx
const [allStudents, summary, unsyncedCount] = await Promise.all([
  listStudents(selectedAy, 'name_asc'),
  getSisDashboardSummary(selectedAy),
  countUnsyncedEnrolledStudents(selectedAy),
]);
const isOperational = sessionUser.role === 'registrar';
```

- [ ] **Step 3: Insert the banner after the hero `</header>`.**

The hero block ends with `</header>` around line 122 (before the `{/* Summary stats */}` section). Insert immediately after the closing tag:

```tsx
{
  unsyncedCount > 0 && isCurrentAy && isOperational && (
    <Alert variant="warning">
      <AlertIcon variant="warning">
        <AlertTriangle className="size-4" />
      </AlertIcon>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-0.5">
          <AlertTitle>
            {unsyncedCount.toLocaleString('en-SG')} enrolled student
            {unsyncedCount === 1 ? '' : 's'} not in this list
          </AlertTitle>
          <AlertDescription>
            They&rsquo;re enrolled in admissions but don&rsquo;t yet have a
            class section, so they&rsquo;re stranded outside grading and
            attendance.
          </AlertDescription>
        </div>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="self-start sm:self-auto"
        >
          <Link href="/records/unsynced">Review queue</Link>
        </Button>
      </div>
    </Alert>
  );
}
```

The wording deliberately reframes the count for the list page: "X students not in this list" makes the gap concrete to a registrar who's scanning the roster and expects to see everyone enrolled.

- [ ] **Step 4: Run `npx next build`.**

```bash
npx next build
```

Expected: clean compile.

- [ ] **Step 5: Manual verification.**

Open `/records/students` as the registrar in the test AY9999. The banner appears below the hero, above the summary-stats grid. Clicking "Review queue" navigates to `/records/unsynced`. As a school_admin, no banner renders.

- [ ] **Step 6: Commit.**

```bash
git add app/(records)/records/students/page.tsx
git commit -m "feat(records): banner above student list when unsynced students exist"
```

---

## Self-Review

Spec coverage:

- Phase A (audit) → Task A1.
- Phase B (Records dashboard banner) → Task B1.
- Phase B (Records list banner) → Task B2.
- Sidebar badge (no change) → covered by spec non-goals.

Placeholder scan: no `TBD` / `TODO` / "implement later". Every code block is complete drop-in JSX.

Type consistency: `Alert` / `AlertIcon` / `AlertTitle` / `AlertDescription` are the named exports from `components/ui/alert.tsx` (verified by reading the eval-checklist page that uses the same imports). `countUnsyncedEnrolledStudents(ayCode: string): Promise<number>` is the existing loader.

Acceptance criteria from spec:

- Dashboard banner for registrar when count > 0 and current AY ✓ (B1).
- Students list banner same gate ✓ (B2).
- Sidebar badge unchanged ✓.
- `npx next build` clean ✓ (verification step in B1 + B2).
