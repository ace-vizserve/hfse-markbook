# Non-Flat Primitive Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the non-flat primitive refresh started in the 25th pass — add depth cues (solid tint + ring + shadow for content surfaces; inset + crafted active states for fillables; chart-legend chip primitive) so no shadcn primitive reads as flat, without introducing gradient content backgrounds.

**Architecture:** Three-tier primitive system (T1 chip/CTA = gradient; T1 content surface = solid tint + ring + shadow; T2 fillable = inset + crafted active). Rollout is bottom-up: tokens first, then T2 fillables, then T1 content surfaces, then `ChartLegendChip` + sweep. Primitive-only changes auto-inherit to call sites; one targeted legend sweep handles the user directive.

**Tech Stack:** Tailwind v4 (`@theme inline` + `--av-*` tokens in `app/globals.css`), shadcn primitives (`components/ui/*`), `recharts` (for `<Legend content={...}>`), Next.js 16 App Router.

**Non-TDD note:** Design-system CSS changes do not benefit from unit tests — asserting class strings tells you nothing about visual craft. Each task's verification is `npx next build` clean + targeted browser smoke on an affected page. Token tasks add a `grep-and-verify` step per `docs/context/09-design-system.md` §11.

**Spec:** `docs/superpowers/specs/2026-04-25-non-flat-primitive-refresh-design.md`

---

## Task 1: Token additions & verification

Adds three new tile-glow tokens and nudges `shadow-input` from drop → inset. All existing call sites auto-inherit.

**Files:**
- Modify: `app/globals.css` (raw `--av-*` block, both `:root` and `.dark`; `@theme inline` block)

- [ ] **Step 1: Modify `--av-shadow-input` in both `:root` and `.dark`**

In `app/globals.css`, find the line `--av-shadow-input: 0 1px 2px rgba(15, 23, 42, 0.04);` (appears in the `:root` block around line 83 and, if duplicated, in `.dark`). Replace with:

```css
--av-shadow-input: inset 0 1px 2px 0 rgba(15, 23, 42, 0.06);
```

If `.dark` has its own `--av-shadow-input` line, apply the same change. If `.dark` does not override it (unlikely — check first), skip.

- [ ] **Step 2: Add the three new tile-glow tokens**

Immediately below `--av-shadow-brand-tile` in the `:root` block, add:

```css
--av-shadow-brand-tile-mint:
  inset 0 1px 0 0 rgba(255, 255, 255, 0.3),
  0 4px 12px -4px rgba(165, 243, 183, 0.5);

--av-shadow-brand-tile-destructive:
  inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
  0 4px 12px -4px rgba(239, 68, 68, 0.45);

--av-shadow-brand-tile-amber:
  inset 0 1px 0 0 rgba(255, 255, 255, 0.25),
  0 4px 12px -4px rgba(245, 158, 11, 0.45);
```

- [ ] **Step 3: Expose the new tokens in `@theme inline`**

In the `@theme inline` block, immediately below the line `--shadow-brand-tile: var(--av-shadow-brand-tile);`, add:

```css
--shadow-brand-tile-mint: var(--av-shadow-brand-tile-mint);
--shadow-brand-tile-destructive: var(--av-shadow-brand-tile-destructive);
--shadow-brand-tile-amber: var(--av-shadow-brand-tile-amber);
```

- [ ] **Step 4: Clean build and grep-verify (§11 — non-negotiable)**

Run:

```bash
rm -rf .next && npx next build
```

Expected: clean build, no errors.

Then verify each new token resolves to a real value (not a circular `var()`):

```bash
grep -rh "shadow-brand-tile-mint"        .next/static/chunks/*.css | head -5
grep -rh "shadow-brand-tile-destructive" .next/static/chunks/*.css | head -5
grep -rh "shadow-brand-tile-amber"       .next/static/chunks/*.css | head -5
grep -rh "shadow-input"                  .next/static/chunks/*.css | head -5
```

Each grep should return class definitions referencing the actual rgba values (e.g. `rgba(165,243,183,.5)`), not `var(--shadow-brand-tile-mint)` alone. If any returns a circular var or is missing entirely, diagnose before proceeding — the empty-shadow-button incident documented in §11 is exactly this failure mode.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(design-system): shadow-input → inset; add mint/destructive/amber tile-glow tokens"
```

---

## Task 2: T2 fillables — Input + Textarea

Updates the focus ring strength to match spec and picks up the inset `shadow-input` for free. Backward-compatible.

**Files:**
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/textarea.tsx`

- [ ] **Step 1: Update Input focus ring**

Open `components/ui/input.tsx`. Replace the current focus block (the line starting `focus-visible:border-brand-indigo focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-indigo/15`) with:

```
// Focus — crafted brand indigo ring
'focus-visible:border-brand-indigo/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/20 focus-visible:shadow-sm',
```

And update the invalid-focus line from:
```
'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/15',
```
to:
```
'aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus-visible:ring-2 aria-[invalid=true]:focus-visible:ring-destructive/30',
```

(The `ring-2` change is intentional — `ring-4` was too prominent; `ring-2` + `shadow-sm` gives a crafted bloom without shouting.)

- [ ] **Step 2: Update Textarea focus ring**

Open `components/ui/textarea.tsx`. Apply the same focus + aria-invalid replacements as Step 1. If the class string lives in a different format (e.g. multiline cn()), preserve structure — only change the ring classes.

- [ ] **Step 3: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke: open `/account` (has form Inputs) and `/grading/new` or any sheet with Textareas. Tab through a form. Confirm:
- At rest: subtle inset shadow visible at top edge (from Task 1's token change)
- On focus: `ring-2` indigo bloom + thicker brand border
- On invalid (if you can trigger it): `ring-2` destructive bloom

- [ ] **Step 4: Commit**

```bash
git add components/ui/input.tsx components/ui/textarea.tsx
git commit -m "feat(ui): crafted focus ring on Input + Textarea (ring-2 + shadow-sm bloom)"
```

---

## Task 3: T2 fillable — Select trigger

Adds hover state, focus ring parity with Input, chevron rotation on open.

**Files:**
- Modify: `components/ui/select.tsx`

- [ ] **Step 1: Read current `SelectTrigger` styles**

Read `components/ui/select.tsx`. Identify the `SelectTrigger` component's className string — it's the trigger's rest/hover/focus treatment. Locate the chevron icon rendered inside it (likely `<ChevronDown className="..." />`).

- [ ] **Step 2: Update SelectTrigger className**

Replace the trigger's class string with (preserving any existing disabled / data-placeholder / data-size handling — only the rest/hover/focus/open classes change):

```
'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-hairline bg-white px-3 py-2 text-sm text-foreground shadow-input transition-all [&>span]:line-clamp-1 data-[placeholder]:text-ink-5',
// Hover
'hover:bg-muted/40 hover:border-hairline-strong',
// Focus + open
'focus-visible:border-brand-indigo/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/20 focus-visible:shadow-sm',
'data-[state=open]:border-brand-indigo/60 data-[state=open]:ring-2 data-[state=open]:ring-brand-indigo/20 data-[state=open]:shadow-sm',
// Invalid
'aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:focus-visible:ring-2 aria-[invalid=true]:focus-visible:ring-destructive/30',
// Disabled
'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted/60',
```

- [ ] **Step 3: Add chevron rotation**

On the `<ChevronDown>` (or equivalent) inside `SelectTrigger`, add to its className:

```
'size-4 opacity-60 transition-transform group-data-[state=open]:rotate-180'
```

If the trigger doesn't already have `group` on it, add `group` to the trigger's className. The `data-state=open` attribute is already emitted by Radix.

- [ ] **Step 4: Update SelectContent (the dropdown surface)**

On the `SelectContent` className, update the surface treatment — find the current `bg-popover border shadow-md` (or similar) and change to:

```
'bg-popover text-foreground ring-1 ring-inset ring-hairline border border-border shadow-lg rounded-md overflow-hidden'
```

(Keep existing positioning/animation classes.)

- [ ] **Step 5: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke: open any page with a `<Select>` (e.g. `/grading/new` section picker, `/sis/admin/settings`). Verify:
- Rest: subtle inset + hairline
- Hover: `bg-muted/40` + slightly darker border
- Click open: indigo ring held while open; chevron rotates 180°; dropdown has visible inset ring and lift
- Click out: ring clears, chevron rotates back

- [ ] **Step 6: Commit**

```bash
git add components/ui/select.tsx
git commit -m "feat(ui): crafted Select trigger (hover tint, open-state ring, chevron rotate) + content lift"
```

---

## Task 4: T2 fillable — Checkbox

Rest: inset. Checked: brand gradient + tile glow. Indeterminate added as a free upgrade.

**Files:**
- Modify: `components/ui/checkbox.tsx`

- [ ] **Step 1: Read current Checkbox component**

Read `components/ui/checkbox.tsx`. Note the current Radix `<CheckboxPrimitive.Root>` className and `<CheckboxPrimitive.Indicator>` (icon) block.

- [ ] **Step 2: Update CheckboxPrimitive.Root className**

Replace the Root className with:

```
'peer size-4 shrink-0 rounded border border-hairline bg-background shadow-input transition-all',
// Hover (unchecked)
'hover:border-hairline-strong data-[state=unchecked]:hover:border-hairline-strong',
// Focus
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/20 focus-visible:border-brand-indigo/60',
// Checked + indeterminate
'data-[state=checked]:border-transparent data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-brand-indigo data-[state=checked]:to-brand-navy data-[state=checked]:text-white data-[state=checked]:shadow-brand-tile',
'data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-gradient-to-br data-[state=indeterminate]:from-brand-indigo data-[state=indeterminate]:to-brand-navy data-[state=indeterminate]:text-white data-[state=indeterminate]:shadow-brand-tile',
// Disabled
'disabled:cursor-not-allowed disabled:opacity-60',
```

- [ ] **Step 3: Update Indicator to support indeterminate**

Inside the `<CheckboxPrimitive.Indicator>` block, render either `<Check />` for checked or `<Minus />` for indeterminate. If the current Indicator is:

```tsx
<CheckboxPrimitive.Indicator className="...">
  <Check className="size-3.5" />
</CheckboxPrimitive.Indicator>
```

Replace with (import `Minus` from `lucide-react` alongside `Check`):

```tsx
<CheckboxPrimitive.Indicator
  className={cn('flex items-center justify-center text-current')}
  {...props.children ? {} : {}}
>
  {/* Radix exposes data-state via the parent Root; we branch on it here.
      Indeterminate is triggered by <Checkbox checked="indeterminate" />. */}
  <Check className="size-3.5 data-[state=indeterminate]:hidden" />
  <Minus className="hidden size-3.5 data-[state=indeterminate]:block" />
</CheckboxPrimitive.Indicator>
```

If Radix doesn't propagate `data-state` to the indicator children, use CSS: target via the Root's `data-state=indeterminate` selector on the indicator:

```tsx
<CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
  <Check className="size-3.5 [[data-state=indeterminate]_&]:hidden" />
  <Minus className="hidden size-3.5 [[data-state=indeterminate]_&]:block" />
</CheckboxPrimitive.Indicator>
```

(This Tailwind parent-selector syntax reads: "when an ancestor has `data-state=indeterminate`, apply the class.")

- [ ] **Step 4: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke: find a page with a Checkbox (e.g. DropdownMenuCheckboxItem on `/grading` column toggles, or any form with a boolean). Verify:
- Unchecked: inset-shadowed square
- Checked: brand gradient fill + tile glow + white check
- Focus: indigo ring

If you want to manually verify indeterminate, temporarily mount `<Checkbox checked="indeterminate" />` in a dev page.

- [ ] **Step 5: Commit**

```bash
git add components/ui/checkbox.tsx
git commit -m "feat(ui): crafted Checkbox (inset rest, gradient checked, indeterminate support)"
```

---

## Task 5: T1 content surface — Alert (4 variants + AlertIcon slot)

Alert absorbs the §9.4 status-panel pattern. Adds `success` + `warning` variants. Introduces an `AlertIcon` slot so the gradient icon tile is opt-in; existing inline-SVG call sites continue to work.

**Files:**
- Modify: `components/ui/alert.tsx`

- [ ] **Step 1: Rewrite `alertVariants` with 4 variants + ring pattern**

Open `components/ui/alert.tsx`. Replace the existing `alertVariants` definition with:

```tsx
const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[[data-slot=alert-icon]]:grid-cols-[auto_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 has-[[data-slot=alert-icon]]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current shadow-sm ring-1 ring-inset',
  {
    variants: {
      variant: {
        default:
          'border-brand-indigo-soft/40 ring-brand-indigo-soft/40 bg-accent text-foreground',
        destructive:
          'border-destructive/30 ring-destructive/30 bg-destructive/5 text-destructive [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/85',
        success:
          'border-brand-mint/60 ring-brand-mint/60 bg-brand-mint/20 text-foreground',
        warning:
          'border-brand-amber/50 ring-brand-amber/50 bg-brand-amber-light text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
```

(Removed `shadow-input` — now `shadow-sm`. Added `ring-1 ring-inset` with per-variant ring color. Added `success` and `warning`. The `has-[[data-slot=alert-icon]]:grid-cols-[auto_1fr]` line makes the grid stretch its first column when an `AlertIcon` is present.)

- [ ] **Step 2: Add `AlertIcon` component**

At the bottom of the file, before the `export`, add:

```tsx
const alertIconVariants = cva(
  'col-start-1 row-span-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile',
        destructive: 'bg-destructive text-destructive-foreground shadow-brand-tile-destructive',
        success: 'bg-gradient-to-br from-brand-mint to-brand-sky text-ink shadow-brand-tile-mint',
        warning: 'bg-brand-amber text-ink shadow-brand-tile-amber',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const AlertIcon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertIconVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="alert-icon"
    className={cn(alertIconVariants({ variant }), className)}
    {...props}
  />
));
AlertIcon.displayName = 'AlertIcon';
```

- [ ] **Step 3: Update the export**

Replace the existing `export { Alert, AlertTitle, AlertDescription };` with:

```tsx
export { Alert, AlertTitle, AlertDescription, AlertIcon };
```

- [ ] **Step 4: Update AlertTitle column positioning for AlertIcon case**

The existing `AlertTitle` has `col-start-2`. That still works whether the first column is SVG (16px) or AlertIcon (auto ≈ 36px). No change needed. Same for `AlertDescription`. But verify both still read `col-start-2` after your edits — they should.

- [ ] **Step 5: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke: find a page rendering `<Alert>` (e.g. `/grading/[id]` has change-request alerts; `/report-cards/publish` has pre-publish warnings). Verify:
- Default variant: indigo-soft wash + inset ring
- Destructive variant: destructive/5 wash + ring
- Existing inline-SVG usages still render correctly (column width unchanged when no AlertIcon)

- [ ] **Step 6: Commit**

```bash
git add components/ui/alert.tsx
git commit -m "feat(ui): Alert gets 4 variants + AlertIcon slot (absorbs §9.4 status-panel pattern)"
```

---

## Task 6: T1 content surfaces — DropdownMenu, Popover, Tooltip

Inset ring + `shadow-lg` on popover-class surfaces. Tooltip keeps dark treatment but gains lift.

**Files:**
- Modify: `components/ui/dropdown-menu.tsx`
- Modify: `components/ui/popover.tsx`
- Modify: `components/ui/tooltip.tsx`

- [ ] **Step 1: Update DropdownMenuContent**

Open `components/ui/dropdown-menu.tsx`. Find the `DropdownMenuContent` className — it's the content surface, typically containing `bg-popover` + `border` + `shadow-md`. Update the surface classes to:

```
'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground ring-1 ring-inset ring-hairline shadow-lg'
```

Preserve existing `data-[state=...]:animate-in` / `data-[side=...]:slide-in-from-*` / `origin-*` classes — they're Radix animation hooks.

- [ ] **Step 2: Update PopoverContent**

Open `components/ui/popover.tsx`. Apply the same surface treatment:

```
'z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground ring-1 ring-inset ring-hairline shadow-lg outline-none'
```

Preserve any existing animation classes.

- [ ] **Step 3: Update TooltipContent**

Open `components/ui/tooltip.tsx`. Find `TooltipContent`. Tooltips stay dark (not tinted); change `shadow-md` → `shadow-lg`. Do **not** add `ring-inset` — tooltip is too small for a ring to read as craft (would just be noise).

Current class likely contains `bg-foreground text-background ... shadow-md`. Change `shadow-md` to `shadow-lg` only.

- [ ] **Step 4: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke:
- Open `/grading` and click any column-toggle DropdownMenu: verify it lifts off the canvas with inset ring visible
- Hover any Tooltip (e.g. help icons on `/grading/[id]` grid header): verify darker shadow
- Open a Popover (e.g. date-picker on `/admin/change-requests` filter): same lift + ring

- [ ] **Step 5: Commit**

```bash
git add components/ui/dropdown-menu.tsx components/ui/popover.tsx components/ui/tooltip.tsx
git commit -m "feat(ui): DropdownMenu/Popover inset ring + shadow-lg; Tooltip shadow-lg"
```

---

## Task 7: T1 content surfaces — Dialog, Sheet, AlertDialog

Surgical: add `ring-1 ring-inset ring-hairline` to the body containers. `shadow-xl` stays.

**Files:**
- Modify: `components/ui/dialog.tsx`
- Modify: `components/ui/sheet.tsx`
- Modify: `components/ui/alert-dialog.tsx` (if it has its own Content; may re-export Dialog's)

- [ ] **Step 1: Update DialogContent**

Open `components/ui/dialog.tsx`. Find `DialogContent` (the dialog body). Add `ring-1 ring-inset ring-hairline` to its className. Typical current state includes `bg-background border shadow-xl` — append the ring classes.

- [ ] **Step 2: Update SheetContent**

Open `components/ui/sheet.tsx`. Find `SheetContent`. Same addition: `ring-1 ring-inset ring-hairline`.

- [ ] **Step 3: AlertDialog**

Open `components/ui/alert-dialog.tsx`. If `AlertDialogContent` has its own className, apply the same ring addition. If it re-exports from shadcn's `dialog` primitive, verify it inherits and no change needed.

- [ ] **Step 4: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke:
- Open a Dialog (e.g. export-CSV dialog on `/admin/audit-log`)
- Open a Sheet (e.g. any "Add student" on `/admin/sections/[id]`)
- Open an AlertDialog (e.g. destructive-confirm — `Delete`)

All three should show a subtle inner hairline highlight against the backdrop.

- [ ] **Step 5: Commit**

```bash
git add components/ui/dialog.tsx components/ui/sheet.tsx components/ui/alert-dialog.tsx
git commit -m "feat(ui): Dialog/Sheet/AlertDialog gain inset ring highlight"
```

---

## Task 8: T1 content surface — Sonner toast

Tinted backgrounds per toast type, inset ring, `shadow-lg`.

**Files:**
- Modify: `components/ui/sonner.tsx`

- [ ] **Step 1: Read current Toaster configuration**

Read `components/ui/sonner.tsx`. It exports a `<Toaster />` with `toastOptions` likely including a `classNames` object. Identify the current `toast` / `error` / `success` / `warning` class maps.

- [ ] **Step 2: Extend toastOptions.classNames**

Replace the `toastOptions` (or its `classNames` subtree) with:

```tsx
toastOptions={{
  classNames: {
    toast:
      'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:ring-1 group-[.toaster]:ring-inset group-[.toaster]:ring-hairline group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-lg',
    description: 'group-[.toast]:text-muted-foreground',
    actionButton:
      'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
    cancelButton:
      'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
    error:
      'group-[.toaster]:bg-destructive/5 group-[.toaster]:ring-destructive/30 group-[.toaster]:text-destructive',
    success:
      'group-[.toaster]:bg-brand-mint/20 group-[.toaster]:ring-brand-mint/60 group-[.toaster]:text-foreground',
    warning:
      'group-[.toaster]:bg-brand-amber-light group-[.toaster]:ring-brand-amber/50 group-[.toaster]:text-foreground',
    info:
      'group-[.toaster]:bg-accent group-[.toaster]:ring-brand-indigo-soft/40 group-[.toaster]:text-foreground',
  },
}}
```

(Adjust structure to match the existing `<Toaster>` wrapper — if the file defines `<Toaster>` as `({...props}) => <Sonner {...props} toastOptions={...} />`, merge the classNames into that object. Don't clobber unrelated options.)

- [ ] **Step 3: Build and smoke**

```bash
npx next build
```

Expected: clean build.

Manual smoke: trigger a toast. Easiest path — on `/grading/[id]`, save a score then lock the sheet (triggers a success toast). Or trigger an error via a validation failure (e.g. try to save a score > max). Verify:
- Success toast: mint wash + ring + lift
- Error toast: destructive wash + ring + lift
- Default/info: neutral wash + ring

- [ ] **Step 4: Commit**

```bash
git add components/ui/sonner.tsx
git commit -m "feat(ui): Sonner toast gains tinted variants (success/error/warning/info) + inset ring"
```

---

## Task 9: `ChartLegendChip` primitive

New shared component. Non-flat chip with a 3px gradient stripe, hairline + `shadow-xs`. Ships alone so it can be imported by Task 10+11 migrations.

**Files:**
- Create: `components/dashboard/chart-legend-chip.tsx`

- [ ] **Step 1: Create the file with the typed API**

Write `components/dashboard/chart-legend-chip.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChartLegendChipColor =
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'primary'
  | 'fresh'
  | 'stale'
  | 'very-stale';

const stripeGradientByColor: Record<ChartLegendChipColor, string> = {
  'chart-1': 'from-chart-1 to-chart-1/60',
  'chart-2': 'from-chart-2 to-chart-2/60',
  'chart-3': 'from-chart-3 to-chart-3/60',
  'chart-4': 'from-chart-4 to-chart-4/60',
  'chart-5': 'from-chart-5 to-chart-5/60',
  primary: 'from-brand-indigo to-brand-navy',
  fresh: 'from-brand-mint to-brand-sky',
  stale: 'from-brand-amber to-brand-amber',
  'very-stale': 'from-destructive to-destructive/80',
};

export type ChartLegendChipProps = {
  color: ChartLegendChipColor;
  label: string;
  count?: number;
  className?: string;
};

export function ChartLegendChip({
  color,
  label,
  count,
  className,
}: ChartLegendChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-foreground shadow-xs',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-4 w-[3px] rounded-sm bg-gradient-to-b',
          stripeGradientByColor[color],
        )}
      />
      <span>{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </span>
  );
}

/**
 * Render-prop compatible with recharts `<Legend content={...} />`.
 * Maps recharts payload entries to ChartLegendChips.
 *
 * Pass a `palette` mapping `dataKey` or series name → ChartLegendChipColor.
 */
type RechartsLegendPayload = {
  value: string;
  dataKey?: string | number;
  color?: string;
}[];

type RechartsLegendProps = {
  payload?: RechartsLegendPayload;
};

export function chartLegendContent(
  palette: Record<string, ChartLegendChipColor>,
) {
  return function ChartLegendContent(props: RechartsLegendProps) {
    const payload = props.payload ?? [];
    return (
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {payload.map((entry, idx) => {
          const key = String(entry.dataKey ?? entry.value);
          const color = palette[key] ?? palette[entry.value] ?? 'chart-1';
          return (
            <ChartLegendChip key={`${key}-${idx}`} color={color} label={entry.value} />
          );
        })}
      </div>
    );
  };
}
```

- [ ] **Step 2: Build**

```bash
npx next build
```

Expected: clean build. No usages yet — Task 10+11 will import it.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/chart-legend-chip.tsx
git commit -m "feat(dashboard): ChartLegendChip + chartLegendContent (non-flat chart-legend primitive)"
```

---

## Task 10: Legend sweep — chart-series (Shape A) migrations

8 files. Each swaps recharts `<Legend wrapperStyle={...}>` for `<Legend content={chartLegendContent({...})}>`. Commit per-file so regressions are easy to bisect.

**Files:**
- Modify: `components/admissions/assessment-outcomes-chart.tsx`
- Modify: `components/dashboard/charts/comparison-bar-chart.tsx`
- Modify: `components/dashboard/charts/trend-chart.tsx`
- Modify: `components/markbook/publication-coverage-chart.tsx`
- Modify: `components/markbook/sheet-progress-chart.tsx`
- Modify: `components/p-files/completion-by-level-chart.tsx`
- Modify: `components/sis/document-backlog-chart.tsx`
- Modify: `app/(p-files)/p-files/page.tsx`

- [ ] **Step 1: Migrate `assessment-outcomes-chart.tsx`**

Open the file. Find `<Legend wrapperStyle={...} iconType="circle" />`. Replace with:

```tsx
<Legend
  content={chartLegendContent({
    Pass: 'chart-5',
    Fail: 'chart-3',
    Absent: 'chart-4',
  })}
/>
```

(Inspect the `<Bar dataKey="...">` entries in the same file to determine the actual series names. Map each series name to a chart-N token; reuse the same color each series is already using — e.g. if `<Bar dataKey="Pass" fill="var(--chart-5)">`, then `Pass: 'chart-5'`.)

Add import at the top:

```tsx
import { chartLegendContent } from '@/components/dashboard/chart-legend-chip';
```

- [ ] **Step 2: Build**

```bash
npx next build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/admissions/assessment-outcomes-chart.tsx
git commit -m "feat(admissions): assessment-outcomes legend → ChartLegendChip"
```

- [ ] **Step 4: Migrate `comparison-bar-chart.tsx`**

Repeat the same pattern — swap `<Legend>` props for `content={chartLegendContent({...})}`, import the helper, map series to chart-N colors based on each series' existing `fill` prop. Build, commit.

```bash
git add components/dashboard/charts/comparison-bar-chart.tsx
git commit -m "feat(dashboard): comparison-bar legend → ChartLegendChip"
```

- [ ] **Step 5: Migrate `trend-chart.tsx`**

Same pattern. Build, commit.

```bash
git add components/dashboard/charts/trend-chart.tsx
git commit -m "feat(dashboard): trend-chart legend → ChartLegendChip"
```

- [ ] **Step 6: Migrate `publication-coverage-chart.tsx`**

Same pattern. Build, commit.

```bash
git add components/markbook/publication-coverage-chart.tsx
git commit -m "feat(markbook): publication-coverage legend → ChartLegendChip"
```

- [ ] **Step 7: Migrate `sheet-progress-chart.tsx`**

Same pattern. Build, commit.

```bash
git add components/markbook/sheet-progress-chart.tsx
git commit -m "feat(markbook): sheet-progress legend → ChartLegendChip"
```

- [ ] **Step 8: Migrate `completion-by-level-chart.tsx`**

Same pattern. Build, commit.

```bash
git add components/p-files/completion-by-level-chart.tsx
git commit -m "feat(p-files): completion-by-level legend → ChartLegendChip"
```

- [ ] **Step 9: Migrate `document-backlog-chart.tsx`**

Same pattern. Build, commit.

```bash
git add components/sis/document-backlog-chart.tsx
git commit -m "feat(sis): document-backlog legend → ChartLegendChip"
```

- [ ] **Step 10: Migrate `app/(p-files)/p-files/page.tsx`**

This file references `Legend` in a non-chart context — could be a hand-rolled legend section. Read the file, identify the legend block. If it's a recharts `<Legend>` inside a chart, apply Step 1 pattern. If it's a hand-rolled chip group, migrate to `ChartLegendChip` imports directly (mapping each label to a `ChartLegendChipColor`).

```bash
git add "app/(p-files)/p-files/page.tsx"
git commit -m "feat(p-files): page-level legend → ChartLegendChip"
```

---

## Task 11: Legend sweep — hand-rolled (Shape C) migrations

Three files: `wide-grid.tsx` (day-type `LegendDot`), `calendar-admin-client.tsx` (legend section), `outdated-applications-table.tsx` (`LegendItem` staleness tiers).

**Files:**
- Modify: `components/attendance/wide-grid.tsx`
- Modify: `components/attendance/calendar-admin-client.tsx`
- Modify: `components/admissions/outdated-applications-table.tsx`

- [ ] **Step 1: Migrate `wide-grid.tsx::LegendDot`**

Open `components/attendance/wide-grid.tsx`. Locate the `LegendDot` helper component (near bottom of file) and the day-type legend block that calls it (~line 563–567). Replace the block:

```tsx
<LegendDot className="bg-muted/60" label="School day" />
<LegendDot className="bg-destructive/10" label="Public holiday" />
<LegendDot className="bg-brand-amber/15" label="School holiday" />
<LegendDot className="bg-primary/10" label="HBL (encodable)" />
<LegendDot className="bg-muted/40" label="No class" />
```

with:

```tsx
<ChartLegendChip color="chart-4" label="School day" />
<ChartLegendChip color="very-stale" label="Public holiday" />
<ChartLegendChip color="stale" label="School holiday" />
<ChartLegendChip color="primary" label="HBL (encodable)" />
<ChartLegendChip color="chart-4" label="No class" />
```

Add the import:

```tsx
import { ChartLegendChip } from '@/components/dashboard/chart-legend-chip';
```

Then remove the now-unused `LegendDot` helper function and its callers. **Keep** `StatusLegendItem` (P/L/EX/A/NC) untouched — that one is a true visual key, not a flat chip.

- [ ] **Step 2: Build**

```bash
npx next build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add components/attendance/wide-grid.tsx
git commit -m "feat(attendance): wide-grid day-type legend → ChartLegendChip"
```

- [ ] **Step 4: Migrate `calendar-admin-client.tsx`**

Open the file. Find the `{/* Legend */}` comment block (~line 415). The surrounding markup likely hand-rolls colored dots + labels for day-types — apply the same `ChartLegendChip` conversion as Step 1, matching the day-type semantic to the color enum (school day / public holiday / school holiday / HBL / no class).

Build, commit:

```bash
git add components/attendance/calendar-admin-client.tsx
git commit -m "feat(attendance): calendar-admin day-type legend → ChartLegendChip"
```

- [ ] **Step 5: Migrate `outdated-applications-table.tsx::LegendItem`**

Open the file. Find the `LegendItem` helper (~line 680) and its usages (~line 412–441) for staleness tiers ("Fresh" / "Stale" / "Very stale" — confirm exact labels when reading).

Each call site renders a `badge` React node + a `hint` string. Replace the four `<LegendItem badge={<Badge>...</Badge>} hint="..." />` calls with `<ChartLegendChip color="fresh|stale|very-stale" label="..." />` — map the staleness tier to the `fresh` / `stale` / `very-stale` color enum. If there's an extra "Neutral" legend line (no staleness), map it to `primary` or `chart-4`.

Remove the `LegendItem` helper function once unused.

Add the import.

Build, commit:

```bash
git add components/admissions/outdated-applications-table.tsx
git commit -m "feat(admissions): outdated-applications staleness legend → ChartLegendChip"
```

---

## Task 12: Preview-migration smoke pass + cleanup

Visual verification across the breadth of affected surfaces, plus a final clean build.

**Files:**
- No code changes (verification-only)

- [ ] **Step 1: Clean build across the tree**

```bash
rm -rf .next && npx next build
```

Expected: clean build, no warnings related to our changes.

- [ ] **Step 2: Visual smoke — T1 content surfaces**

Open in browser, at viewport widths 1024 + 1440:

- `/grading/[id]` — change-request Alert (default variant), locked-sheet Alert (destructive), Tooltip on grid headers, DropdownMenu on column toggles
- `/report-cards/publish` — pre-publish Alert (warning variant, if rendered)
- `/admin/change-requests` — DropdownMenu filter, Dialog for Path A/B
- `/admin/sections/[id]` — Sheet for Add Student
- Trigger a success toast (save a score) and an error toast (submit an invalid value) — verify tinted variants

Confirm: every content surface reads with depth (tint + ring + shadow), no accidental gradient backgrounds.

- [ ] **Step 3: Visual smoke — T2 fillables**

Open:

- `/account` — Inputs; tab through, trigger focus
- `/grading/new` — Inputs + Selects + Textareas
- Any Checkbox call site — e.g. DropdownMenuCheckboxItem on `/grading` column toggles

Confirm: rest state has inset, focus state has `ring-2` bloom, Select hover tints, Checkbox checked reads as gradient tile.

- [ ] **Step 4: Visual smoke — Legends**

Open:

- `/records` — charts (trend, comparison-bar, donut) — verify legend chips carry the 3px gradient stripe + hairline + shadow-xs
- `/attendance/[sectionId]` — wide-grid — verify day-type legend chips, leave StatusLegendItem untouched
- `/records/outdated-applications` (or wherever `outdated-applications-table.tsx` renders) — staleness legend
- `/admissions` — assessment-outcomes legend

Confirm: every legend reads as a crafted chip, not a flat dot+label pair.

- [ ] **Step 5: Grep-and-verify tokens one more time**

```bash
grep -rh "shadow-brand-tile-mint"        .next/static/chunks/*.css | head -3
grep -rh "shadow-brand-tile-destructive" .next/static/chunks/*.css | head -3
grep -rh "shadow-brand-tile-amber"       .next/static/chunks/*.css | head -3
```

Each should return a real rgba value. No circular vars.

- [ ] **Step 6: Update dev plan + CLAUDE.md session-context note**

Append a row in `docs/sprints/development-plan.md` under the running follow-ups, dated 2026-04-25. Update the session-context note in `CLAUDE.md` to move the "continuing next session" block to "shipped."

Run `/sync-docs` if there's drift to clean up.

- [ ] **Step 7: Final commit for docs**

```bash
git add docs/sprints/development-plan.md CLAUDE.md
git commit -m "docs: record non-flat primitive refresh completion (spec + plan shipped)"
```

---

## Self-review notes

- **Spec coverage:** Tasks map to spec sections — §6 → Task 1; §4 → Tasks 2–4; §3.1 → Task 5; §3.2 → Task 6; §3.3 → Task 7; §3.4 → Task 8; §5.1 → Task 9; §5.2 Shape A → Task 10; §5.2 Shape C → Task 11; §7 step 5 (smoke pass) → Task 12. No gaps.
- **Type consistency:** `ChartLegendChipColor` union is stable across Tasks 9–11. `chartLegendContent`'s palette param matches its usage in Task 10.
- **Placeholder scan:** No TBD/TODO in steps. One semi-placeholder in Task 10 — "inspect the `<Bar dataKey>`" — this is a read-the-file instruction, not a plan failure, because each chart file has its own series naming (we don't want to hardcode wrong series names).
- **Migration policy preserved:** Touch-on-touch for §9.4 sites is not a task — it's a documented non-goal in the spec §8. No orphaned work.
