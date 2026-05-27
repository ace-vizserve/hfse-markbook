# SIS Sidebar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant "Year Setup" nav group from the SIS Admin sidebar and make the AyReadinessPill always visible so it becomes the sole navigation entry point for setup pages.

**Architecture:** Two surgical edits — delete one `NavSection` from the static `SIS_NAV` array; remove one early-return guard from the pill and swap in a "done" state UI variant.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui, Lucide icons.

---

## Files

| Action | File                                   | Change                                                  |
| ------ | -------------------------------------- | ------------------------------------------------------- |
| Modify | `lib/auth/roles.ts`                    | Delete the Year Setup NavSection from SIS_NAV           |
| Modify | `components/sis/ay-readiness-pill.tsx` | Remove complete===total guard; add done-state pill body |

---

### Task 1: Remove the Year Setup nav group

**Files:**

- Modify: `lib/auth/roles.ts` (lines ~347–359, the Year Setup NavSection)

- [ ] **Step 1: Delete the Year Setup block from SIS_NAV**

In `lib/auth/roles.ts`, find `SIS_NAV` (around line 345). Delete the entire Year Setup NavSection — the block with the numbered comment and 4 items — so the array goes directly from the Admin Hub item to the Organisation group:

```ts
const SIS_NAV: NavSection[] = [
  { items: [{ href: '/sis', label: 'Admin Hub' }] },
  // ← Year Setup block deleted entirely
  {
    label: 'Organisation',
    items: [
      {
        href: '/sis/admin/sow',
        label: 'Scheme of Work',
        requiresRoles: ['school_admin', 'superadmin'],
      },
      {
        href: '/sis/admin/discount-codes',
        label: 'Discount Codes',
        requiresRoles: ['registrar', 'school_admin', 'superadmin'],
      },
      {
        href: '/sis/admin/subjects',
        label: 'Subject Weights',
        requiresRoles: ['school_admin', 'superadmin'],
      },
      {
        href: '/sis/admin/template',
        label: 'Class Template',
        requiresRoles: ['school_admin', 'superadmin'],
      },
      {
        href: '/sis/sync-students',
        label: 'Sync from Admissions',
        requiresRoles: ['registrar', 'school_admin', 'superadmin'],
      },
    ],
  },
  {
    label: 'Access',
    items: [
      {
        href: '/sis/admin/approvers',
        label: 'Approvers',
        requiresRoles: ['superadmin'],
      },
      {
        href: '/sis/admin/users',
        label: 'Users',
        requiresRoles: ['superadmin'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/sis/admin/school-config',
        label: 'School Config',
        requiresRoles: ['school_admin', 'superadmin'],
      },
      {
        href: '/sis/admin/settings',
        label: 'Settings',
        requiresRoles: ['superadmin'],
      },
      {
        href: '/sis/audit-log',
        label: 'Audit Log',
        requiresRoles: ['school_admin', 'superadmin'],
      },
    ],
  },
];
```

- [ ] **Step 2: Verify build is clean**

```
npx next build 2>&1 | tail -5
```

Expected: no TypeScript errors, build completes.

- [ ] **Step 3: Commit**

```
git add lib/auth/roles.ts
git commit -m "refactor(sis): remove Year Setup nav group — pill is the canonical setup nav"
```

---

### Task 2: Make the AyReadinessPill always visible + add done-state

**Files:**

- Modify: `components/sis/ay-readiness-pill.tsx`

- [ ] **Step 1: Remove the complete===total early-return guard**

In `components/sis/ay-readiness-pill.tsx`, delete this line (currently line ~52):

```ts
// DELETE this line:
if (readiness.complete === readiness.total) return null;
```

- [ ] **Step 2: Add a `done` boolean and branch the pill trigger body**

Replace the `pct` declaration and the pill trigger's inner `<div className="text-left">` block with a done-aware version:

```tsx
const done = readiness.complete === readiness.total;
const pct = done
  ? 100
  : Math.round((readiness.complete / readiness.total) * 100);
```

Replace the `<div className="text-left">` block inside the trigger button with:

```tsx
<div className="text-left">
  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
    Year Setup · {readiness.ayCode}
  </p>
  {done ? (
    <p className="mt-0.5 font-serif text-sm font-semibold leading-tight text-brand-mint">
      All steps complete
    </p>
  ) : (
    <p className="mt-0.5 font-serif text-sm font-semibold leading-tight text-foreground">
      {readiness.complete}{' '}
      <span className="font-sans text-[13px] font-normal text-muted-foreground">
        of {readiness.total} complete
      </span>
    </p>
  )}
  <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-muted">
    <div
      className={[
        'h-full rounded-full transition-all duration-500',
        done
          ? 'bg-brand-mint'
          : 'bg-gradient-to-r from-brand-indigo to-brand-mint',
      ].join(' ')}
      style={{ width: `${pct}%` }}
    />
  </div>
</div>
```

- [ ] **Step 3: Verify build is clean**

```
npx next build 2>&1 | tail -5
```

Expected: no TypeScript errors, build completes.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`npm run dev`). Sign in as `school_admin` or `superadmin`.

- Navigate to `/sis` — confirm the "Year Setup" sidebar group is gone.
- Confirm the floating pill is visible in the bottom-right corner.
- If all 5 readiness steps are done: pill shows "All steps complete" in mint with a solid mint bar.
- If steps are incomplete: pill shows "N of 5 complete" with a gradient bar as before.
- Click the pill — dialog opens, all step rows with deep links present.

- [ ] **Step 5: Commit**

```
git add components/sis/ay-readiness-pill.tsx
git commit -m "feat(sis): pill always visible — done state shows 'All steps complete'"
```

---

### Task 3: Push

- [ ] **Step 1: Rebase and push**

```
git pull --rebase origin main
git push origin main
```
