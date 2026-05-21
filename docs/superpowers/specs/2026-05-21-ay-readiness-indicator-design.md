# AY Setup Readiness Indicator — Design Spec

**Date:** 2026-05-21  
**Status:** Approved — ready for implementation planning

---

## Problem

Admins setting up a new academic year have no in-product signal for which setup steps are complete or still pending. The five required surfaces (AY Setup → School Calendar → SOW → Sections → Grading Sheets) are scattered across the SIS Admin hub with no ordering, SOW has no hub card at all, and the sidebar groups things semantically (Academic Year / Organisation) rather than sequentially. First-time setup and AY rollovers rely entirely on institutional memory.

---

## Design decisions (final)

| Decision | Choice |
|----------|--------|
| Trigger style | Bottom-right pill (progress bar + fraction text) |
| Appears on | All `/sis/*` pages |
| Visibility logic | Completion-driven: appears when any step incomplete, auto-hides when all 5 done. No dismiss. |
| Step count | 5 (AY Setup, Calendar, SOW, Sections, Grading Sheets) |
| SOW display | Progress fraction throughout (gray 0%, yellow partial, green 100%) — done only at 100% coverage |
| Framing | Readiness indicator — not a workflow gate. Steps can be done in any order. |
| Hub change | "Academic Year" → "Year Setup" section with 5 numbered cards |
| Sidebar change | "Year Setup" group with numbered step items |

---

## Completion signals

| Step | Done when |
|------|-----------|
| **1 · AY Setup** | `academic_years` row for current AY has `start_date IS NOT NULL AND end_date IS NOT NULL` + ≥1 `terms` row linked to that AY |
| **2 · School Calendar** | ≥1 `school_calendar` row exists whose `term_id` belongs to the current AY |
| **3 · Scheme of Work** | Every `sow_master_templates` row for this AY has at least one `sow_published_versions` row. Fraction = published / total templates. |
| **4 · Sections** | ≥1 `sections` row for this AY with `level_id IS NOT NULL`, `curriculum_track IS NOT NULL`, and a `teacher_assignments` row with `role='form_adviser'` for that section |
| **5 · Grading Sheets** | ≥1 `grading_sheets` row for any section belonging to this AY |

SOW fraction denominator: `COUNT(*) FROM sow_master_templates WHERE ay_id = $ayId`.  
SOW fraction numerator: `COUNT(DISTINCT master_id) FROM sow_published_versions pv JOIN sow_master_templates mt ON mt.id = pv.master_id WHERE mt.ay_id = $ayId`.

---

## Component architecture

### `lib/sis/readiness.ts` — server lib

```ts
type ReadinessStepId = 'ay-setup' | 'calendar' | 'sow' | 'sections' | 'grading-sheets'

type ReadinessStep = {
  id: ReadinessStepId
  step: number           // 1–5
  label: string
  description: string    // subtext in the dialog row
  href: string           // "Open →" destination
  status: 'done' | 'partial' | 'not_started'
  fraction?: { done: number; total: number }  // SOW only
}

type AyReadiness = {
  ayCode: string
  steps: ReadinessStep[]
  complete: number       // steps with status === 'done'
  total: 5
}
```

`getAyReadiness(ayCode: string): Promise<AyReadiness>` — single function, runs 5 parallel queries via service client. Wrapped in `unstable_cache` with tag `sis:${ayCode}`, 60s TTL. Existing mutation routes already call `revalidateTag('sis:${ayCode}')`, so readiness invalidates alongside any SIS Admin data change.

### `components/sis/ay-readiness-pill.tsx` — client component

Props: `readiness: AyReadiness`

- Returns `null` when `readiness.complete === readiness.total` (auto-hide).
- Position: `fixed bottom-6 right-6 z-50`.
- Visual: white card, indigo→navy gradient icon tile (matches hub AdminCard icon style), progress bar fills left-to-right, subtext "X of 5 complete".
- Click: opens `<AyReadinessDialog>` via shadcn `<Dialog>` (controlled open state on the pill).
- No dismiss button.

### `components/sis/ay-readiness-dialog.tsx` — dialog content

Renders inside a `<DialogContent>`:

- Header: serif `"Year Setup Readiness"` + mono eyebrow `"SIS Admin · AY20XX"` + fraction badge.
- Subtitle: `"Steps can be completed in any order."`
- 5 step rows, each: status icon + label + description + "Open →" link.
  - Done: green check circle, `bg-mint/10 border-mint/30`.
  - Partial (SOW): yellow `~` circle, amber tint, inline progress bar + `"N/M covered"` fraction in amber.
  - Not started: muted number circle, neutral border.
- Footer: `"X of 5 complete · Steps can be completed in any order"`.

SOW row has its own inline `<progress>`-style bar between label and description — same color logic (gray 0%, amber partial, green 100%).

### SIS Admin layout (`app/(sis)/sis/layout.tsx`)

Fetch `getAyReadiness(ayCode)` server-side in the layout. Pass as prop to `<AyReadinessPill>` mounted at the bottom of the layout shell (outside `<PageShell>`, sibling to the main content). Pill appears on every `/sis/*` page automatically.

### Hub page (`app/(sis)/sis/page.tsx`)

**"Academic Year" section → "Year Setup" section:**

Replace the 2-card grid with a 5-card numbered grid. `AdminCard` gets a new optional `step?: number` prop rendered as a large muted mono numeral in the card's top-left (e.g. `01`, `02`).

| # | Card | Route | Allowed roles |
|---|------|-------|---------------|
| 1 | AY Setup | `/sis/ay-setup` | school_admin, superadmin |
| 2 | School Calendar | `/sis/calendar` | school_admin, superadmin |
| 3 | Scheme of Work | `/sis/admin/sow` | school_admin, superadmin |
| 4 | Sections | `/sis/sections` | school_admin, superadmin |
| 5 | Grading Sheets | `/markbook/sections` | registrar, school_admin, superadmin |

Card 5 (Grading Sheets) is a cross-module link. Description explains this: "Bulk-create grading sheets per section from the Markbook module. Complete once sections are set up."

**"Organisation" section** retains: Discount Codes + Sync from Admissions. Sections moves out into Year Setup.

### Sidebar (`lib/auth/roles.ts`)

`NavItem` type gets optional `step?: number`.

`NAV_BY_MODULE.sis` changes:

```
Before:
  { label: "Academic Year", items: [AY Setup, School Calendar] }
  { label: "Organisation", items: [Sections, Discount Codes, Sync, ...] }

After:
  { label: "Year Setup", items: [
      { step: 1, href: "/sis/ay-setup",       label: "AY Setup" },
      { step: 2, href: "/sis/calendar",        label: "School Calendar" },
      { step: 3, href: "/sis/admin/sow",       label: "Scheme of Work" },
      { step: 4, href: "/sis/sections",        label: "Sections" },
      { step: 5, href: "/markbook/sections",   label: "Grading Sheets" },
  ]}
  { label: "Organisation", items: [Discount Codes, Sync, ...] }
```

`SidebarNavItem` renders `step` as a small mono prefix badge (e.g. `01`) left of the label when present. Design: `text-[10px] font-mono text-muted-foreground/60 w-5 text-right flex-shrink-0` — unobtrusive, same style as existing mono eyebrows.

---

## Out of scope

- Push notifications or email when setup is incomplete.
- Per-user or per-section grading sheet completion tracking (AY-wide binary signal is sufficient for v1).
- The pill appearing in non-SIS modules (Markbook, Attendance, etc.).
- Wizard mode that forces step-by-step flow — readiness indicator only, no gating.
