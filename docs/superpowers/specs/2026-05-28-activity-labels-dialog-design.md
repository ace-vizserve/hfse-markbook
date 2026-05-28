# Activity Labels Edit Dialog — Design Spec

**Date:** 2026-05-28  
**Status:** Approved  
**Scope:** Grading sheet — slot_labels teacher/registrar edit surface

---

## Context

`grading_sheets.slot_labels` is a JSONB column storing per-slot display metadata:

```
{
  ww:  SlotMeta[]        // one entry per WW slot (up to ww_max_slots)
  pt:  SlotMeta[]        // one entry per PT slot (up to pt_max_slots)
  qa:  string | null     // single label for the QA component
}

SlotMeta = { label?: string | null, date?: string | null, page?: string | null }
```

Teachers fill in equivalent columns on their Excel grading sheet:  
**Component · Description · Page# · Date Administered**

The data is currently read-only on the UI (shown in the "Activity Guide" collapsible panel inside `ScoreEntryGrid`). A PATCH route already exists but has no UI entry point.

The publish-readiness `slot_dates` soft warning reads `slot_labels[*].date` — keeping labels up to date directly improves that signal.

---

## Goals

- Teachers can fill in activity metadata (description, page reference, date) for each WW and PT slot, and a description for QA.
- Registrar / school_admin / superadmin can edit labels on any sheet at any time.
- When a sheet is locked, only registrar+ can edit labels (consistent with score-entry lock behaviour).
- Changes are persisted via the existing PATCH route and reflected immediately in the Activity Guide.

---

## Out of Scope

- Extending `qa` to hold `SlotMeta` (date + page) — `qa` remains `string | null`.
- Bulk label copy across sheets.
- Any change to how `slot_labels` data is consumed by the publish-readiness check or the score-entry grid display.

---

## Architecture

### 1. New component — `ActivityLabelsDialog`

**File:** `components/grading/activity-labels-dialog.tsx`  
**Type:** `'use client'`

**Props:**

| Prop | Type | Notes |
|------|------|-------|
| `sheetId` | `string` | Grading sheet UUID |
| `wwCount` | `number` | `(sheet.ww_totals ?? []).length` |
| `ptCount` | `number` | `(sheet.pt_totals ?? []).length` |
| `initialLabels` | `SlotLabels` | Cast from `sheet.slot_labels` |

**Trigger:** An `outline` variant `Button` labelled **"Activity Labels"** that opens a shadcn `Dialog`.

**Form layout inside the dialog:**

A compact table with four columns:

| Slot | Description | Page # | Date Administered |
|------|-------------|--------|-------------------|
| W1…W{wwCount} | `Input` (max 120) | `Input` (max 40) | `<DatePicker>` |
| PT1…PT{ptCount} | `Input` (max 120) | `Input` (max 40) | `<DatePicker>` |
| QA | `Input` (max 120) | — | — |

- WW and PT rows are grouped under a `font-mono text-[10px] uppercase` section label.
- `<DatePicker>` from `components/ui/date-picker.tsx` (KD #44 — native `<input type="date">` is banned). Value is an ISO `yyyy-MM-dd` string; empty string → `null` on save.
- Empty Description coerces to `null` (server-side sanitization already does this; client mirrors it).

**Internal state:** `useState` over a local `{ ww: SlotMeta[], pt: SlotMeta[], qa: string }` draft — initialized from `initialLabels` on open, reset on cancel.

**Save flow:**

1. Build `{ ww: [...], pt: [...], qa: string | null }` from draft state (empty strings → `null`).
2. `PATCH /api/grading-sheets/[id]/labels` with the full payload.
3. On success: `router.refresh()` → `toast.success('Activity labels saved.')` → close dialog.
4. On error: `toast.error(message)` — keep dialog open, clear loading state.

**Loading state:** Save button shows a spinner and is disabled while the fetch is in-flight.

---

### 2. PATCH route additions — `app/api/grading-sheets/[id]/labels/route.ts`

Two additions to the existing handler:

**a) Lock guard for teachers**

After the teacher ownership check (currently lines ~67–80), add:

```
if (!isManager) {
  const { data: lockCheck } = await service
    .from('grading_sheets')
    .select('is_locked')
    .eq('id', id)
    .single();
  if (lockCheck?.is_locked) {
    return NextResponse.json({ error: 'sheet is locked' }, { status: 423 });
  }
}
```

Registrar+ are never blocked by lock state (matches score-entry behaviour for `requireApproval`).

**b) Audit logging**

At the end of the handler (after the successful DB update, before the response):

```typescript
await logAction({
  service,
  actor: { id: auth.user.id, email: auth.user.email ?? null },
  action: 'sheet.labels.update',
  entityType: 'grading_sheet',
  entityId: id,
});
```

---

### 3. AuditAction enum — `lib/audit/log-action.ts`

Add `'sheet.labels.update'` to the `AuditAction` union type.

---

### 4. Audit-log allowlist — markbook audit-log page

Add `'sheet.labels.update'` to the `.in('action', [...])` allowlist in the markbook audit-log page (KD #9 discipline — explicit allowlist, no wildcard).

File: `app/(markbook)/markbook/audit-log/page.tsx` (or its loader).

---

### 5. Page wiring — `app/(markbook)/markbook/grading/[id]/page.tsx`

**Import:** `ActivityLabelsDialog` from `@/components/grading/activity-labels-dialog`.

**Render** inside the `flex flex-wrap items-center gap-2` header div, between `TotalsEditor` and `LockToggle`:

```tsx
{((isAssignedTeacher && !sheet.is_locked) || canManage) && (
  <ActivityLabelsDialog
    sheetId={sheet.id}
    wwCount={(sheet.ww_totals ?? []).length}
    ptCount={(sheet.pt_totals ?? []).length}
    initialLabels={(sheet.slot_labels as SlotLabels) ?? {}}
  />
)}
```

Visibility rules:
- **Registrar / school_admin / superadmin** (`canManage`): always visible.
- **Assigned subject teacher** (`isAssignedTeacher`): visible only when `!sheet.is_locked`.
- **Locked sheet + teacher**: button hidden; teacher sees no edit path.

---

### 6. ScoreEntryGrid prop sync — `components/grading/score-entry-grid.tsx`

After `router.refresh()`, Next.js reconciles the RSC payload but does not remount the client component — so `useState`-initialized `labels` would be stale. Add a `useEffect`:

```typescript
useEffect(() => {
  setLabels({
    ww: slotLabels?.ww ?? [],
    pt: slotLabels?.pt ?? [],
    qa: slotLabels?.qa ?? null,
  });
}, [slotLabels]);
```

This ensures the Activity Guide panel reflects the newly saved labels after the page refreshes.

---

## Data Flow

```
User opens dialog
  → draft state initialized from initialLabels prop
User edits fields
  → draft state updated locally
User clicks Save
  → PATCH /api/grading-sheets/[id]/labels { ww, pt, qa }
  → server: teacher lock check → merge with existing → UPDATE grading_sheets → logAction
  → client: router.refresh() → toast.success → close dialog
  → RSC re-renders → ScoreEntryGrid receives fresh slotLabels prop
  → useEffect fires → labels state updated → Activity Guide shows new labels
```

---

## Constraints

- KD #44: `<DatePicker>` primitive only — no native `<input type="date">`.
- KD #9: audit-log allowlist updated with `'sheet.labels.update'`.
- Hard Rule #5: lock enforcement applies to teachers only; registrar+ bypass the lock.
- Hard Rule #7: design tokens only — no hardcoded colours.
- No new env vars. No schema changes. No migration needed.

---

## Files Touched

| File | Change |
|------|--------|
| `components/grading/activity-labels-dialog.tsx` | **New** |
| `app/(markbook)/markbook/grading/[id]/page.tsx` | Add dialog to header |
| `app/api/grading-sheets/[id]/labels/route.ts` | Lock guard + audit log |
| `lib/audit/log-action.ts` | Add `'sheet.labels.update'` |
| `app/(markbook)/markbook/audit-log/page.tsx` (or loader) | Allowlist update |
| `components/grading/score-entry-grid.tsx` | `useEffect` prop sync; re-export `SlotLabels` from schema |
| `lib/schemas/grading-sheet.ts` | Move `SlotLabels` type here (currently in score-entry-grid) |
