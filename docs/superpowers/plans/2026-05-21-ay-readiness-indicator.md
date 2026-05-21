# AY Setup Readiness Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the 5-step AY setup sequence (AY Setup → School Calendar → SOW → Sections → Grading Sheets) as a floating readiness pill on all `/sis/*` pages, add numbered hub cards, and add numbered sidebar items — so school_admin and superadmin always know what's complete and what's left.

**Architecture:** A new `lib/sis/readiness.ts` server lib computes completion state for all 5 steps via 5 parallel Supabase queries, cached under the existing `sis:${ayCode}` tag. The result is fetched in `app/(sis)/layout.tsx` and passed as a prop to a client-side `<AyReadinessPill>` component that floats bottom-right and opens a dialog on click. The hub page gains a "Year Setup" section with 5 numbered `AdminCard`s; the sidebar gains a "Year Setup" nav group with numbered step items.

**Tech Stack:** Next.js 15 App Router (server components + client components), Supabase service client, shadcn `Dialog`, Tailwind v4 tokens (`brand-indigo`, `brand-mint`, `brand-amber`), `unstable_cache`.

**Spec note:** `academic_years` has no `start_date`/`end_date` columns — those live on `terms`. Step 1 (AY Setup) is therefore done when the AY row exists AND ≥1 term for that AY has both `start_date IS NOT NULL` AND `end_date IS NOT NULL`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `lib/sis/readiness.ts` | Types + `getAyReadiness(ayCode)` — 5-query completion engine |
| **Create** | `components/sis/ay-readiness-pill.tsx` | Floating pill + dialog — single client component file |
| **Modify** | `lib/auth/roles.ts` | Add `step?: number` to `NavItem`; restructure `SIS_NAV` |
| **Modify** | `components/module-sidebar/sidebar-nav-item.tsx` | Render step number prefix when `item.step` is set |
| **Modify** | `app/(sis)/layout.tsx` | Fetch readiness; mount `<AyReadinessPill>` |
| **Modify** | `app/(sis)/sis/page.tsx` | Replace "Academic Year" section with numbered "Year Setup" section |

---

## Task 1: `lib/sis/readiness.ts` — completion engine

**Files:**
- Create: `lib/sis/readiness.ts`

- [ ] **Step 1.1: Create the file with types**

```typescript
// lib/sis/readiness.ts
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type ReadinessStepId =
  | "ay-setup"
  | "calendar"
  | "sow"
  | "sections"
  | "grading-sheets";

export type ReadinessStep = {
  id: ReadinessStepId;
  step: number;
  label: string;
  description: string;
  href: string;
  status: "done" | "partial" | "not_started";
  fraction?: { done: number; total: number };
};

export type AyReadiness = {
  ayCode: string;
  steps: ReadinessStep[];
  complete: number;
  total: 5;
};
```

- [ ] **Step 1.2: Add the 5 step-check helpers**

Append to `lib/sis/readiness.ts`:

```typescript
async function checkAySetup(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "ay-setup",
    step: 1,
    label: "AY Setup",
    href: "/sis/ay-setup",
  };

  const { count } = await db
    .from("terms")
    .select("id", { count: "exact", head: true })
    .eq("academic_year_id", ayId)
    .not("start_date", "is", null)
    .not("end_date", "is", null);

  const done = (count ?? 0) > 0;
  return {
    ...base,
    status: done ? "done" : "not_started",
    description: done
      ? "Academic year active with dated terms"
      : "Create the academic year and define term dates",
  };
}

async function checkCalendar(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "calendar",
    step: 2,
    label: "School Calendar",
    href: "/sis/calendar",
  };

  // Total terms for this AY
  const { count: totalTerms } = await db
    .from("terms")
    .select("id", { count: "exact", head: true })
    .eq("academic_year_id", ayId);

  if (!totalTerms || totalTerms === 0) {
    return { ...base, status: "not_started", description: "Define AY terms first" };
  }

  // Terms that have at least one school_calendar row
  const { data: termIds } = await db
    .from("terms")
    .select("id")
    .eq("academic_year_id", ayId);

  const ids = (termIds ?? []).map((t) => t.id);

  const { data: coveredRows } = await db
    .from("school_calendar")
    .select("term_id")
    .in("term_id", ids);

  const coveredTerms = new Set((coveredRows ?? []).map((r) => r.term_id)).size;
  const done = coveredTerms === totalTerms;

  return {
    ...base,
    status: done ? "done" : coveredTerms > 0 ? "partial" : "not_started",
    description: done
      ? "All terms have calendar coverage"
      : `${coveredTerms} of ${totalTerms} terms have calendar entries`,
  };
}

async function checkSow(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "sow",
    step: 3,
    label: "Scheme of Work",
    href: "/sis/admin/sow",
  };

  // Denominator: distinct (subject_id, level_id, curriculum_track) from master template
  // template_sections.curriculum_track is NOT NULL DEFAULT — no null filter needed
  const { data: templateRows } = await db
    .from("template_subject_configs")
    .select("subject_id, template_sections!inner(level_id, curriculum_track)");

  const requiredSet = new Set(
    (templateRows ?? []).map((r) => {
      const ts = r.template_sections as { level_id: string; curriculum_track: string };
      return `${r.subject_id}:${ts.level_id}:${ts.curriculum_track}`;
    }),
  );
  const required = requiredSet.size;

  if (required === 0) {
    return {
      ...base,
      status: "not_started",
      description: "No curriculum template defined yet",
      fraction: { done: 0, total: 0 },
    };
  }

  // Numerator: distinct published (subject_id, level_id, curriculum_track) for this AY
  const { data: publishedRows } = await db
    .from("sow_master_templates")
    .select("subject_id, level_id, curriculum_track, sow_published_versions!inner(id)")
    .eq("ay_id", ayId);

  const publishedSet = new Set(
    (publishedRows ?? []).map((r) => `${r.subject_id}:${r.level_id}:${r.curriculum_track}`),
  );
  const published = publishedSet.size;

  const done = published === required;
  const status = done ? "done" : published > 0 ? "partial" : "not_started";

  return {
    ...base,
    status,
    description: done
      ? "Full SOW coverage published"
      : `${published} of ${required} subject × level × track combinations published`,
    fraction: { done: published, total: required },
  };
}

async function checkSections(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "sections",
    step: 4,
    label: "Sections",
    href: "/sis/sections",
  };

  // Sections with level + track set and a form adviser assigned
  const { data: sectionIds } = await db
    .from("sections")
    .select("id")
    .eq("academic_year_id", ayId)
    .not("level_id", "is", null)
    .not("curriculum_track", "is", null);

  if (!sectionIds || sectionIds.length === 0) {
    return { ...base, status: "not_started", description: "No sections created for this AY" };
  }

  const ids = sectionIds.map((s) => s.id);

  const { count: advisedCount } = await db
    .from("teacher_assignments")
    .select("id", { count: "exact", head: true })
    .in("section_id", ids)
    .eq("role", "form_adviser");

  const done = (advisedCount ?? 0) > 0;
  return {
    ...base,
    status: done ? "done" : "partial",
    description: done
      ? `${sectionIds.length} sections created with form advisers assigned`
      : `${sectionIds.length} sections created — assign form advisers`,
  };
}

async function checkGradingSheets(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "grading-sheets",
    step: 5,
    label: "Grading Sheets",
    href: "/markbook/sections",
  };

  const { data: allSections } = await db
    .from("sections")
    .select("id")
    .eq("academic_year_id", ayId);

  const totalSections = (allSections ?? []).length;

  if (totalSections === 0) {
    return {
      ...base,
      status: "not_started",
      description: "Create sections first",
      fraction: { done: 0, total: 0 },
    };
  }

  const sectionIds = allSections!.map((s) => s.id);

  const { data: sheetRows } = await db
    .from("grading_sheets")
    .select("section_id")
    .in("section_id", sectionIds);

  const sectionsWithSheets = new Set((sheetRows ?? []).map((r) => r.section_id)).size;
  const done = sectionsWithSheets === totalSections;

  return {
    ...base,
    status: done ? "done" : sectionsWithSheets > 0 ? "partial" : "not_started",
    description: done
      ? "Grading sheets created for all sections"
      : `${sectionsWithSheets} of ${totalSections} sections have grading sheets`,
    fraction: { done: sectionsWithSheets, total: totalSections },
  };
}
```

- [ ] **Step 1.3: Add the main exported function with caching**

Append to `lib/sis/readiness.ts`:

```typescript
function buildAllNotStarted(ayCode: string): AyReadiness {
  const steps: ReadinessStep[] = [
    { id: "ay-setup", step: 1, label: "AY Setup", href: "/sis/ay-setup", status: "not_started", description: "Create the academic year and define term dates" },
    { id: "calendar", step: 2, label: "School Calendar", href: "/sis/calendar", status: "not_started", description: "Generate school days for all terms" },
    { id: "sow", step: 3, label: "Scheme of Work", href: "/sis/admin/sow", status: "not_started", description: "Publish SOW for each subject × level × track combination", fraction: { done: 0, total: 0 } },
    { id: "sections", step: 4, label: "Sections", href: "/sis/sections", status: "not_started", description: "Create sections and assign form advisers" },
    { id: "grading-sheets", step: 5, label: "Grading Sheets", href: "/markbook/sections", status: "not_started", description: "Bulk-create grading sheets in Markbook → Sections", fraction: { done: 0, total: 0 } },
  ];
  return { ayCode, steps, complete: 0, total: 5 };
}

async function getAyReadinessUncached(ayCode: string): Promise<AyReadiness> {
  const db = createServiceClient();

  const { data: ay } = await db
    .from("academic_years")
    .select("id")
    .eq("ay_code", ayCode)
    .maybeSingle();

  if (!ay) return buildAllNotStarted(ayCode);

  const [step1, step2, step3, step4, step5] = await Promise.all([
    checkAySetup(db, ay.id),
    checkCalendar(db, ay.id),
    checkSow(db, ay.id),
    checkSections(db, ay.id),
    checkGradingSheets(db, ay.id),
  ]);

  const steps = [step1, step2, step3, step4, step5];
  const complete = steps.filter((s) => s.status === "done").length;
  return { ayCode, steps, complete, total: 5 };
}

export const getAyReadiness = (ayCode: string) =>
  unstable_cache(
    () => getAyReadinessUncached(ayCode),
    [`sis-readiness-${ayCode}`],
    { tags: [`sis:${ayCode}`], revalidate: 60 },
  )();
```

- [ ] **Step 1.4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `lib/sis/readiness.ts`. If the PostgREST relationship selector for `template_sections!inner` returns a type error, cast as `unknown` then to the expected shape.

- [ ] **Step 1.5: Commit**

```bash
git add lib/sis/readiness.ts
git commit -m "feat(sis): AY readiness completion engine with 5-step signals"
```

---

## Task 2: `NavItem` type + SIS sidebar restructure

**Files:**
- Modify: `lib/auth/roles.ts`

- [ ] **Step 2.1: Add `step` to `NavItem` type**

In `lib/auth/roles.ts`, find:

```typescript
export type NavItem = {
  href: string;
  label: string;
  badgeKey?: SidebarBadgeKey;
  requiresRoles?: Role[];
};
```

Replace with:

```typescript
export type NavItem = {
  href: string;
  label: string;
  badgeKey?: SidebarBadgeKey;
  requiresRoles?: Role[];
  step?: number;
};
```

- [ ] **Step 2.2: Replace `SIS_NAV` "Academic Year" group with "Year Setup"**

Find the `const SIS_NAV` definition. Replace the current `"Academic Year"` section and the `"Organisation"` items that belong in Year Setup:

```typescript
const SIS_NAV: NavSection[] = [
  { items: [{ href: "/sis", label: "Admin Hub" }] },
  {
    label: "Year Setup",
    items: [
      { step: 1, href: "/sis/ay-setup",     label: "AY Setup",          requiresRoles: ["school_admin", "superadmin"] },
      { step: 2, href: "/sis/calendar",     label: "School Calendar",   requiresRoles: ["school_admin", "superadmin"] },
      { step: 3, href: "/sis/admin/sow",    label: "Scheme of Work",    requiresRoles: ["school_admin", "superadmin"] },
      { step: 4, href: "/sis/sections",     label: "Sections",          requiresRoles: ["school_admin", "superadmin"] },
      { step: 5, href: "/markbook/sections",label: "Grading Sheets",    requiresRoles: ["school_admin", "superadmin"] },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/sis/admin/discount-codes", label: "Discount Codes",    requiresRoles: ["registrar", "school_admin", "superadmin"] },
      { href: "/sis/admin/subjects",       label: "Subject Weights",   requiresRoles: ["school_admin", "superadmin"] },
      { href: "/sis/admin/template",       label: "Class Template",    requiresRoles: ["school_admin", "superadmin"] },
      { href: "/sis/sync-students",        label: "Sync from Admissions", requiresRoles: ["registrar", "school_admin", "superadmin"] },
    ],
  },
  {
    label: "Access",
    items: [
      { href: "/sis/admin/approvers", label: "Approvers", requiresRoles: ["superadmin"] },
      { href: "/sis/admin/users",     label: "Users",     requiresRoles: ["superadmin"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sis/admin/school-config",        label: "School Config", requiresRoles: ["school_admin", "superadmin"] },
      { href: "/sis/admin/evaluation-checklists",label: "Evaluation Checklists", requiresRoles: ["school_admin", "superadmin"] },
      { href: "/sis/admin/settings",             label: "Settings",      requiresRoles: ["superadmin"] },
      { href: "/sis/audit-log",                  label: "Audit Log",     requiresRoles: ["school_admin", "superadmin"] },
    ],
  },
];
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 2.4: Commit**

```bash
git add lib/auth/roles.ts
git commit -m "feat(sis): Year Setup nav group with numbered steps in SIS sidebar"
```

---

## Task 3: Step prefix in `SidebarNavItem`

**Files:**
- Modify: `components/module-sidebar/sidebar-nav-item.tsx`

- [ ] **Step 3.1: Render step number when present**

In `components/module-sidebar/sidebar-nav-item.tsx`, replace the `<Link>` inner content:

```tsx
<Link href={item.href}>
  <Icon />
  <span>{item.label}</span>
  {badge > 0 && (
    <span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-semibold tabular-nums text-white group-data-[collapsible=icon]:hidden">
      {badge}
    </span>
  )}
</Link>
```

Replace with:

```tsx
<Link href={item.href}>
  <Icon />
  {item.step != null && (
    <span className="w-5 flex-shrink-0 text-right font-mono text-[10px] text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
      {String(item.step).padStart(2, "0")}
    </span>
  )}
  <span>{item.label}</span>
  {badge > 0 && (
    <span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-semibold tabular-nums text-white group-data-[collapsible=icon]:hidden">
      {badge}
    </span>
  )}
</Link>
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add components/module-sidebar/sidebar-nav-item.tsx
git commit -m "feat(sis): render step number prefix on sidebar nav items"
```

---

## Task 4: `<AyReadinessPill>` — floating pill + dialog

**Files:**
- Create: `components/sis/ay-readiness-pill.tsx`

This is a single `"use client"` file containing both the pill trigger and the dialog.

- [ ] **Step 4.1: Create the component**

```tsx
// components/sis/ay-readiness-pill.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role } from "@/lib/auth/roles";
import type { AyReadiness, ReadinessStep } from "@/lib/sis/readiness";

type Props = {
  readiness: AyReadiness;
  role: Role | null;
};

export function AyReadinessPill({ readiness, role }: Props) {
  const [open, setOpen] = useState(false);

  // Admin-only: registrar and below never see this
  if (role !== "school_admin" && role !== "superadmin") return null;
  // Auto-hide when all steps are done
  if (readiness.complete === readiness.total) return null;

  const pct = Math.round((readiness.complete / readiness.total) * 100);

  return (
    <>
      {/* Floating pill trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-border bg-background px-4 py-2 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
        aria-label="Open AY setup readiness"
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="text-left">
          <p className="text-[11px] font-semibold leading-tight text-foreground">
            {readiness.ayCode} readiness
          </p>
          {/* Progress bar */}
          <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-mint transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {readiness.complete} of {readiness.total} complete
          </p>
        </div>
      </button>

      {/* Readiness dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              SIS Admin · {readiness.ayCode}
            </p>
            <DialogTitle className="font-serif text-xl font-semibold tracking-tight">
              Year Setup Readiness
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Steps can be completed in any order.
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {readiness.steps.map((step) => (
              <ReadinessRow key={step.id} step={step} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span className="font-semibold">
              {readiness.complete} of {readiness.total} complete
            </span>
            <span>Steps can be completed in any order</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadinessRow({
  step,
  onNavigate,
}: {
  step: ReadinessStep;
  onNavigate: () => void;
}) {
  const isDone = step.status === "done";
  const isPartial = step.status === "partial";

  const rowBg = isDone
    ? "bg-success/10 border-success/30"
    : isPartial
      ? "bg-warning/10 border-warning/30"
      : "bg-background border-border";

  const iconEl = isDone ? (
    <CheckCircle2 className="h-5 w-5 text-success" />
  ) : isPartial ? (
    <Clock className="h-5 w-5 text-warning" />
  ) : (
    <Circle className="h-5 w-5 text-muted-foreground/40" />
  );

  const pct =
    step.fraction && step.fraction.total > 0
      ? Math.round((step.fraction.done / step.fraction.total) * 100)
      : 0;

  const barColor = isDone
    ? "bg-success"
    : isPartial
      ? "bg-warning"
      : "bg-muted";

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${rowBg}`}>
      <div className="mt-0.5 flex-shrink-0">{iconEl}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isDone ? "text-foreground" : isPartial ? "text-foreground" : "text-muted-foreground"}`}>
          {step.label}
        </p>
        {step.fraction && step.fraction.total > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`flex-shrink-0 font-mono text-[10px] font-semibold ${isDone ? "text-success" : isPartial ? "text-warning" : "text-muted-foreground"}`}>
              {step.fraction.done}/{step.fraction.total}
            </span>
          </div>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">{step.description}</p>
      </div>
      <Link
        href={step.href}
        onClick={onNavigate}
        className="mt-0.5 flex-shrink-0 text-[11px] font-medium text-brand-indigo hover:underline"
      >
        Open →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If `text-success` / `text-warning` tokens are missing, substitute `text-brand-mint` (success) and `text-brand-amber` (warning) — check `app/globals.css` for the correct token names.

- [ ] **Step 4.3: Commit**

```bash
git add components/sis/ay-readiness-pill.tsx
git commit -m "feat(sis): AyReadinessPill floating component with 5-step readiness dialog"
```

---

## Task 5: Mount pill in SIS layout

**Files:**
- Modify: `app/(sis)/layout.tsx`

- [ ] **Step 5.1: Fetch readiness and mount pill**

Open `app/(sis)/layout.tsx`. The current file ends with:

```tsx
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <ModuleSidebar module="sis" role={role} email={email} userId={id} />
      <SidebarInset>
        <AyBanner />
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex-1 bg-muted px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
```

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/supabase/server';
import { ModuleSidebar } from '@/components/module-sidebar';
import { AyBanner } from '@/components/sis/ay-banner';
import { AyReadinessPill } from '@/components/sis/ay-readiness-pill';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { getCurrentAcademicYear } from '@/lib/academic-year';
import { getAyReadiness } from '@/lib/sis/readiness';
import { createServiceClient } from '@/lib/supabase/service';

export default async function SisLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');

  const { id, email, role } = sessionUser;
  if (role !== 'registrar' && role !== 'school_admin' && role !== 'superadmin') {
    if (role === 'p-file') redirect('/p-files');
    if (!role) redirect('/parent');
    redirect('/');
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar:state')?.value !== 'false';

  // Fetch readiness for admin roles — registrar gets null so pill renders nothing
  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  const readiness =
    (role === 'school_admin' || role === 'superadmin') && currentAy
      ? await getAyReadiness(currentAy.ay_code)
      : null;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <ModuleSidebar module="sis" role={role} email={email} userId={id} />
      <SidebarInset>
        <AyBanner />
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex-1 bg-muted px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </SidebarInset>
      {readiness && <AyReadinessPill readiness={readiness} role={role} />}
    </SidebarProvider>
  );
}
```

- [ ] **Step 5.2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5.3: Commit**

```bash
git add app/(sis)/layout.tsx
git commit -m "feat(sis): mount AyReadinessPill in SIS layout"
```

---

## Task 6: Hub "Year Setup" section with numbered cards

**Files:**
- Modify: `app/(sis)/sis/page.tsx`

- [ ] **Step 6.1: Add `step` prop to `AdminCard`**

In `app/(sis)/sis/page.tsx`, find the `AdminCard` function signature and its `Inner` `<Card>` block. Add `step?: number` to the prop type and render it as a large muted mono numeral:

```tsx
function AdminCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  cta,
  role,
  allowedRoles,
  step,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  role: Role | null;
  allowedRoles: Role[];
  step?: number;
}) {
```

Inside `<CardHeader>`, add the step number before `<CardDescription>`:

```tsx
<CardHeader>
  {step != null && (
    <p className="font-mono text-[11px] font-semibold text-muted-foreground/40">
      {String(step).padStart(2, "0")}
    </p>
  )}
  <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
    {eyebrow}
  </CardDescription>
  ...
```

- [ ] **Step 6.2: Replace "Academic Year" section with "Year Setup"**

Find the `{/* Academic Year — rolls over once a year */}` section block in `page.tsx`. Replace it entirely:

```tsx
{/* Year Setup — the 5-step sequence for a new academic year. */}
<section className="space-y-3">
  <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
    Year Setup
  </h2>
  <div className="grid gap-4 md:grid-cols-2">
    <AdminCard
      step={1}
      href="/sis/ay-setup"
      icon={CalendarCog}
      eyebrow="Structural"
      title="AY Setup"
      description="Create a new academic year, switch the active AY, or retire an empty one. Sets up everything the new year needs — terms, sections, subjects, admissions data."
      cta="Open AY Setup"
      role={role}
      allowedRoles={["school_admin", "superadmin"]}
    />
    <AdminCard
      step={2}
      href="/sis/calendar"
      icon={CalendarDays}
      eyebrow="Academic calendar"
      title="School Calendar"
      description="Define school days, holidays, and important dates per term. Every weekday is a school day by default; mark holidays and HBL overlays here. Attendance and the parent portal consume this."
      cta="Open school calendar"
      role={role}
      allowedRoles={["school_admin", "superadmin"]}
    />
    <AdminCard
      step={3}
      href="/sis/admin/sow"
      icon={BookOpenCheck}
      eyebrow="Curriculum"
      title="Scheme of Work"
      description="Publish the curriculum scope for each subject, level, and curriculum track. Grading sheets and evaluation topic lists are built from the published SOW."
      cta="Open SOW builder"
      role={role}
      allowedRoles={["school_admin", "superadmin"]}
    />
    <AdminCard
      step={4}
      href="/sis/sections"
      icon={LayoutGrid}
      eyebrow="Organisation"
      title="Sections"
      description="Create sections from the master template and assign form advisers and subject teachers. Sections gate grading sheet creation in Markbook."
      cta="Manage sections"
      role={role}
      allowedRoles={["school_admin", "superadmin"]}
    />
    <AdminCard
      step={5}
      href="/markbook/sections"
      icon={ClipboardList}
      eyebrow="Markbook"
      title="Grading Sheets"
      description="Bulk-create grading sheets per section from Markbook → Sections. SOW labels and evaluation topics are applied automatically when a published SOW exists."
      cta="Open Markbook sections"
      role={role}
      allowedRoles={["registrar", "school_admin", "superadmin"]}
    />
  </div>
</section>
```

Note: `BookOpenCheck` and `ClipboardList` are already imported in the existing file. Verify the import list includes all icons used — if `ClipboardList` is not imported, add it to the lucide-react import.

- [ ] **Step 6.3: Remove Sections from the "Organisation" section**

Find the `<AdminCard href="/sis/sections" ...>` inside the "Organisation" section block and delete it (it's now in Year Setup). The Organisation section should retain only: Discount Codes + Sync from Admissions.

- [ ] **Step 6.4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6.5: Commit**

```bash
git add app/(sis)/sis/page.tsx
git commit -m "feat(sis): Year Setup section with 5 numbered AdminCards on SIS hub"
```

---

## Task 7: Manual verification

- [ ] **Step 7.1: Start dev server**

```bash
npx next dev --turbo
```

- [ ] **Step 7.2: Sign in as `school_admin` and navigate to `/sis`**

Verify:
- "Year Setup" section appears on the hub with 5 numbered cards (01–05)
- Grading Sheets card links to `/markbook/sections`
- Sidebar shows "Year Setup" group with `01`–`05` prefixes on each item
- Floating pill appears bottom-right (visible if any step is incomplete)

- [ ] **Step 7.3: Click the pill**

Verify:
- Dialog opens with correct title + subtitle
- SOW row shows a progress bar and `N/M` fraction if templates exist
- Grading Sheets row shows a progress bar and `N/M` fraction
- Done steps show green check; partial show amber; not started show muted circle
- "Open →" links navigate correctly and close the dialog

- [ ] **Step 7.4: Sign in as `registrar`**

Verify:
- Pill does NOT appear
- Sidebar still shows the Year Setup group (registrar has access to the routes, just not the pill)

- [ ] **Step 7.5: Complete all 5 steps in the test AY**

Switch to AY9999 (test env). Verify that once all 5 steps are in "done" state, the pill auto-hides.

- [ ] **Step 7.6: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "fix(sis): readiness indicator cleanup from manual verification"
```
