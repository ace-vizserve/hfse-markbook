# SIS Admin Sidebar Cleanup — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Problem

The SIS Admin sidebar has a "Year Setup" nav group with 4 numbered steps (AY Setup, Calendar, Sections, Grading Sheets). The `AyReadinessPill` floating component already owns the year-setup journey — it lists all 5 steps with status indicators, descriptions, and deep links. The sidebar group is redundant and creates drift (the pill has 5 steps; the sidebar only had 4 — SOW was missing).

## Decision

Remove the Year Setup group from the sidebar. Make the pill always visible (even after all steps are complete) so it remains a persistent navigation entry point for setup pages.

## Changes

### 1. `lib/auth/roles.ts`

Delete the Year Setup `NavSection` from `SIS_NAV`:

```ts
// REMOVE this entire block:
{
  label: "Year Setup",
  items: [
    { step: 1, href: "/sis/ay-setup",      label: "AY Setup",        requiresRoles: ["school_admin", "superadmin"] },
    { step: 2, href: "/sis/calendar",      label: "School Calendar", requiresRoles: ["school_admin", "superadmin"] },
    { step: 3, href: "/sis/sections",      label: "Sections",        requiresRoles: ["school_admin", "superadmin"] },
    { step: 4, href: "/markbook/sections", label: "Grading Sheets",  requiresRoles: ["school_admin", "superadmin"] },
  ]
},
```

All other groups (Configuration, Access, System) are unchanged.

### 2. `components/sis/ay-readiness-pill.tsx`

**Remove the early-return guard:**

```ts
// REMOVE:
if (readiness.complete === readiness.total) return null;
```

**Add a "done" state** for the pill trigger body when `readiness.complete === readiness.total`:

- Replace `"{N} of {total} complete"` copy with `"All steps complete"`
- Replace the partial progress bar with a full solid mint bar (`w-full bg-brand-mint`)
- Pill remains clickable and opens the dialog (so users can navigate to any setup page)

No changes to the dialog content, the readiness engine (`lib/sis/readiness.ts`), or the layout.

## Non-goals

- No reordering or adding items to other sidebar groups
- No changes to who sees the pill (school_admin + superadmin only)
- No changes to the dialog or step descriptions

## Impact

| Role                      | Before                                      | After                               |
| ------------------------- | ------------------------------------------- | ----------------------------------- |
| school_admin / superadmin | Sidebar Year Setup + floating pill          | Floating pill only (always visible) |
| registrar                 | No Year Setup sidebar items (already gated) | No change                           |
| teacher / p-file          | No SIS sidebar                              | No change                           |

Setup pages (ay-setup, calendar, sections, markbook/sections, sow) remain fully navigable via the pill dialog. The SOW page also remains in the Configuration group for direct access.
