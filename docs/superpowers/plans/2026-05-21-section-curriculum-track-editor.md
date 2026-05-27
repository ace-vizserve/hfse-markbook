# Section Curriculum Track Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curriculum track selector to the existing Section rename dialog so registrars can change a section's `curriculum_track` (cambridge / o_level / singapore_inspired) from the section detail page in SIS Admin.

**Architecture:** Extend the existing rename dialog (`components/sis/section-rename-dialog.tsx`) with a second RHF field for `curriculum_track`. The PATCH route already owns section mutations — extend it to handle the new field, firing a separate audit action only when the track actually changes. Five files touched in sequence: schema → API route → dialog component → page → audit allowlist.

**Tech Stack:** Next.js 16 App Router, Supabase (service client), zod + RHF, shadcn/ui (`Form`, `Select`, `Dialog`), `lib/audit/log-action.ts`

---

### Task 1: Extend schema + register audit action

**Files:**

- Modify: `lib/schemas/section.ts`
- Modify: `lib/audit/log-action.ts`

- [ ] **Step 1: Add `CURRICULUM_TRACKS` constant and extend `SectionUpdateSchema`**

In `lib/schemas/section.ts`, replace the file contents with:

```typescript
import { z } from 'zod';

// POST /api/sections — create a new section under the current AY.
//
// Scope: mid-year additions (e.g. a late transfer needs a new homeroom).
// AY rollover still happens via `create_academic_year` (copy-forward from
// prior AY). Uniqueness constraint: (academic_year_id, level_id, name) —
// API surfaces a friendly 409 on conflict.

export const SECTION_CLASS_TYPES = ['Global', 'Standard'] as const;
export type SectionClassType = (typeof SECTION_CLASS_TYPES)[number];

export const CURRICULUM_TRACKS = [
  'cambridge',
  'o_level',
  'singapore_inspired',
] as const;
export type CurriculumTrack = (typeof CURRICULUM_TRACKS)[number];

export const CURRICULUM_TRACK_LABELS: Record<CurriculumTrack, string> = {
  cambridge: 'Cambridge',
  o_level: 'O-Level',
  singapore_inspired: 'Singapore-Inspired',
};

const uuidString = z.string().uuid('Invalid id');

export const SectionCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name required')
    .max(60, 'Keep it under 60 chars'),
  level_id: uuidString,
  class_type: z.enum(SECTION_CLASS_TYPES).nullable().optional(),
});

export type SectionCreateInput = z.infer<typeof SectionCreateSchema>;

// PATCH /api/sections/[id] — rename and/or change curriculum track.
// `level_id` and `academic_year_id` are load-bearing joins and can't be
// edited without cascade concerns; class_type is set at creation for now.
// Both fields are optional — callers may send one or both.
export const SectionUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name required')
    .max(60, 'Keep it under 60 chars')
    .optional(),
  curriculum_track: z.enum(CURRICULUM_TRACKS).optional(),
});

export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
```

- [ ] **Step 2: Register `section.curriculum_track.update` in `lib/audit/log-action.ts`**

Find the lines:

```typescript
  | 'section.create'
  | 'section.rename'
  | 'section.realphabetize'
```

Replace with:

```typescript
  | 'section.create'
  | 'section.rename'
  | 'section.realphabetize'
  | 'section.curriculum_track.update'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new types.

---

### Task 2: Extend the PATCH API route

**Files:**

- Modify: `app/api/sections/[id]/route.ts`

- [ ] **Step 1: Rewrite the PATCH handler**

Replace the entire file contents with:

```typescript
import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { SectionUpdateSchema } from '@/lib/schemas/section';

// PATCH /api/sections/[id] — rename and/or change curriculum track.
// Fires `section.rename` and/or `section.curriculum_track.update` audit
// actions — only for fields that actually changed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'section id required' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = SectionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, curriculum_track } = parsed.data;

  if (name === undefined && curriculum_track === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: before, error: beforeErr } = await service
    .from('sections')
    .select('id, name, curriculum_track, academic_year_id, level_id')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) {
    return NextResponse.json({ error: beforeErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'section not found' }, { status: 404 });
  }

  const nameChanged = name !== undefined && name !== before.name;
  const trackChanged =
    curriculum_track !== undefined &&
    curriculum_track !== before.curriculum_track;

  if (!nameChanged && !trackChanged) {
    return NextResponse.json({
      ok: true,
      id: before.id,
      name: before.name,
      curriculum_track: before.curriculum_track,
      unchanged: true,
    });
  }

  const patch: Record<string, string> = {};
  if (nameChanged) patch.name = name!;
  if (trackChanged) patch.curriculum_track = curriculum_track!;

  const { data: updated, error: updateErr } = await service
    .from('sections')
    .update(patch)
    .eq('id', id)
    .select('id, name, curriculum_track')
    .single();

  if (updateErr) {
    // 23505 = unique_violation (academic_year_id, level_id, curriculum_track, name)
    if ((updateErr as { code?: string }).code === '23505') {
      return NextResponse.json(
        {
          error: `A section named "${name}" already exists in this level and track for the current AY.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const actor = { id: auth.user.id, email: auth.user.email ?? null };
  const sharedCtx = {
    academic_year_id: before.academic_year_id,
    level_id: before.level_id,
  };

  if (nameChanged) {
    await logAction({
      service,
      actor,
      action: 'section.rename',
      entityType: 'section',
      entityId: id,
      context: { ...sharedCtx, from: before.name, to: name! },
    });
  }

  if (trackChanged) {
    await logAction({
      service,
      actor,
      action: 'section.curriculum_track.update',
      entityType: 'section',
      entityId: id,
      context: {
        ...sharedCtx,
        from: before.curriculum_track,
        to: curriculum_track!,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    id: updated.id,
    name: updated.name,
    curriculum_track: updated.curriculum_track,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

### Task 3: Update the rename dialog

**Files:**

- Modify: `components/sis/section-rename-dialog.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file contents with:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CURRICULUM_TRACKS,
  CURRICULUM_TRACK_LABELS,
  SectionUpdateSchema,
  type SectionUpdateInput,
  type CurriculumTrack,
} from '@/lib/schemas/section';

export function SectionRenameDialog({
  sectionId,
  currentName,
  currentCurriculumTrack,
}: {
  sectionId: string;
  currentName: string;
  currentCurriculumTrack: CurriculumTrack;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<SectionUpdateInput>({
    resolver: zodResolver(SectionUpdateSchema),
    defaultValues: { name: currentName, curriculum_track: currentCurriculumTrack },
  });

  async function onSubmit(values: SectionUpdateInput) {
    const nextName = values.name?.trim() ?? currentName;
    const nextTrack = values.curriculum_track ?? currentCurriculumTrack;
    const nameChanged = nextName !== currentName;
    const trackChanged = nextTrack !== currentCurriculumTrack;

    if (!nameChanged && !trackChanged) {
      setOpen(false);
      return;
    }

    const payload: Record<string, string> = {};
    if (nameChanged) payload.name = nextName;
    if (trackChanged) payload.curriculum_track = nextTrack;

    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'update failed');
      const parts: string[] = [];
      if (nameChanged) parts.push(`renamed to ${nextName}`);
      if (trackChanged) parts.push(`track set to ${CURRICULUM_TRACK_LABELS[nextTrack]}`);
      toast.success(`Section ${parts.join(', ')}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'update failed');
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset({ name: currentName, curriculum_track: currentCurriculumTrack });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit section</DialogTitle>
          <DialogDescription>
            Update the section name or curriculum track. Level and academic year stay the same.
            Existing rosters, grading sheets, and report cards follow automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section name</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="e.g. Patience" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="curriculum_track"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curriculum track</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a track" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRICULUM_TRACKS.map((track) => (
                        <SelectItem key={track} value={track}>
                          {CURRICULUM_TRACK_LABELS[track]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The `Select` import may fail if `components/ui/select.tsx` is not installed — if so, run `npx shadcn@latest add select` first.

---

### Task 4: Update the section detail page

**Files:**

- Modify: `app/(sis)/sis/sections/[id]/page.tsx`

- [ ] **Step 1: Add `curriculum_track` to the sections select query**

Find:

```typescript
const { data: section } = await supabase
  .from('sections')
  .select(
    'id, name, academic_year_id, level:levels(id, code, label, level_type), academic_year:academic_years(ay_code, label)'
  )
  .eq('id', id)
  .single();
```

Replace with:

```typescript
const { data: section } = await supabase
  .from('sections')
  .select(
    'id, name, curriculum_track, academic_year_id, level:levels(id, code, label, level_type), academic_year:academic_years(ay_code, label)'
  )
  .eq('id', id)
  .single();
```

- [ ] **Step 2: Add `CurriculumTrack` import to the page**

Find the existing import from `@/components/sis/section-rename-dialog`:

```typescript
import { SectionRenameDialog } from '@/components/sis/section-rename-dialog';
```

Replace with:

```typescript
import { SectionRenameDialog } from '@/components/sis/section-rename-dialog';
import type { CurriculumTrack } from '@/lib/schemas/section';
```

- [ ] **Step 3: Pass `currentCurriculumTrack` to `SectionRenameDialog`**

Find:

```typescript
          <SectionRenameDialog sectionId={section.id} currentName={section.name} />
```

Replace with:

```typescript
          <SectionRenameDialog
            sectionId={section.id}
            currentName={section.name}
            currentCurriculumTrack={(section.curriculum_track as CurriculumTrack) ?? 'singapore_inspired'}
          />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

### Task 5: Add action to audit log allowlist + commit

**Files:**

- Modify: `app/(sis)/sis/audit-log/page.tsx`

- [ ] **Step 1: Add `section.curriculum_track.update` to the allowlist**

Find:

```typescript
  'section.create', 'section.rename', 'section.realphabetize',
```

Replace with:

```typescript
  'section.create', 'section.rename', 'section.realphabetize', 'section.curriculum_track.update',
```

- [ ] **Step 2: Run a full build to confirm everything is clean**

```bash
npx next build
```

Expected: build completes with no TypeScript errors. Ignore the "Google Fonts network" warning (known CI-unaffected issue per CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
git add lib/schemas/section.ts lib/audit/log-action.ts app/api/sections/[id]/route.ts components/sis/section-rename-dialog.tsx "app/(sis)/sis/sections/[id]/page.tsx" "app/(sis)/sis/audit-log/page.tsx"
git commit -m "feat(sis): add curriculum track editor to section rename dialog (KD #108)"
```
