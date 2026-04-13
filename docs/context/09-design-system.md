# HFSE Markbook — Design System (Next.js / shadcn / Tailwind / Lucide)

> **Hard rule.** Every page, layout, and component must conform to this document. See `CLAUDE.md` § Hard rules #7.
>
> **Source of truth for colors, fonts, radius, and shadows:** [`app/app/globals.css`](../../app/app/globals.css). This doc describes *how to use* those tokens — it never redefines them. If a rule here conflicts with `globals.css`, `globals.css` wins and this doc must be updated to match.
>
> **Component rule:** always use shadcn/ui primitives from `@/components/ui/*` for any UI element that has one. Never use raw HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`, `<a>` styled as a button) when a shadcn equivalent exists. If an equivalent does not yet exist, add the shadcn primitive first, then use it — see §10 for the rule, exceptions, and current inventory.

---

## 1. Philosophy

**System identity:** “The Digital Ledger” — an institutional editorial aesthetic, blending a physical parchment ledger with a modern SaaS shell: **expansive, quiet, confidently colored, and profoundly organized**.

Core tenets:

- **Data‑first hierarchy** — grades, scores, and key metrics are always the visual focal point.
- **Whitespace is structural** — never fill empty space with boxes or borders.
- **Depth via color stacking** — not drop shadows; use tonal layers for elevation.
- **Meaningful color over monochrome** — `--primary` is the brand voice. Use it on every primary CTA, on every active navigation/filter state, on key metrics, and on "good" status badges. A page without any primary color on it is almost certainly wrong. See §11.
- **Restraint, not drabness** — every pixel must earn its place, but a corporate product is not a grayscale product. If a page feels flat, the fix is to promote the primary CTA and lean on the chart tokens for data, not to add more slate.

---

## 2. Next.js / stack conventions

| Concern        | Rule                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Framework      | Next.js App Router (TypeScript)                                                                                 |
| UI library     | shadcn/ui components                                                                                            |
| Styling        | Tailwind CSS + `app/globals.css` theme tokens                                                                   |
| Theme language | CSS variables (`--background`, `--foreground`, etc.)                                                            |
| Icons          | `lucide-react` (no Material Symbols)                                                                            |
| Typography     | `@next/font/google` for Inter + Manrope                                                                         |
| Dark mode      | `next-themes` class‑based: `html` can be `class="light"` or `class="dark"`                                      |
| Structure      | Layout in `app/layout.tsx`; shell components under `@/components`                                               |
| Design system  | Construct wrappers on shadcn primitives: `LedgerPage`, `LedgerCard`, `MarkbookTable`, `GradeChip`, `AppSidebar` |

---

## 3. Color system

**Tokens live in `app/app/globals.css` — do not redefine them here, in component files, or in `tailwind.config.*`.** If a new token is needed, add it to `globals.css` first, then reference it from components.

### 3.1 Available tokens

These are the shadcn‑compatible semantic tokens exposed by `globals.css`. Always use the Tailwind utility that maps to them (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, etc.) — never raw hex, never `slate-*`/`zinc-*`/`gray-*` utilities in app code.

| Token | Tailwind class | Usage |
| ----- | -------------- | ----- |
| `--background` | `bg-background` | Page canvas |
| `--foreground` | `text-foreground` | Primary text |
| `--card` / `--card-foreground` | `bg-card` / `text-card-foreground` | Data “paper”: cards, tables, forms |
| `--popover` / `--popover-foreground` | `bg-popover` / `text-popover-foreground` | Dropdowns, menus, tooltips |
| `--primary` / `--primary-foreground` | `bg-primary` / `text-primary-foreground` | Primary CTA, active nav, brand marks |
| `--secondary` / `--secondary-foreground` | `bg-secondary` / `text-secondary-foreground` | Secondary buttons, subtle highlights |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | Sidebar, disabled states, helper text |
| `--accent` / `--accent-foreground` | `bg-accent` / `text-accent-foreground` | Hovered nav items, subtle highlights |
| `--destructive` | `bg-destructive` / `text-destructive` | Errors, destructive actions |
| `--border` | `border-border` | Dividers, ghost borders |
| `--input` | `bg-input` / `border-input` | Form field surfaces |
| `--ring` | `ring-ring` | Focus rings |
| `--chart-1 … --chart-5` | `bg-chart-1` … `text-chart-5` | Charts and data viz |
| `--sidebar-*` | `bg-sidebar`, `text-sidebar-foreground`, … | Sidebar shell and items |

### 3.2 Surface levels (depth via tonal layers, not shadows)

| Level | Token | Usage |
| ----- | ----- | ----- |
| 0 | `bg-background` | Page canvas |
| 1 | `bg-muted` | Sidebar, subtle groupings |
| 2 | `bg-card` | Data “paper”: cards, tables, forms |
| 3 | `bg-accent` | Mid‑elevation containers, hover states |
| 4 | `bg-secondary` | Secondary buttons, highlights |

Depth: place lighter `bg-card` on `bg-muted` or `bg-background` to create natural elevation.

### 3.3 Rules

1. **Never hardcode colors.** No `#rrggbb`, no `oklch(...)`, no `slate-*` / `zinc-*` / `gray-*` utilities in `app/`, `components/`, or anywhere else outside `globals.css`.
2. **Never redefine tokens in component code.** Tokens are defined exactly once, in `globals.css`.
3. **To change a color, edit `globals.css`.** The change must propagate automatically to every consumer.
4. **Dark mode is also defined in `globals.css`** under `.dark`. Components must stay token‑driven so both themes work without conditional logic.

---

## 4. Typography & web‑app scale

Fonts are declared in `app/app/globals.css` via `--font-sans`, `--font-serif`, `--font-mono`, and exposed through Tailwind v4's `@theme inline` block. **Do not redeclare them in component code or in a `tailwind.config.*` file — Tailwind v4 has no JS config in this project.**

Current families (as defined in `globals.css`):

| Role | Token | Tailwind class | Current family |
| ---- | ----- | -------------- | -------------- |
| UI / body | `--font-sans` | `font-sans` (default) | Inter |
| Editorial / display | `--font-serif` | `font-serif` | Source Serif 4 |
| Numeric / code | `--font-mono` | `font-mono` | IBM Plex Mono |

Text‑style rules:

- **Body, labels, form text, data** → default `font-sans` (Inter).
- **Editorial display** (landing hero, login headline, report card title) → `font-serif` sparingly.
- **Metadata labels** → `text-[10px]` or `text-xs` + `font-semibold` + `uppercase tracking-wider`.
- **All numeric columns** → `tabular-nums`.

Web‑app heading cap: **no display‑scale hero‑style type** in dashboard pages; max heading is `text-3xl` (≈30px) for page titles. Auth screens and report cards may go larger.

---

## 5. Border radius

The base radius is defined in `globals.css` as `--radius` and exposed via `--radius-sm`/`md`/`lg`/`xl` in the `@theme inline` block. **Do not override these in component code.** Use the Tailwind utilities `rounded`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`.

Common usage:

- `rounded`: default elements
- `rounded-lg`: subtle rounding
- `rounded-xl`: cards, inputs, primary buttons
- `rounded-full`: pills, search, avatars
- `rounded-2xl`/`rounded-3xl`: hero‑style sections, large tables

Nested radius: if a parent has `rounded-xl` and `p-4`, nested elements should use `rounded-[calc(theme(borderRadius.xl) - theme(spacing.4))]` or `rounded-none` if the gap is larger than the radius. [web:1]

---

## 6. Layout (Next.js / Tailwind)

### 6.1 Page shell

- `layout.tsx` renders:
  - Fixed `AppSidebar` on the left (240px, `w-60`, `fixed`).
  - Main content offset by `ml-60` on desktop, `ml-0` plus collapsible drawer on mobile.
  - Glass header (sticky, `top-0`, `z-30`).
  - Page body with `p-6` to `p-16` as needed.

Semantic wrappers:

```tsx
<LedgerPage sidebar={<AppSidebar />} header={<GlassHeader />} main={<div className="p-8">{pageContent}</div>} />
```

Max‑width for ledger‑style sheets: `max-w-[850px]` on card‑style pages.

### 6.2 Spacing (Tailwind scale)

Use Tailwind’s 4px‑based scale:

- `gap-2` / `p-2` → 8px (icons, tight spacing)
- `gap-3` / `p-3` → 12px (icon‑text pairs)
- `gap-4` / `p-4` → 16px (standard component spacing)
- `gap-6` / `p-6` → 24px (section, card padding)
- `p-8` → 32px
- `p-12` → 48px
- `p-16` → 64px

### 6.3 Grids

- Metadata: `grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-12`
- Card grids: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Responsive hiding: `hidden lg:flex`, `hidden md:block`

---

## 7. Elevation & shadows

- Depth via **tonal layers** (`background → muted → card → accent → surface-container-high`).
- Shadows are reserved for:
  - Primary CTA: `shadow-md` with `shadow-primary/20`‑style tint.
  - Hover on cards: `hover:shadow-lg` (only on hover).
  - Floating modals: a custom box‑shadow (e.g., `0 12px 40px -12px rgba(55, 85, 195, 0.1)`).
- In dark mode: `dark:shadow-none`.

Glass header:

```css
.glass-header {
  background-color: rgba(250, 248, 255, 0.8); /* or var(--color-surface) at 80% */
  backdrop-filter: blur(12px);
}
```

Apply to sticky header with `sticky top-0 z-30 border-b border-outline-variant/20 shadow-sm`‑style tokens.

---

## 8. Borders

- Prefer **background‑shift boundaries** over 1px solid lines.
- When a structural border is unavoidable:
  - Table rows: `border-b border-border/10` (ghost).
  - Sidebar bottom: `border-t border-border/50`.
  - Glass header bottom: `border-b border-border/20`.
- Use shadcn `border` tokens (not opaque greys).

Sidebar: explicitly no right border (`border-r-0`); divide from main content via `--muted` vs `--background` or `--card`.

---

## 9. Components (shadcn‑based)

### 9.1 Buttons

- **Primary CTA**:
  - `className="bg-primary text-primary-foreground font-headline font-bold px-4 py-3 rounded-xl shadow-md shadow-primary/20 hover:opacity-90 transition-opacity flex items-center gap-2"`

- **Primary with soft gradient**:
  - `bg-gradient-to-r from-primary to-primary-container text-primary-foreground ...`

- **Secondary**:
  - `bg-secondary text-secondary-foreground font-bold px-4 py-3 rounded-xl hover:opacity-90 transition-opacity`

- **Sidebar action**:
  - `w-full bg-primary-container text-primary-foreground py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition-all`

States:

- Hover: `hover:opacity-90` or `hover:brightness-110`
- Active: `active:scale-[0.98]` or `active:scale-95 active:transition-all`
- Focus: `focus:ring-2 focus:ring-ring/20`

### 9.2 Inputs

From `shadcn/ui` `Input`:

```tsx
<input className="w-full bg-input border border-border/40 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all" />
```

- Background: `bg-input` (maps to `surface-container-low`).
- Border: `border-border/40` (ghost border).
- Focus: 1‑px `border-primary` + `ring-ring/20`.
- Search: `rounded-full`.

### 9.3 Cards

Use shadcn `Card` with minimal decoration:

```tsx
<div className="bg-card rounded-xl p-6 border-0">{children}</div>
```

- No borders; rely on `bg-card` vs parent surface.
- Place on `--muted` or `--background` for visible distinction.
- Hover (if interactive): `hover:shadow-lg transition-all`.
- Internal padding: `p-6` or `p-8`.

### 9.4 Navigation (Sidebar)

- Active item:

```tsx
<li className="rounded-none border-l-4 border-primary pl-4 flex items-center gap-3 py-3 px-4 text-primary font-bold bg-transparent hover:bg-primary/10 dark:hover:bg-primary/10">
  Add icon + text
</li>
```

- Inactive item:

```tsx
<li className="rounded-none pl-4 flex items-center gap-3 py-3 px-4 text-muted-foreground hover:bg-primary/10 dark:hover:bg-primary/10">
  Add icon + text
</li>
```

Rules:

- Active: thin left accent bar (`border-l-4 border-primary`), bold text.
- Nav label font: `font-headline text-base` or `text-lg tracking-tight`.
- Use `Lucide` icons, not Material Symbols.

### 9.5 Data tables

- Header: `bg-primary text-primary-foreground font-headline`.
- Row dividers: `border-b border-border/10`.
- Numeric columns: `tabular-nums text-center`.
- Dense lists: zebra striping using alternating `bg-muted/30` on rows.
- Active cell (if needed): 2px left accent bar, not full‑row highlight.

Prefer `shadcn`‑style `DataTable` built on TanStack Table, with sticky header and `scroll-area` for vertical overflow. [web:24]

### 9.6 Badges / Grade chips

High score:

```tsx
<span className="px-3 py-1 rounded-full text-xs font-bold bg-primary-fixed text-on-primary-fixed">95%</span>
```

Low score:

```tsx
<span className="px-3 py-1 rounded-full text-xs font-bold bg-tertiary-fixed text-on-tertiary-fixed">42%</span>
```

### 9.7 Top bar (Glass header)

```tsx
<header className="sticky top-0 z-30 glass-header border-b border-border/20">
  ...
</header>
```

---

## 10. Always use shadcn components (binding rule)

All UI must be built from the shadcn/ui primitives in `@/components/ui/*`. Raw HTML elements that have a shadcn equivalent are forbidden in `app/` and `components/` (outside of `components/ui/` itself, where the primitives are defined).

### 10.1 Required mappings

| Don't write | Use instead | Import |
| ----------- | ----------- | ------ |
| `<button>` | `Button` | `@/components/ui/button` |
| `<a>` styled as a button | `<Button asChild><Link>…</Link></Button>` | `@/components/ui/button` + `next/link` |
| `<input>` | `Input` | `@/components/ui/input` |
| `<label>` | `Label` | `@/components/ui/label` |
| `<textarea>` | `Textarea` | `@/components/ui/textarea` |
| `<select>` | `Select` (shadcn/Radix) | `@/components/ui/select` (must be added before first use) |
| `<table>` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | `@/components/ui/table` |
| `<dialog>` / custom modal | `Sheet` or `Dialog` | `@/components/ui/sheet` (Dialog TBD) |
| `<div role="alert">` | `Alert`, `AlertTitle`, `AlertDescription` | `@/components/ui/alert` |
| hand-rolled badge `<span>` | `Badge` | `@/components/ui/badge` |
| hand-rolled card `<div>` with border+bg | `Card` or `Surface` | `@/components/ui/card` or `@/components/ui/surface` |

Page shell and page headers must use the project-local wrappers built on top of shadcn:

| Concern | Component | Import |
| ------- | --------- | ------ |
| Page container (`max-w-6xl mx-auto space-y-8`) | `PageShell` | `@/components/ui/page-shell` |
| Page header (eyebrow + serif title + description + actions) | `PageHeader` | `@/components/ui/page-header` |
| Content surface (`bg-card border rounded-xl shadow-sm`) | `Surface` + optional `SurfaceHeader`/`SurfaceTitle`/`SurfaceDescription` | `@/components/ui/surface` |

### 10.2 Current primitive inventory

Available in `app/components/ui/` today:

- `alert`, `badge`, `button`, `card`, `checkbox`, `input`, `label`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `table`, `textarea`, `tooltip`
- Project wrappers: `page-shell`, `page-header`, `surface`

### 10.3 If a shadcn primitive doesn't exist yet, install it — never fall back to raw HTML

**Binding rule:** when a page needs a UI element whose shadcn primitive isn't in `components/ui/` yet, **stop and install it first.** Do not ship native `<select>`, `<input type="checkbox">`, `<dialog>`, etc. as a "temporary fallback." There are no temporary fallbacks.

The install workflow:

1. Add the required Radix dep: `npm install @radix-ui/react-<name>` from inside `app/`. Commit `package.json` + `package-lock.json` in the same change.
2. Create `app/components/ui/<name>.tsx` using the shadcn/ui reference implementation, adjusted to this project's conventions:
   - Use only semantic token classes (`bg-background`, `text-foreground`, `border-input`, `ring-ring`, etc.).
   - No `slate-*` / `zinc-*` / `gray-*` / raw hex.
   - Keep exports aligned with shadcn's public API so page code reads like the docs.
3. Add the primitive name to §10.2 above in alphabetical order.
4. Now use it in the page.

### 10.4 Documented exceptions (density and print only)

These are the **only** places raw HTML elements are allowed, because no shadcn primitive can serve them without harming the feature:

1. **Native `<input>` inside data-grid cells** — allowed when the cell needs tight density (height < 32px) that shadcn `Input` cannot deliver without significant className overrides. Must be wrapped in its own `<td>` with token-driven styling. Current files:
   - `components/grading/score-entry-grid.tsx` (numeric cell inputs)
   - `app/(dashboard)/admin/sections/[id]/attendance/attendance-grid.tsx` (numeric cell inputs)
2. **Native `<table>` in print targets** — the report card paper layout (`app/(dashboard)/report-cards/[studentId]/page.tsx`) uses two raw `<table>` elements because the shadcn `Table` wraps them in an `overflow-auto` div that breaks print pagination. Print-only. Any on-screen table must use shadcn `Table`.

Any other raw-HTML usage is a bug — either replace it with the existing shadcn primitive, or install the missing primitive per §10.3.

---

## 11. Color emphasis — use `--primary` meaningfully

The design system does **not** forbid color. It requires color where it carries meaning. A page that uses only `bg-card`, `bg-muted`, and `text-muted-foreground` is too flat and must be corrected.

### 11.1 Where primary color is required

1. **Primary CTA per page/section** — every page has at most one primary action (Sign in, Create grading sheet, Add student, Commit sync, etc.). It must use `<Button>` **default variant** (`bg-primary text-primary-foreground`). Never use `variant="outline"` for a primary CTA. Secondary actions on the same page use `variant="outline"` or `variant="ghost"`.
2. **Active navigation/filter state** — the current sidebar item, the selected filter chip, the selected section pill: all use `bg-primary text-primary-foreground` (or `border-primary` for chips). Inactive states use `bg-card` / `bg-accent` on hover.
3. **"Good" or "open" status badges** — `<Badge>` default variant is primary. Use it for Open / Active / Passing / Ready states. Reserve `variant="secondary"` for neutral states (Locked, Withdrawn, Draft) and `variant="destructive"` for errors.
4. **Icon tiles on surface cards** — QuickLink-style entry cards (dashboard home, admin hub) use a `bg-primary/10 text-primary border-primary/20` tile instead of `bg-muted text-foreground`. The contrast carries the brand and makes the card identifiable as an action.
5. **Key metric values** — the *primary* number in a stat card (Total sheets, Source rows, Overall grade) uses `font-serif text-primary` so the number reads as a headline. Supporting values stay `text-foreground` or `text-muted-foreground`.

### 11.2 Where primary color must NOT be used

- Body text and labels (use `text-foreground` / `text-muted-foreground`).
- Table row backgrounds (use tonal shifts via `bg-card` and hover `bg-accent`).
- Decorative borders on every surface (only the *active* surface gets `border-primary`).
- Destructive actions (use `bg-destructive`, not primary).

### 11.3 Beyond primary — using the chart and accent tokens

For data visualization and multi-state status, use the chart tokens (`chart-1` through `chart-5`) rather than inventing new colors. For subtle brand-tinted backgrounds (callouts, info banners, hover states), use `bg-accent text-accent-foreground`. For destructive/error, use `bg-destructive`.

### 11.4 Review checklist — applied per page

Before shipping a page, check:

- [ ] Is there at least one `bg-primary` element above the fold (button, badge, nav item, icon tile)?
- [ ] Is the single primary CTA using `<Button>` default variant, not `outline`?
- [ ] Do "Open"/"Active" badges use `variant="default"` and "Locked"/"Withdrawn" use `variant="secondary"`?
- [ ] Do key metric values read as headlines (`font-serif text-primary` or similar), not body text?
- [ ] Is the primary color used for *meaning* (state, action, identity), not as decoration?

If every answer is yes, the page is on brand. If the page feels "plain" and any answer is no, fix that first before reaching for more surfaces or more spacing.
