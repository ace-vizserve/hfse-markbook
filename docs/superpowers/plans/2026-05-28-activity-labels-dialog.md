# Activity Labels Edit Dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Activity Labels" button to the grading sheet header that opens a dialog for teachers (unlocked sheets) and registrar+ (always) to fill in Description, Page#, and Date Administered for each WW/PT slot, and Description for QA.

**Architecture:** New `ActivityLabelsDialog` client component placed in the header (mirrors `TotalsEditor` pattern). Calls the existing PATCH route at `/api/grading-sheets/[id]/labels`, which gains a teacher-lock guard and audit logging. On save, `router.refresh()` re-fetches the RSC; a new `useEffect` in `ScoreEntryGrid` syncs the local labels state from the refreshed prop so the Activity Guide panel reflects the update immediately.

**Tech stack:** Next.js 16 App Router · React `useState`/`useEffect` · shadcn `Dialog`/`Button`/`Input` · `DatePicker` from `components/ui/date-picker.tsx` (KD #44) · `useRouter` from `next/navigation` · `toast` from `sonner` (sileo shim, KD #58) · `logAction` from `lib/audit/log-action.ts`.

---

## File Map

| File                                            | Action     | Responsibility                                                                                      |
| ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `components/grading/score-entry-grid.tsx`       | Modify     | Remove duplicate local `SlotMeta`/`SlotLabels` types; import from schema; add `useEffect` prop sync |
| `lib/audit/log-action.ts`                       | Modify     | Add `'sheet.labels.update'` to `AuditAction` union                                                  |
| `app/api/grading-sheets/[id]/labels/route.ts`   | Modify     | Add teacher lock guard + `logAction` call                                                           |
| `app/(markbook)/markbook/audit-log/page.tsx`    | Modify     | Add `'sheet.labels.update'` to `MARKBOOK_AUDIT_ALLOWLIST`                                           |
| `components/grading/activity-labels-dialog.tsx` | **Create** | Dialog component — form, PATCH, router.refresh                                                      |
| `app/(markbook)/markbook/grading/[id]/page.tsx` | Modify     | Import and render `ActivityLabelsDialog` in header                                                  |

---

## Task 1 — Fix duplicate type definitions in ScoreEntryGrid

`score-entry-grid.tsx` defines `SlotMeta` (lines 55–59) and `SlotLabels` (lines 61–65) locally. Identical types already exist in `lib/schemas/grading-sheet.ts`. Remove the duplicates and import from the schema.

**Files:**

- Modify: `components/grading/score-entry-grid.tsx`

- [ ] **Step 1: Remove local type definitions and add schema import**

In `components/grading/score-entry-grid.tsx`, replace the local type block (currently after the `GradeRow` type, around line 55):

```typescript
// REMOVE these two local type definitions:
export type SlotMeta = {
  label?: string | null;
  date?: string | null;
  page?: string | null;
};

export type SlotLabels = {
  ww?: (SlotMeta | null)[];
  pt?: (SlotMeta | null)[];
  qa?: string | null;
};
```

Add this import at the top of the file, after the existing `lucide-react` import:

```typescript
import type { SlotMeta, SlotLabels } from '@/lib/schemas/grading-sheet';
```

The file imports are currently:

```typescript
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
```

After edit:

```typescript
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SlotMeta, SlotLabels } from '@/lib/schemas/grading-sheet';
```

- [ ] **Step 2: Verify TypeScript is clean**

```powershell
npx tsc --noEmit
```

Expected: no errors. `SlotMeta` and `SlotLabels` from the schema are structurally identical to the removed local types.

- [ ] **Step 3: Commit**

```powershell
git add components/grading/score-entry-grid.tsx
git commit -m "refactor(grading): import SlotMeta/SlotLabels from schema, remove duplicates"
```

---

## Task 2 — Add AuditAction entry + harden the PATCH route

Add `'sheet.labels.update'` to the audit enum, then update the PATCH route with (a) a teacher-lock guard and (b) an audit log call.

**Files:**

- Modify: `lib/audit/log-action.ts`
- Modify: `app/api/grading-sheets/[id]/labels/route.ts`

- [ ] **Step 1: Add AuditAction entry**

In `lib/audit/log-action.ts`, insert `'sheet.labels.update'` into the `AuditAction` union after `'sheet.lock_overdue_batch'` (currently line 13):

```typescript
  | 'sheet.lock_overdue_batch'
  | 'sheet.labels.update'       // ← add this line
  | 'entry.update'
```

- [ ] **Step 2: Add `logAction` import to the PATCH route**

In `app/api/grading-sheets/[id]/labels/route.ts`, the current imports are:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import type { SlotMeta } from '@/lib/schemas/grading-sheet';
```

Add `logAction` import:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import type { SlotMeta } from '@/lib/schemas/grading-sheet';
import { logAction } from '@/lib/audit/log-action';
```

- [ ] **Step 3: Add `is_locked` to the teacher-path sheet query**

In the teacher ownership check block (starting around line 45), the current select is:

```typescript
const { data: sheetRaw } = await supabase
  .from('grading_sheets')
  .select('id, section:sections(id), subject:subjects(id)')
  .eq('id', id)
  .single();
```

Add `is_locked` to the select:

```typescript
const { data: sheetRaw } = await supabase
  .from('grading_sheets')
  .select('id, is_locked, section:sections(id), subject:subjects(id)')
  .eq('id', id)
  .single();
```

Then update the cast immediately below `if (!sheetRaw)` to include `is_locked`:

```typescript
// current:
const sheet = sheetRaw as unknown as { section: IdRow; subject: IdRow };

// replace with:
const sheet = sheetRaw as unknown as {
  is_locked: boolean;
  section: IdRow;
  subject: IdRow;
};
```

- [ ] **Step 4: Add lock guard after the assignment check**

The assignment check block ends with:

```typescript
if (!assignment) {
  return NextResponse.json(
    { error: 'not assigned to this sheet' },
    { status: 403 }
  );
}
```

Immediately after that closing brace (still inside the `if (!isManager)` block), add:

```typescript
if (sheet.is_locked) {
  return NextResponse.json({ error: 'sheet is locked' }, { status: 423 });
}
```

The full teacher block now reads:

```typescript
if (!isManager) {
  const supabase = await createClient();
  const { data: sheetRaw } = await supabase
    .from('grading_sheets')
    .select('id, is_locked, section:sections(id), subject:subjects(id)')
    .eq('id', id)
    .single();
  if (!sheetRaw) {
    return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
  }
  type IdRow = { id: string } | { id: string }[] | null;
  const sheet = sheetRaw as unknown as {
    is_locked: boolean;
    section: IdRow;
    subject: IdRow;
  };
  const sectionRaw = Array.isArray(sheet.section)
    ? sheet.section[0]
    : sheet.section;
  const subjectRaw = Array.isArray(sheet.subject)
    ? sheet.subject[0]
    : sheet.subject;
  const sectionId = sectionRaw?.id;
  const subjectId = subjectRaw?.id;
  if (!sectionId || !subjectId) {
    return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
  }
  const { data: assignment } = await supabase
    .from('teacher_assignments')
    .select('id')
    .eq('teacher_user_id', auth.user.id)
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('role', 'subject_teacher')
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json(
      { error: 'not assigned to this sheet' },
      { status: 403 }
    );
  }
  if (sheet.is_locked) {
    return NextResponse.json({ error: 'sheet is locked' }, { status: 423 });
  }
}
```

- [ ] **Step 5: Add audit log call before the return**

The current end of the route:

```typescript
if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

return NextResponse.json({ ok: true, slot_labels: merged });
```

Replace with:

```typescript
if (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

await logAction({
  service,
  actor: { id: auth.user.id, email: auth.user.email ?? null },
  action: 'sheet.labels.update',
  entityType: 'grading_sheet',
  entityId: id,
});

return NextResponse.json({ ok: true, slot_labels: merged });
```

- [ ] **Step 6: Verify TypeScript is clean**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add lib/audit/log-action.ts app/api/grading-sheets/[id]/labels/route.ts
git commit -m "feat(labels): teacher lock guard + audit logging on PATCH labels route"
```

---

## Task 3 — Update markbook audit-log allowlist

Add `'sheet.labels.update'` to `MARKBOOK_AUDIT_ALLOWLIST` so the action appears in the markbook audit log.

**Files:**

- Modify: `app/(markbook)/markbook/audit-log/page.tsx`

- [ ] **Step 1: Add to allowlist**

In `app/(markbook)/markbook/audit-log/page.tsx`, the `MARKBOOK_AUDIT_ALLOWLIST` array currently starts:

```typescript
const MARKBOOK_AUDIT_ALLOWLIST = [
  'sheet.create',
  'sheet.bulk_create',
  'sheet.lock',
  'sheet.unlock',
  'sheet.unlock_force_with_pending_crs',
  'sheet.unlock_force_deadline_passed',
  'sheet.lock_overdue_batch',
  'entry.update',
```

Add `'sheet.labels.update'` after `'sheet.lock_overdue_batch'`:

```typescript
const MARKBOOK_AUDIT_ALLOWLIST = [
  'sheet.create',
  'sheet.bulk_create',
  'sheet.lock',
  'sheet.unlock',
  'sheet.unlock_force_with_pending_crs',
  'sheet.unlock_force_deadline_passed',
  'sheet.lock_overdue_batch',
  'sheet.labels.update',
  'entry.update',
```

- [ ] **Step 2: Verify TypeScript is clean**

```powershell
npx tsc --noEmit
```

Expected: no errors. The `as const` on the array infers literal types; `'sheet.labels.update'` is now in the `AuditAction` union so the element is valid.

- [ ] **Step 3: Commit**

```powershell
git add "app/(markbook)/markbook/audit-log/page.tsx"
git commit -m "feat(audit): add sheet.labels.update to markbook audit-log allowlist"
```

---

## Task 4 — Build ActivityLabelsDialog component

New client component that renders the trigger button and the dialog form.

**Files:**

- Create: `components/grading/activity-labels-dialog.tsx`

- [ ] **Step 1: Create the component**

Create `components/grading/activity-labels-dialog.tsx` with the full content below:

```typescript
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { SlotLabels, SlotMeta } from '@/lib/schemas/grading-sheet';

type DraftMeta = { label: string; page: string; date: string };

function metaToDraft(m: SlotMeta | null | undefined): DraftMeta {
  return { label: m?.label ?? '', page: m?.page ?? '', date: m?.date ?? '' };
}

function draftToMeta(d: DraftMeta): SlotMeta {
  return {
    label: d.label.trim() || null,
    page: d.page.trim() || null,
    date: d.date || null,
  };
}

const COL_HEADER_CLASS =
  'pb-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

export function ActivityLabelsDialog({
  sheetId,
  wwCount,
  ptCount,
  initialLabels,
}: {
  sheetId: string;
  wwCount: number;
  ptCount: number;
  initialLabels: SlotLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wwDraft, setWwDraft] = useState<DraftMeta[]>([]);
  const [ptDraft, setPtDraft] = useState<DraftMeta[]>([]);
  const [qaDraft, setQaDraft] = useState('');

  function openDialog() {
    setWwDraft(
      Array.from({ length: wwCount }, (_, i) =>
        metaToDraft((initialLabels.ww ?? [])[i])
      )
    );
    setPtDraft(
      Array.from({ length: ptCount }, (_, i) =>
        metaToDraft((initialLabels.pt ?? [])[i])
      )
    );
    setQaDraft(initialLabels.qa ?? '');
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/grading-sheets/${sheetId}/labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ww: wwDraft.map(draftToMeta),
          pt: ptDraft.map(draftToMeta),
          qa: qaDraft.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success('Activity labels saved.');
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save labels.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Activity Labels
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">
              Activity Labels
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={`w-14 ${COL_HEADER_CLASS}`}>Slot</th>
                  <th className={COL_HEADER_CLASS}>Description</th>
                  <th className={`w-24 ${COL_HEADER_CLASS}`}>Page #</th>
                  <th className={`w-40 ${COL_HEADER_CLASS}`}>Date</th>
                </tr>
              </thead>
              <tbody>
                {/* Written Work section */}
                {wwCount > 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="pb-1 pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      Written Work
                    </td>
                  </tr>
                )}
                {wwDraft.map((d, i) => (
                  <tr key={`ww-${i}`} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-muted-foreground">
                      W{i + 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={d.label}
                        onChange={(e) => {
                          const next = [...wwDraft];
                          next[i] = { ...next[i], label: e.target.value };
                          setWwDraft(next);
                        }}
                        placeholder="e.g. Worksheet 2: Multiplication Tables"
                        className="h-8 text-sm"
                        maxLength={120}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={d.page}
                        onChange={(e) => {
                          const next = [...wwDraft];
                          next[i] = { ...next[i], page: e.target.value };
                          setWwDraft(next);
                        }}
                        placeholder="—"
                        className="h-8 text-sm"
                        maxLength={40}
                      />
                    </td>
                    <td className="py-1.5">
                      <DatePicker
                        value={d.date}
                        onChange={(date) => {
                          const next = [...wwDraft];
                          next[i] = { ...next[i], date };
                          setWwDraft(next);
                        }}
                        placeholder="Pick a date"
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}

                {/* Performance Task section */}
                {ptCount > 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="pb-1 pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      Performance Task
                    </td>
                  </tr>
                )}
                {ptDraft.map((d, i) => (
                  <tr key={`pt-${i}`} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-muted-foreground">
                      PT{i + 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={d.label}
                        onChange={(e) => {
                          const next = [...ptDraft];
                          next[i] = { ...next[i], label: e.target.value };
                          setPtDraft(next);
                        }}
                        placeholder="e.g. Quiz 1"
                        className="h-8 text-sm"
                        maxLength={120}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={d.page}
                        onChange={(e) => {
                          const next = [...ptDraft];
                          next[i] = { ...next[i], page: e.target.value };
                          setPtDraft(next);
                        }}
                        placeholder="—"
                        className="h-8 text-sm"
                        maxLength={40}
                      />
                    </td>
                    <td className="py-1.5">
                      <DatePicker
                        value={d.date}
                        onChange={(date) => {
                          const next = [...ptDraft];
                          next[i] = { ...next[i], date };
                          setPtDraft(next);
                        }}
                        placeholder="Pick a date"
                        className="h-8"
                      />
                    </td>
                  </tr>
                ))}

                {/* QA row — description only */}
                <tr>
                  <td
                    colSpan={4}
                    className="pb-1 pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    Quarterly Assessment
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-muted-foreground">
                    QA
                  </td>
                  <td className="py-1.5 pr-2" colSpan={3}>
                    <Input
                      value={qaDraft}
                      onChange={(e) => setQaDraft(e.target.value)}
                      placeholder="e.g. Quarterly Exam"
                      className="h-8 text-sm"
                      maxLength={120}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add components/grading/activity-labels-dialog.tsx
git commit -m "feat(grading): ActivityLabelsDialog — edit WW/PT/QA slot labels"
```

---

## Task 5 — Wire dialog into page + add useEffect to ScoreEntryGrid

Render the dialog in the grading sheet header and add a `useEffect` so the Activity Guide panel stays in sync after `router.refresh()`.

**Files:**

- Modify: `app/(markbook)/markbook/grading/[id]/page.tsx`
- Modify: `components/grading/score-entry-grid.tsx`

- [ ] **Step 1: Import ActivityLabelsDialog in the page**

In `app/(markbook)/markbook/grading/[id]/page.tsx`, add the import after the existing `TotalsEditor` import (currently line 35):

```typescript
import { TotalsEditor } from '@/components/grading/totals-editor';
import { ActivityLabelsDialog } from '@/components/grading/activity-labels-dialog';
```

Also import `SlotLabels` for the prop cast. Add to the existing imports near the top:

```typescript
import type { SlotLabels } from '@/lib/schemas/grading-sheet';
```

- [ ] **Step 2: Render the dialog in the header**

The header button group (around line 363) currently reads:

```tsx
<div className="flex flex-wrap items-center gap-2">
  {sheet.is_locked && isAssignedTeacher && (
    <RequestEditButton ... />
  )}
  {canManage && (
    <TotalsEditor ... />
  )}
  {canManage && (
    <LockToggle sheetId={sheet.id} isLocked={sheet.is_locked} />
  )}
</div>
```

Insert `ActivityLabelsDialog` between `TotalsEditor` and `LockToggle`:

```tsx
<div className="flex flex-wrap items-center gap-2">
  {sheet.is_locked && isAssignedTeacher && (
    <RequestEditButton ... />
  )}
  {canManage && (
    <TotalsEditor ... />
  )}
  {((isAssignedTeacher && !sheet.is_locked) || canManage) && (
    <ActivityLabelsDialog
      sheetId={sheet.id}
      wwCount={(sheet.ww_totals ?? []).length}
      ptCount={(sheet.pt_totals ?? []).length}
      initialLabels={(sheet.slot_labels as SlotLabels) ?? {}}
    />
  )}
  {canManage && (
    <LockToggle sheetId={sheet.id} isLocked={sheet.is_locked} />
  )}
</div>
```

- [ ] **Step 3: Add useEffect to ScoreEntryGrid**

In `components/grading/score-entry-grid.tsx`, the React import currently is:

```typescript
import { useCallback, useMemo, useRef, useState } from 'react';
```

Add `useEffect`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

Then, immediately after the existing `labels` state initialisation (around line 130):

```typescript
const [labels, setLabels] = useState<Required<SlotLabels>>({
  ww: slotLabels?.ww ?? [],
  pt: slotLabels?.pt ?? [],
  qa: slotLabels?.qa ?? null,
});
```

Add the sync effect on the next line:

```typescript
useEffect(() => {
  setLabels({
    ww: slotLabels?.ww ?? [],
    pt: slotLabels?.pt ?? [],
    qa: slotLabels?.qa ?? null,
  });
}, [slotLabels]);
```

- [ ] **Step 4: Verify TypeScript is clean**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the test suite**

```powershell
npx vitest run
```

Expected: 73 tests pass (all pre-existing; this feature adds no new pure compute functions that need unit tests).

- [ ] **Step 6: Run a production build**

```powershell
npx next build
```

Expected: clean compile, no type or import errors.

- [ ] **Step 7: Smoke test in the browser**

Start dev server:

```powershell
npx next dev
```

Verify:

1. Open a grading sheet as a **teacher on an unlocked sheet** → "Activity Labels" button appears in header.
2. Open the dialog → WW and PT rows match the sheet's slot count; QA row shows one Description field.
3. Fill in a description, page number, and date (via the date picker popover) for W1.
4. Click Save → toast "Activity labels saved." appears → dialog closes → Activity Guide at the bottom of the grid now shows the new label, page ref, and date chip.
5. Lock the sheet (as registrar) → revisit as teacher → "Activity Labels" button is **gone**.
6. As registrar on a locked sheet → "Activity Labels" button still appears and saving works.
7. Open `/{markbook}/markbook/audit-log` as registrar → filter or search for `sheet.labels.update` → the save action appears in the log.

- [ ] **Step 8: Commit**

```powershell
git add "app/(markbook)/markbook/grading/[id]/page.tsx" components/grading/score-entry-grid.tsx
git commit -m "feat(grading): wire ActivityLabelsDialog into sheet header + sync ScoreEntryGrid labels on refresh"
```
