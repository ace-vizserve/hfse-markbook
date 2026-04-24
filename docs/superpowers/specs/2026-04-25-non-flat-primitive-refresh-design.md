# Non-Flat Primitive Refresh — Design

- **Date:** 2026-04-25
- **Branch:** `feat/dashboard-drilldowns` (continuation)
- **Predecessor:** 25th-pass "design-system non-flat primitive refresh (partial)" — tabs / button destructive / badge success+blocked
- **Directive:** "All components should not look / feel flat."

## 1. Goal

Finish the non-flat refresh started in the 25th pass so every shadcn primitive reads as crafted rather than flat, while preserving the data-density aesthetic. Adds depth cues to status/content/fillable surfaces without introducing gradient content backgrounds.

## 2. Architecture — three-tier primitive system

| Tier | Primitives | Rest state | Interaction state |
|---|---|---|---|
| **T1 chip / CTA** | `Button` default+destructive, `Badge` success+blocked, `Tabs` default active chip | Brand gradient + `shadow-button` / `shadow-brand-tile` + hairline | Hover lift (`-translate-y-0.5` + `shadow-button-hover`), active press |
| **T1 content surface** | `Alert`, `Dialog` body, `Sheet` body, `Popover` content, `DropdownMenu` content, `Tooltip` content, `Sonner` toast | Solid semantic tint (`bg-<role>/5`) + `ring-1 ring-inset ring-<role>/20` + `shadow-md` / `shadow-lg` | Hover tint bump where clickable |
| **T2 fillable** | `Input`, `Textarea`, `Select` trigger, `Checkbox` | Hairline ring + inset `shadow-input` | Hover: darker hairline on triggers; Focus: `ring-2 ring-brand-indigo/20` + brand border; Checked: brand gradient fill + `shadow-brand-tile` |

**Binding rule:** T1 gradient is pill/chip-scoped. T1 content surfaces never get a gradient background — they use solid tint + ring + shadow. T2 fillables never get gradients anywhere *except* a checked/on state.

## 3. T1 content surfaces

All share the vocabulary **solid tint + hairline inset ring + graduated shadow**, never a gradient background.

### 3.1 `Alert` (`components/ui/alert.tsx`)

New variants keyed to `variant`:

- **`default` (informational)** — `bg-accent` wash + `ring-1 ring-inset ring-brand-indigo-soft/40` + `shadow-sm`. Icon tile: `size-9 rounded-lg bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile`.
- **`destructive`** — `bg-destructive/5` + `ring-1 ring-inset ring-destructive/30` + `shadow-sm`. Icon tile: `bg-destructive text-destructive-foreground shadow-brand-tile-destructive`.
- **`success`** (new) — `bg-brand-mint/20` + `ring-1 ring-inset ring-brand-mint/60` + `shadow-sm`. Icon tile: `bg-gradient-to-br from-brand-mint to-brand-sky text-ink shadow-brand-tile-mint`.
- **`warning`** (new) — `bg-brand-amber-light` + `ring-1 ring-inset ring-brand-amber/50` + `shadow-sm`. Icon tile: `bg-brand-amber text-ink shadow-brand-tile-amber`.

Absorbs the §9.4 "status panel" pattern. New call sites reach for `<Alert variant>`; existing hand-rolled §9.4 divs migrate on touch.

### 3.2 `DropdownMenu` + `Popover` + `Tooltip` content

- **Content surface:** `bg-popover` + `ring-1 ring-inset ring-hairline` + `shadow-lg` (was `shadow-md`).
- **Items on hover:** `bg-accent` + `text-accent-foreground` (shadcn default — unchanged).
- **Tooltip:** keep dark (`bg-foreground text-background`) + `shadow-lg` for lift. No inset ring (too small to benefit).

### 3.3 `Dialog` + `Sheet` + `AlertDialog` bodies

`DialogContent` / `SheetContent` get `ring-1 ring-inset ring-hairline` added. `shadow-xl` unchanged.

### 3.4 `Sonner` toast (`components/ui/sonner.tsx`)

Extend `toastOptions.classNames`:

- **Rest:** `bg-popover` + `ring-1 ring-inset ring-hairline` + `shadow-lg`.
- **`type="error"`:** `bg-destructive/5` + `ring-destructive/30`.
- **`type="success"`:** `bg-brand-mint/20` + `ring-brand-mint/60`.
- **`type="warning"`:** `bg-brand-amber-light` + `ring-brand-amber/50`.

## 4. T2 fillables (redesigned, stay fillable)

### 4.1 `Input` + `Textarea` (`components/ui/input.tsx`, `components/ui/textarea.tsx`)

- **Rest:** `border-hairline` + `shadow-input` (nudged to inset — see §6). Placeholder via `text-ink-5`.
- **Hover (pointer, not focused):** `border-ink-5`.
- **Focus-visible:** `border-brand-indigo/50` + `ring-2 ring-brand-indigo/20` + `shadow-sm`.
- **`aria-invalid`:** `ring-2 ring-destructive/30` + `border-destructive/60`.
- **Disabled:** `opacity-60 cursor-not-allowed` (unchanged).

### 4.2 `Select` trigger (`components/ui/select.tsx`)

- **Rest:** same as Input.
- **Hover:** `bg-muted/40` + `border-ink-5`. No lift.
- **Focus / open:** same ring as Input; ring held while `data-state=open`.
- **Chevron:** `group-data-[state=open]:rotate-180 transition-transform`.
- **`SelectContent`:** inherits the popover treatment from §3.2.

### 4.3 `Checkbox` (`components/ui/checkbox.tsx`)

- **Rest (unchecked):** `size-4 rounded border border-hairline bg-background shadow-input`. Hover: `border-ink-5`. Focus: `ring-2 ring-brand-indigo/20`.
- **Checked:** `bg-gradient-to-br from-brand-indigo to-brand-navy border-transparent shadow-brand-tile` + white `<Check />` icon.
- **Indeterminate:** same gradient + horizontal-bar icon (new — free upgrade).
- **Disabled:** `opacity-60`, no hover.

### 4.4 Out of scope

- `RadioGroup`, `Switch` — not currently installed. Add when a real feature needs them. YAGNI.

## 5. `ChartLegendChip` + legend sweep

### 5.1 New primitive — `components/dashboard/chart-legend-chip.tsx`

One small shared component. Renders a non-flat chip:

```tsx
<span className="inline-flex items-center gap-2 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-foreground shadow-xs">
  <span aria-hidden className={`h-4 w-[3px] rounded-sm bg-gradient-to-b ${stripeGradient}`} />
  <span>{label}</span>
  {count !== undefined && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{count}</span>}
</span>
```

`stripeGradient` is a Tailwind class pair the caller resolves from a typed `color` prop:

- **Chart-series legends** — `color: 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5'` maps to stripes like `'from-chart-1 to-chart-1/60'` (single token, top→faded bottom — keeps the stripe readable as one chart color).
- **Severity legends (staleness tiers)** — `color: 'fresh' | 'stale' | 'very-stale'` maps to `'from-brand-mint to-brand-sky'` / `'from-brand-amber to-brand-amber'` / `'from-destructive to-destructive/80'`. Keeps a severity ramp without adding `Badge variant="warning"`.

3px-wide gradient stripe (not a flat dot). Hairline + `shadow-xs` gives the chip a quiet lift without chip-CTA gradient weight.

Companion export: `chartLegendContent({ palette })` — render-prop callback compatible with recharts `<Legend content={...}>` that maps recharts `payload` entries to `ChartLegendChip`s.

### 5.2 Migration targets

**Shape A — chart-series legends (recharts `<Legend>`)** — replace `<Legend wrapperStyle={...}>` with `<Legend content={chartLegendContent(...)} />`:
- `components/admissions/assessment-outcomes-chart.tsx`
- `components/dashboard/charts/comparison-bar-chart.tsx`
- `components/dashboard/charts/trend-chart.tsx`
- `components/markbook/publication-coverage-chart.tsx`
- `components/markbook/sheet-progress-chart.tsx`
- `components/p-files/completion-by-level-chart.tsx`
- `components/sis/document-backlog-chart.tsx`
- `app/(p-files)/p-files/page.tsx`

**Shape B — status-key legends (already crafted, leave alone):**
- `components/attendance/wide-grid.tsx::StatusLegendItem` (P/L/EX/A/NC grid-matching squares).

**Shape C — hand-rolled chip/dot legends** — migrate to `ChartLegendChip`:
- `components/attendance/wide-grid.tsx::LegendDot` (day-type keys).
- `components/attendance/calendar-admin-client.tsx` legend section.
- `components/admissions/outdated-applications-table.tsx::LegendItem` (staleness tiers — all three tiers use `ChartLegendChip` with severity-ramped color stripes rather than adding `Badge variant="warning"`).

## 6. Token additions & verification

### 6.1 `shadow-input` — drop → inset

```css
/* app/globals.css */
--av-shadow-input: inset 0 1px 2px 0 rgba(15, 23, 42, 0.06);
```

Value change only, token name unchanged. All existing call sites auto-inherit. Reads as a subtle top-edge indent.

### 6.2 New tile-glow tokens

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

Exposed in `@theme inline` as `--shadow-brand-tile-mint` / `--shadow-brand-tile-destructive` / `--shadow-brand-tile-amber` → Tailwind utilities `shadow-brand-tile-mint` / `shadow-brand-tile-destructive` / `shadow-brand-tile-amber`.

### 6.3 §11 grep-and-verify (non-negotiable)

After token additions:

```bash
rm -rf .next && npx next build
grep -r "shadow-brand-tile-mint"        .next/static/chunks/*.css
grep -r "shadow-brand-tile-destructive" .next/static/chunks/*.css
grep -r "shadow-brand-tile-amber"       .next/static/chunks/*.css
grep -r "shadow-input"                  .next/static/chunks/*.css
```

Confirm each utility resolves to a real value, not a circular `var()`. Required per `09-design-system.md` §11 (the empty-shadow-button incident).

## 7. Rollout order

Discrete commits, bisectable:

1. **Token additions** (§6) — small, isolated, lands first. Includes grep-and-verify.
2. **T2 fillable refresh** (§4) — auto-inherits everywhere; no call-site edits.
3. **T1 content surface refresh** (§3) — primitive-only changes; no call-site edits.
4. **`ChartLegendChip` + legend sweep** (§5) — new file + 11 migrations.
5. **Preview-migration smoke pass** — pick a page exercising alerts + inputs + a chart (e.g. `/grading/[id]`, `/records`), visually verify craft reads as intended.

## 8. Migration policy for pre-existing call sites

| Pattern | Policy |
|---|---|
| `<Alert>` default/destructive using shadcn flat box | Auto-inherits new treatment — nothing to edit |
| Hand-rolled §9.4 status panels (~3–5 sites) | **Touch-on-touch.** Migrate to `<Alert variant>` when the file is next edited |
| §9.3 `Badge` wash recipes (~25 sites) | **Stay as washes.** No sweep (dual-tier status vocabulary preserved) |
| Legend chips / top-of-page single-state pills | **Swept in step 4** (Shape A + C migrations) |
| `Popover` / `DropdownMenu` / `Tooltip` / `Sonner` | Auto-inherits — nothing to edit |
| `Input` / `Textarea` / `Select` / `Checkbox` | Auto-inherits — nothing to edit |

## 9. Explicitly out of scope

- No `RadioGroup` / `Switch` primitives added.
- No `Badge variant="warning"`. Staleness handled by `ChartLegendChip`.
- No sweep of the 25 §9.3 wash recipes.
- No changes to `Card`, `Button` default, `Tabs`, or `Badge` success/blocked (shipped 25th pass).
- No changes to `wide-grid.tsx::StatusLegendItem` (already crafted).
- No §7.4 icon-tile changes.
- No changes to `Table` / `CardHeader` / layout primitives.

## 10. Verification — per step

- Every step: `npx next build` clean + browser smoke on an affected page.
- Step 1: §11 grep-and-verify on every new/changed shadow token (non-negotiable).
- Step 4: visual audit on one chart page — confirm new legend chip reads as a *key* (users can glance-map chip to chart series).

## 11. Non-goals & why

**Not going gradient on every primitive.** The user-memory note ("no gradient content backgrounds, no centered heroes, no multi-stop top strips") is binding. Data-density and text legibility both suffer if content surfaces carry gradient fills; gradient is reserved for pill-sized chips and CTAs where it reads as affordance, not decoration.

**Not sweeping §9.3 wash recipes.** Dual-tier status vocabulary — gradient variant for pill chips, wash recipe for in-table state-as-metadata — is deliberate. Gradient chips in a 30-row × 4-chip-each table would shout over the content.

**Not adding `Switch` / `RadioGroup` primitives preemptively.** The system-prompt YAGNI rule (and the project's own "don't add features beyond what the task requires") applies. They'll land when a feature needs them.

## 12. Open follow-ups (not in this spec)

- Once this lands, revisit whether any new call sites (e.g. Admissions drill-down sheets, future Records dashboards) should use `<Alert variant="warning">` proactively. Not a blocker for this refresh.
- Consider whether the §9.4 pattern doc entry should be rewritten to simply say "use `<Alert variant>`" — doc-only edit for a later pass.
