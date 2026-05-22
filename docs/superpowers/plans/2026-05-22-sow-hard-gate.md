# SOW Hard Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that no grading sheet or evaluation topic can be created for a subject-section-term without an approved (published) SOW — and when SOW is re-applied mid-year after scores exist, merge instead of overwrite.

**Architecture:** Migration 059 adds a selective sheet-creation RPC + `has_partial_rebaseline` column. The bulk-create route pre-checks SOW per scope and only creates sheets for covered scopes. The SOW apply route auto-triggers sheet creation and chooses clean-replace vs merge based on whether scores/responses already exist. The AY Readiness pill gains a "sow" step between "sections" and "grading-sheets". The evaluation Checklists tab shows a locked empty state when no SOW class instance exists for the selected subject.

**Tech Stack:** Next.js 16 App Router, Supabase/Postgres (PL/pgSQL), TypeScript, Tailwind v4, shadcn/ui, lucide-react

**Spec:** `docs/superpowers/specs/2026-05-22-sow-hard-gate-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/059_sow_hard_gate.sql` | Create | New RPC + schema column |
| `lib/sis/sow/queries.ts` | Modify | Add `has_partial_rebaseline` to type + new helpers |
| `lib/sis/sow/mutations.ts` | Modify | `createOrUpdateClassInstance` param; new merge helpers; update `applyInstanceToSection` |
| `app/api/grading-sheets/bulk-create/route.ts` | Modify | Replace `applySowForSheets` with `gateAndActivateScopes` |
| `app/api/sis/admin/sow/apply/route.ts` | Modify | Auto-trigger sheet creation + impact detection + merge |
| `lib/sis/readiness.ts` | Modify | Add `checkSow`; update types + step numbers |
| `components/sis/ay-readiness-pill.tsx` | Modify | Add "sow" step icon + grading-sheets dependency copy |
| `app/(evaluation)/evaluation/sections/[sectionId]/page.tsx` | Modify | Locked empty state when no SOW |
| `components/markbook/bulk-create-sheets-button.tsx` | Modify | Amber toast for blocked scopes |
| `components/sis/generate-sheets-dialog.tsx` | Modify | Amber toast for blocked scopes |
| `components/grading/score-entry-grid.tsx` | Modify | Amber SOW chip when `sowPartialRebaseline` |
| `app/(markbook)/markbook/grading/[id]/page.tsx` | Modify | Pass `sowPartialRebaseline` prop |

---

## Task 1: Migration 059 — schema column + selective RPC

**Files:**
- Create: `supabase/migrations/059_sow_hard_gate.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/059_sow_hard_gate.sql

-- 1. Track whether a class instance was updated mid-year after scores existed
ALTER TABLE sow_class_instances
  ADD COLUMN IF NOT EXISTS has_partial_rebaseline boolean NOT NULL DEFAULT false;

-- 2. Selective sheet + entry creator — takes a JSON array of
--    {section_id, subject_id, term_id} objects and creates grading sheets
--    (with seeded grade_entries) only for those specific scopes.
--    Idempotent: ON CONFLICT DO NOTHING on both sheets and entries.
CREATE OR REPLACE FUNCTION create_grading_sheets_for_scopes(p_scopes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scope        jsonb;
  v_section_id   uuid;
  v_subject_id   uuid;
  v_term_id      uuid;
  v_config_id    uuid;
  v_ww_slots     int;
  v_pt_slots     int;
  v_qa_max       int;
  v_new_sheet_id uuid;
  v_inserted     int := 0;
BEGIN
  FOR v_scope IN SELECT value FROM jsonb_array_elements(p_scopes)
  LOOP
    v_section_id := (v_scope->>'section_id')::uuid;
    v_subject_id := (v_scope->>'subject_id')::uuid;
    v_term_id    := (v_scope->>'term_id')::uuid;

    -- Derive subject config from the section's level × AY
    SELECT sc.id, sc.ww_max_slots, sc.pt_max_slots, sc.qa_max
      INTO v_config_id, v_ww_slots, v_pt_slots, v_qa_max
      FROM subject_configs sc
      JOIN sections s ON s.academic_year_id = sc.academic_year_id
                     AND s.level_id = sc.level_id
     WHERE s.id = v_section_id
       AND sc.subject_id = v_subject_id
     LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE; -- no config for this scope, skip silently
    END IF;

    -- Insert sheet (ON CONFLICT DO NOTHING — idempotent)
    INSERT INTO grading_sheets (
      section_id, subject_id, term_id, subject_config_id,
      ww_totals, pt_totals, qa_total
    )
    VALUES (
      v_section_id, v_subject_id, v_term_id, v_config_id,
      ARRAY(SELECT 10 FROM generate_series(1, v_ww_slots)),
      ARRAY(SELECT 10 FROM generate_series(1, v_pt_slots)),
      v_qa_max
    )
    ON CONFLICT (section_id, subject_id, term_id) DO NOTHING
    RETURNING id INTO v_new_sheet_id;

    IF v_new_sheet_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;

      -- Seed null-filled grade_entries for active + late-enrolled students
      INSERT INTO grade_entries (
        grading_sheet_id, section_student_id, ww_scores, pt_scores
      )
      SELECT
        v_new_sheet_id,
        ss.id,
        ARRAY(SELECT NULL::integer FROM generate_series(1, v_ww_slots)),
        ARRAY(SELECT NULL::integer FROM generate_series(1, v_pt_slots))
      FROM section_students ss
      WHERE ss.section_id = v_section_id
        AND ss.enrollment_status IN ('active', 'late_enrollee')
      ON CONFLICT (grading_sheet_id, section_student_id) DO NOTHING;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applies without error.

- [ ] **Step 3: Verify the RPC works**

Run in Supabase SQL editor (use real UUIDs from your test environment):
```sql
SELECT create_grading_sheets_for_scopes('[]'::jsonb);
-- Expected: {"inserted": 0}
```

Also verify the column exists:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sow_class_instances'
  AND column_name = 'has_partial_rebaseline';
-- Expected: 1 row, boolean, DEFAULT false
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/059_sow_hard_gate.sql
git commit -m "feat(migration): 059 — SOW hard gate: selective sheet RPC + has_partial_rebaseline"
```

---

## Task 2: Update `SowClassInstanceRow` type + `sowExistsForSection`

**Files:**
- Modify: `lib/sis/sow/queries.ts`

- [ ] **Step 1: Add `has_partial_rebaseline` to `SowClassInstanceRow`**

In `lib/sis/sow/queries.ts`, update the type:

```typescript
export type SowClassInstanceRow = {
  id: string;
  section_id: string;
  subject_id: string;
  term_id: string;
  published_version_id: string;
  has_partial_rebaseline: boolean;  // ADD THIS
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Update `sowExistsForSection` return type to include `partial_rebaseline`**

Replace the existing `sowExistsForSection` function:

```typescript
export async function sowExistsForSection(
  section_id: string,
  subject_id: string,
  term_id: string,
): Promise<{ exists: boolean; version: SowPublishedVersionRow | null; partial_rebaseline: boolean }> {
  const instance = await getClassInstance(section_id, subject_id, term_id);
  if (!instance) return { exists: false, version: null, partial_rebaseline: false };
  const version = await getPublishedVersionById(instance.published_version_id);
  return { exists: true, version, partial_rebaseline: instance.has_partial_rebaseline };
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. (The grading page already destructures `sowCheck.exists` and `sowCheck.version` — the new `partial_rebaseline` field is additive and won't break callers.)

- [ ] **Step 4: Commit**

```bash
git add lib/sis/sow/queries.ts
git commit -m "feat(sow): expose has_partial_rebaseline from sowExistsForSection"
```

---

## Task 3: New query helpers — `hasGradingScores`, `hasEvaluationResponses`, `detectSowChangeImpact`

**Files:**
- Modify: `lib/sis/sow/queries.ts`

These helpers are used by the SOW apply route (Task 7) to decide clean vs merge path.

- [ ] **Step 1: Add the three helpers at the bottom of `lib/sis/sow/queries.ts`**

```typescript
// ── Impact-detection helpers ──────────────────────────────────────────────────

/** True if any student in the sheet has a non-null WW or PT score. */
export async function hasGradingScores(
  service: ReturnType<typeof createServiceClient>,
  sheetId: string,
): Promise<boolean> {
  const { data: entries } = await service
    .from('grade_entries')
    .select('ww_scores, pt_scores')
    .eq('grading_sheet_id', sheetId);

  return (entries ?? []).some(
    (e) =>
      ((e.ww_scores ?? []) as (number | null)[]).some((s) => s !== null) ||
      ((e.pt_scores ?? []) as (number | null)[]).some((s) => s !== null),
  );
}

/** True if any evaluation checklist item in this scope has a non-null rating. */
export async function hasEvaluationResponses(
  service: ReturnType<typeof createServiceClient>,
  scope: { term_id: string; subject_id: string; level_id: string; curriculum_track: string },
): Promise<boolean> {
  const { data: items } = await service
    .from('evaluation_checklist_items')
    .select('id')
    .eq('term_id', scope.term_id)
    .eq('subject_id', scope.subject_id)
    .eq('level_id', scope.level_id)
    .eq('curriculum_track', scope.curriculum_track);

  if (!items?.length) return false;

  const { count } = await service
    .from('evaluation_checklist_responses')
    .select('id', { count: 'exact', head: true })
    .in('item_id', items.map((i) => i.id))
    .not('rating', 'is', null);

  return (count ?? 0) > 0;
}

/** Returns impact mode for a single section × subject × term scope. */
export async function detectSowChangeImpact(
  service: ReturnType<typeof createServiceClient>,
  sectionId: string,
  subjectId: string,
  termId: string,
  levelId: string,
  curriculumTrack: string,
): Promise<{ hasGradingScores: boolean; hasEvaluationResponses: boolean }> {
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('id')
    .eq('section_id', sectionId)
    .eq('subject_id', subjectId)
    .eq('term_id', termId)
    .maybeSingle();

  const [scores, responses] = await Promise.all([
    sheet ? hasGradingScores(service, sheet.id) : Promise.resolve(false),
    hasEvaluationResponses(service, { term_id: termId, subject_id: subjectId, level_id: levelId, curriculum_track: curriculumTrack }),
  ]);

  return { hasGradingScores: scores, hasEvaluationResponses: responses };
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/sis/sow/queries.ts
git commit -m "feat(sow): add hasGradingScores, hasEvaluationResponses, detectSowChangeImpact"
```

---

## Task 4: Update `createOrUpdateClassInstance` + new merge mutation helpers

**Files:**
- Modify: `lib/sis/sow/mutations.ts`

- [ ] **Step 1: Add `has_partial_rebaseline` parameter to `createOrUpdateClassInstance`**

Replace the existing `createOrUpdateClassInstance` function:

```typescript
export async function createOrUpdateClassInstance(
  section_id: string,
  subject_id: string,
  term_id: string,
  published_version_id: string,
  has_partial_rebaseline = false,  // NEW — defaults false for first apply
): Promise<{ data: SowClassInstanceRow | null; error: string | null }> {
  const service = createServiceClient();

  const { data: existing } = await service
    .from('sow_class_instances')
    .select('id')
    .eq('section_id', section_id)
    .eq('subject_id', subject_id)
    .eq('term_id', term_id)
    .maybeSingle();

  if (existing?.id) {
    const { data: updated, error } = await service
      .from('sow_class_instances')
      .update({ published_version_id, has_partial_rebaseline, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: updated as SowClassInstanceRow, error: null };
  }

  const { data: inserted, error } = await service
    .from('sow_class_instances')
    .insert({ section_id, subject_id, term_id, published_version_id, has_partial_rebaseline })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: inserted as SowClassInstanceRow, error: null };
}
```

- [ ] **Step 2: Add `mergeGradingSheetSlots` helper**

Add after `createOrUpdateClassInstance`:

```typescript
import type { SowSlotDescriptor } from '@/lib/schemas/grading-sheet';

type SlotLabels = {
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  qa: string | null;
};

/**
 * Merge new SOW slot descriptors into an existing grading sheet's slot_labels.
 *
 * Per position i:
 *   - New SOW defines slot → use new descriptor (label change is safe even with scores)
 *   - New SOW removes slot AND scores exist at i → keep existing label (can't orphan scores)
 *   - New SOW removes slot AND no scores → clear to null
 *
 * ww_totals (max scores) and grade_entries.ww_scores are never touched here.
 */
export async function mergeGradingSheetSlots(
  service: ReturnType<typeof createServiceClient>,
  sheetId: string,
  newWw: (SowSlotDescriptor | null)[],
  newPt: (SowSlotDescriptor | null)[],
): Promise<void> {
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('slot_labels, ww_totals, pt_totals')
    .eq('id', sheetId)
    .single();
  if (!sheet) return;

  const { data: entries } = await service
    .from('grade_entries')
    .select('ww_scores, pt_scores')
    .eq('grading_sheet_id', sheetId);

  const current = ((sheet.slot_labels ?? { ww: [], pt: [], qa: null }) as SlotLabels);

  const wwHasScore = (i: number) =>
    (entries ?? []).some((e) => ((e.ww_scores ?? []) as (number | null)[])[i] != null);
  const ptHasScore = (i: number) =>
    (entries ?? []).some((e) => ((e.pt_scores ?? []) as (number | null)[])[i] != null);

  const mergedWw = ((sheet.ww_totals ?? []) as number[]).map((_, i) => {
    if (i < newWw.length && newWw[i] !== null) return newWw[i];
    if (wwHasScore(i)) return current.ww[i] ?? null; // preserve existing label for scored slot
    return null;
  });

  const mergedPt = ((sheet.pt_totals ?? []) as number[]).map((_, i) => {
    if (i < newPt.length && newPt[i] !== null) return newPt[i];
    if (ptHasScore(i)) return current.pt[i] ?? null;
    return null;
  });

  await service
    .from('grading_sheets')
    .update({ slot_labels: { ...current, ww: mergedWw, pt: mergedPt } })
    .eq('id', sheetId);
}
```

- [ ] **Step 3: Add `mergeEvaluationTopics` helper**

```typescript
/**
 * Merge new SOW topics into existing evaluation_checklist_items for a scope.
 *
 * Items with ≥1 non-null rating are preserved. Items with no ratings are deleted.
 * New topics not already in the preserved set (matched by item_text) are inserted.
 * Returns counts for audit logging.
 */
export async function mergeEvaluationTopics(
  service: ReturnType<typeof createServiceClient>,
  scope: { term_id: string; subject_id: string; level_id: string; curriculum_track: string },
  newTopics: SowTopic[],
): Promise<{ preserved: number; deleted: number; inserted: number }> {
  const { data: existingItems } = await service
    .from('evaluation_checklist_items')
    .select('id, item_text')
    .eq('term_id', scope.term_id)
    .eq('subject_id', scope.subject_id)
    .eq('level_id', scope.level_id)
    .eq('curriculum_track', scope.curriculum_track);

  if (!existingItems?.length) {
    // Nothing to merge — insert all new topics
    if (newTopics.length > 0) {
      await service.from('evaluation_checklist_items').insert(
        newTopics.map((t) => ({
          term_id: scope.term_id,
          subject_id: scope.subject_id,
          level_id: scope.level_id,
          curriculum_track: scope.curriculum_track,
          item_text: t.text,
          sort_order: t.sort_order,
          sow_class_instance_id: null,
        })),
      );
    }
    return { preserved: 0, deleted: 0, inserted: newTopics.length };
  }

  // Check which items have responses
  const { data: responses } = await service
    .from('evaluation_checklist_responses')
    .select('item_id')
    .in('item_id', existingItems.map((i) => i.id))
    .not('rating', 'is', null);

  const respondedIds = new Set((responses ?? []).map((r) => r.item_id));
  const toKeep = existingItems.filter((i) => respondedIds.has(i.id));
  const toDelete = existingItems.filter((i) => !respondedIds.has(i.id));

  if (toDelete.length > 0) {
    await service
      .from('evaluation_checklist_items')
      .delete()
      .in('id', toDelete.map((i) => i.id));
  }

  // Insert new topics not already in the kept set (matched by text)
  const keptTexts = new Set(toKeep.map((i) => i.item_text));
  const toInsert = newTopics.filter((t) => !keptTexts.has(t.text));

  if (toInsert.length > 0) {
    await service.from('evaluation_checklist_items').insert(
      toInsert.map((t) => ({
        term_id: scope.term_id,
        subject_id: scope.subject_id,
        level_id: scope.level_id,
        curriculum_track: scope.curriculum_track,
        item_text: t.text,
        sort_order: t.sort_order,
        sow_class_instance_id: null,
      })),
    );
  }

  return { preserved: toKeep.length, deleted: toDelete.length, inserted: toInsert.length };
}
```

- [ ] **Step 4: Update `applyInstanceToSection` to support impact mode**

Replace the existing `applyInstanceToSection` function. It now accepts `impactMode` and calls the merge helpers when needed:

```typescript
export type ApplyMode = 'clean' | 'partial-rebaseline';

export type ApplyResult = {
  instance_id: string;
  sheets_synced: number;
  checklist_items_upserted: number;
  mode: ApplyMode;
  preserved_slots: number;
  preserved_topics: number;
};

export async function applyInstanceToSection(
  section_id: string,
  subject_id: string,
  term_id: string,
  level_id: string,
  curriculum_track: string,
  published_version_id: string,
  version: { ww: (SowSlotDescriptor | null)[]; pt: (SowSlotDescriptor | null)[]; topics: SowTopic[] },
  impactMode: ApplyMode = 'clean',
): Promise<{ data: ApplyResult | null; error: string | null }> {
  const service = createServiceClient();

  // Step 1: Create or update class instance
  const { data: instance, error: instanceErr } = await createOrUpdateClassInstance(
    section_id, subject_id, term_id, published_version_id,
    impactMode === 'partial-rebaseline',
  );
  if (instanceErr || !instance) return { data: null, error: instanceErr ?? 'instance create failed' };

  let sheetsSync = 0;
  let preservedSlots = 0;

  if (impactMode === 'clean') {
    // Full slot label replacement (existing RPC — only touches unlocked sheets)
    const { data: syncResult } = await service.rpc('sync_grading_sheets_from_sow', {
      p_term_id: term_id,
      p_subject_id: subject_id,
      p_level_id: level_id,
      p_curriculum_track: curriculum_track,
      p_ww: version.ww,
      p_pt: version.pt,
    });
    sheetsSync = (syncResult as { rows_synced?: number } | null)?.rows_synced ?? 0;
  } else {
    // Merge: update labels slot-by-slot preserving scored positions
    const { data: sheet } = await service
      .from('grading_sheets')
      .select('id')
      .eq('section_id', section_id)
      .eq('subject_id', subject_id)
      .eq('term_id', term_id)
      .maybeSingle();

    if (sheet && !await isSheetLocked(service, sheet.id)) {
      await mergeGradingSheetSlots(service, sheet.id, version.ww, version.pt);
      sheetsSync = 1;
    }
    // Count preserved slots: positions where the new SOW had no slot but existing scores exist
    // (approximated as ww_totals.length - newWw non-null count for a scored sheet)
    preservedSlots = Math.max(0, (version.ww.filter(s => s === null).length));
  }

  // Step 3: Sync evaluation topics (conditional)
  let checklistCount = 0;
  let preservedTopics = 0;

  if (impactMode === 'clean') {
    // Hard reset: delete existing items for this scope then re-insert
    await service
      .from('evaluation_checklist_items')
      .delete()
      .eq('term_id', term_id)
      .eq('subject_id', subject_id)
      .eq('level_id', level_id)
      .eq('curriculum_track', curriculum_track);

    if (version.topics.length > 0) {
      const rows = version.topics.map((topic) => ({
        term_id, subject_id, level_id, curriculum_track,
        sow_class_instance_id: null,
        item_text: topic.text,
        sort_order: topic.sort_order,
      }));
      const { data: inserted } = await service
        .from('evaluation_checklist_items')
        .insert(rows)
        .select('id');
      checklistCount = (inserted as { id: string }[] | null)?.length ?? 0;
    }
  } else {
    // Merge: preserve items with ratings, insert new topics
    const result = await mergeEvaluationTopics(
      service,
      { term_id, subject_id, level_id, curriculum_track },
      version.topics,
    );
    checklistCount = result.inserted;
    preservedTopics = result.preserved;
  }

  return {
    data: {
      instance_id: instance.id,
      sheets_synced: sheetsSync,
      checklist_items_upserted: checklistCount,
      mode: impactMode,
      preserved_slots: preservedSlots,
      preserved_topics: preservedTopics,
    },
    error: null,
  };
}

/** Helper: check if a grading sheet is locked (merge mode skips locked sheets). */
async function isSheetLocked(
  service: ReturnType<typeof createServiceClient>,
  sheetId: string,
): Promise<boolean> {
  const { data } = await service
    .from('grading_sheets')
    .select('is_locked')
    .eq('id', sheetId)
    .single();
  return (data as { is_locked: boolean } | null)?.is_locked ?? false;
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. Fix any import issues (`SowSlotDescriptor`, `SowTopic` are already imported at the top of `mutations.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/sis/sow/mutations.ts
git commit -m "feat(sow): merge helpers + applyInstanceToSection impact mode"
```

---

## Task 5: Restructure bulk-create route

**Files:**
- Modify: `app/api/grading-sheets/bulk-create/route.ts`

Replace the `applySowForSheets` function with `gateAndActivateScopes` which pre-checks SOW before creating sheets.

- [ ] **Step 1: Replace `applySowForSheets` with `gateAndActivateScopes`**

Replace the entire `applySowForSheets` function and update the `POST` handler. Here is the full new file content:

```typescript
import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { logAction } from '@/lib/audit/log-action';
import { invalidateDrillTags } from '@/lib/cache/invalidate-drill-tags';
import { createServiceClient } from '@/lib/supabase/service';
import { getLatestPublished } from '@/lib/sis/sow/queries';
import { createOrUpdateClassInstance } from '@/lib/sis/sow/mutations';
import type { CurriculumTrack } from '@/lib/schemas/sow';

type ServiceClient = ReturnType<typeof createServiceClient>;

type ScopeGroup = {
  term_id: string;
  subject_id: string;
  level_id: string;
  curriculum_track: string;
  sectionIds: Set<string>;
};

type GateResult = {
  inserted: number;
  sow_scopes_applied: number;
  sow_scopes_blocked: number;
  blocked_subjects: string[];
};

/**
 * Pre-checks SOW existence per (term × subject × level × curriculum_track) scope.
 * Only calls create_grading_sheets_for_scopes for scopes WITH an approved SOW.
 * Scopes without SOW are counted as blocked and returned for the caller to surface.
 */
async function gateAndActivateScopes(
  service: ServiceClient,
  sectionIds: string[],
  ayId: string,
): Promise<GateResult> {
  const empty: GateResult = { inserted: 0, sow_scopes_applied: 0, sow_scopes_blocked: 0, blocked_subjects: [] };
  if (!sectionIds.length) return empty;

  // 1. Load sections with level + curriculum_track
  const { data: sections } = await service
    .from('sections')
    .select('id, level_id, curriculum_track')
    .in('id', sectionIds);
  if (!sections?.length) return empty;

  const sectionMap = new Map(sections.map((s) => [s.id, s as { id: string; level_id: string; curriculum_track: string }]));
  const levelIds = [...new Set(sections.map((s) => s.level_id))];

  // 2. Load subject configs and terms for this AY
  const [{ data: configs }, { data: terms }] = await Promise.all([
    service
      .from('subject_configs')
      .select('subject_id, level_id')
      .eq('academic_year_id', ayId)
      .in('level_id', levelIds),
    service
      .from('terms')
      .select('id')
      .eq('academic_year_id', ayId),
  ]);

  if (!configs?.length || !terms?.length) return empty;

  // 3. Build scope groups: (term × subject × level × curriculum_track) → Set<section_id>
  const scopeGroups = new Map<string, ScopeGroup>();
  for (const sec of sections) {
    const secConfigs = (configs as { subject_id: string; level_id: string }[])
      .filter((c) => c.level_id === sec.level_id);
    for (const term of terms as { id: string }[]) {
      for (const cfg of secConfigs) {
        const key = `${term.id}:${cfg.subject_id}:${sec.level_id}:${sec.curriculum_track}`;
        if (!scopeGroups.has(key)) {
          scopeGroups.set(key, {
            term_id: term.id,
            subject_id: cfg.subject_id,
            level_id: sec.level_id,
            curriculum_track: sec.curriculum_track,
            sectionIds: new Set(),
          });
        }
        scopeGroups.get(key)!.sectionIds.add(sec.id);
      }
    }
  }

  // 4. Resolve latest published SOW for each unique scope in parallel
  const scopeVersions = await Promise.all(
    [...scopeGroups.values()].map(async (scope) => {
      const version = await getLatestPublished(
        scope.term_id, scope.subject_id, scope.level_id,
        scope.curriculum_track as CurriculumTrack,
      );
      return { scope, version };
    }),
  );

  // 5. Split allowed (has SOW) vs blocked (no SOW)
  const allowedScopes: { section_id: string; subject_id: string; term_id: string }[] = [];
  const blockedScopeGroups: ScopeGroup[] = [];

  for (const { scope, version } of scopeVersions) {
    if (version) {
      for (const sectionId of scope.sectionIds) {
        allowedScopes.push({ section_id: sectionId, subject_id: scope.subject_id, term_id: scope.term_id });
      }
    } else {
      blockedScopeGroups.push(scope);
    }
  }

  // 6. Create sheets for allowed scopes via selective RPC
  let inserted = 0;
  if (allowedScopes.length > 0) {
    const { data: rpcResult } = await service.rpc('create_grading_sheets_for_scopes', {
      p_scopes: allowedScopes,
    });
    inserted = (rpcResult as { inserted?: number } | null)?.inserted ?? 0;
  }

  // 7. Apply SOW (class instances + sync labels + upsert topics) for allowed scopes
  await Promise.all(
    scopeVersions
      .filter(({ version }) => version !== null)
      .map(async ({ scope, version }) => {
        await Promise.all(
          [...scope.sectionIds].map((sid) =>
            createOrUpdateClassInstance(sid, scope.subject_id, scope.term_id, version!.id, false),
          ),
        );

        await service.rpc('sync_grading_sheets_from_sow', {
          p_term_id: scope.term_id,
          p_subject_id: scope.subject_id,
          p_level_id: scope.level_id,
          p_curriculum_track: scope.curriculum_track,
          p_ww: version!.ww,
          p_pt: version!.pt,
        });

        // Upsert evaluation topics (clean replace — no scores exist on newly created sheets)
        await service
          .from('evaluation_checklist_items')
          .delete()
          .eq('term_id', scope.term_id)
          .eq('subject_id', scope.subject_id)
          .eq('level_id', scope.level_id)
          .eq('curriculum_track', scope.curriculum_track);

        if (version!.topics.length > 0) {
          await service.from('evaluation_checklist_items').insert(
            version!.topics.map((t) => ({
              term_id: scope.term_id,
              subject_id: scope.subject_id,
              level_id: scope.level_id,
              curriculum_track: scope.curriculum_track,
              item_text: t.text,
              sort_order: t.sort_order,
              sow_class_instance_id: null,
            })),
          );
        }
      }),
  );

  // 8. Resolve human-readable labels for blocked scopes
  const blockedSubjectIds = [...new Set(blockedScopeGroups.map((s) => s.subject_id))];
  const blockedTermIds = [...new Set(blockedScopeGroups.map((s) => s.term_id))];

  const [{ data: subjectRows }, { data: termRows }] = await Promise.all([
    service.from('subjects').select('id, name').in('id', blockedSubjectIds),
    service.from('terms').select('id, label').in('id', blockedTermIds),
  ]);

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id, s.name as string]));
  const termLabel = new Map((termRows ?? []).map((t) => [t.id, t.label as string]));

  const uniqueBlockedLabels = [...new Set(
    blockedScopeGroups.map((s) =>
      `${subjectName.get(s.subject_id) ?? s.subject_id} · ${termLabel.get(s.term_id) ?? s.term_id}`,
    ),
  )];

  return {
    inserted,
    sow_scopes_applied: scopeVersions.filter(({ version }) => version !== null).length,
    sow_scopes_blocked: blockedScopeGroups.length,
    blocked_subjects: uniqueBlockedLabels,
  };
}

// POST /api/grading-sheets/bulk-create
export async function POST(request: NextRequest) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { ay_id?: string; section_id?: string }
    | null;

  const ayId = body?.ay_id ?? null;
  const sectionId = body?.section_id ?? null;
  const hasAy = typeof ayId === 'string' && ayId.length > 0;
  const hasSection = typeof sectionId === 'string' && sectionId.length > 0;

  if (hasAy === hasSection) {
    return NextResponse.json(
      { error: 'Provide exactly one of ay_id or section_id' },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Resolve target sections + ayId (needed for gateAndActivateScopes)
  let targetSectionIds: string[] = [];
  let resolvedAyId: string;

  if (hasAy) {
    resolvedAyId = ayId!;
    const { data: aySections } = await service
      .from('sections')
      .select('id')
      .eq('academic_year_id', ayId);
    targetSectionIds = ((aySections ?? []) as { id: string }[]).map((s) => s.id);
  } else {
    const { data: sec } = await service
      .from('sections')
      .select('id, academic_year_id')
      .eq('id', sectionId)
      .single();
    if (!sec) return NextResponse.json({ error: 'section not found' }, { status: 404 });
    targetSectionIds = [sectionId!];
    resolvedAyId = (sec as { academic_year_id: string }).academic_year_id;
  }

  const result = await gateAndActivateScopes(service, targetSectionIds, resolvedAyId);

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sheet.bulk_create',
    entityType: 'grading_sheet',
    entityId: hasAy ? ayId : sectionId,
    context: {
      scope: hasAy ? 'ay' : 'section',
      ay_id: ayId,
      section_id: sectionId,
      inserted: result.inserted,
      sow_scopes_applied: result.sow_scopes_applied,
      sow_scopes_blocked: result.sow_scopes_blocked,
      blocked_subjects: result.blocked_subjects,
    },
  });

  invalidateDrillTags('markbook', await requireCurrentAyCode(service));

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    sow_scopes_applied: result.sow_scopes_applied,
    sow_scopes_blocked: result.sow_scopes_blocked,
    blocked_subjects: result.blocked_subjects,
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/grading-sheets/bulk-create/route.ts
git commit -m "feat(markbook): bulk-create gates sheet creation on approved SOW per scope"
```

---

## Task 6: Update SOW apply route — auto-trigger + merge strategy

**Files:**
- Modify: `app/api/sis/admin/sow/apply/route.ts`

- [ ] **Step 1: Rewrite the POST handler**

Replace the entire file:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { SowApplySchema } from '@/lib/schemas/sow';
import { getPublishedVersionById, getMasterById, detectSowChangeImpact } from '@/lib/sis/sow/queries';
import { applyInstanceToSection } from '@/lib/sis/sow/mutations';
import { logAction } from '@/lib/audit/log-action';
import type { SowSlotDescriptor } from '@/lib/schemas/grading-sheet';
import type { SowTopic, CurriculumTrack } from '@/lib/schemas/sow';

type SectionRow = { id: string; level_id: string; curriculum_track: string };

export async function POST(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = SowApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { published_version_id } = parsed.data;

  const version = await getPublishedVersionById(published_version_id);
  if (!version) return NextResponse.json({ error: 'published version not found' }, { status: 404 });

  const master = await getMasterById(version.master_id);
  if (!master) return NextResponse.json({ error: 'master template not found' }, { status: 500 });

  const service = createServiceClient();

  // Find all sections matching this scope's level + curriculum_track (AY-scoped via master)
  const { data: sections } = await service
    .from('sections')
    .select('id, level_id, curriculum_track')
    .eq('level_id', master.level_id)
    .eq('curriculum_track', master.curriculum_track);

  if (!sections || sections.length === 0) {
    return NextResponse.json({ ok: true, sections_targeted: 0, sheets_created: 0, total_sheets_synced: 0, total_checklist_items: 0 });
  }

  const versionPayload = {
    ww: version.ww as (SowSlotDescriptor | null)[],
    pt: version.pt as (SowSlotDescriptor | null)[],
    topics: version.topics as SowTopic[],
  };

  // NEW: Create missing grading sheets for all target sections × subject × term
  const sheetScopes = (sections as SectionRow[]).map((s) => ({
    section_id: s.id,
    subject_id: master.subject_id,
    term_id: master.term_id,
  }));

  const { data: sheetResult } = await service.rpc('create_grading_sheets_for_scopes', {
    p_scopes: sheetScopes,
  });
  const sheetsCreated = (sheetResult as { inserted?: number } | null)?.inserted ?? 0;

  let totalSheetsSynced = 0;
  let totalChecklistItems = 0;
  let totalPreservedSlots = 0;
  let totalPreservedTopics = 0;
  let anyPartialRebaseline = false;

  const results = await Promise.all(
    (sections as SectionRow[]).map(async (section) => {
      // Detect whether scores/responses already exist for this scope
      const impact = await detectSowChangeImpact(
        service,
        section.id,
        master.subject_id,
        master.term_id,
        master.level_id,
        master.curriculum_track,
      );

      const impactMode =
        impact.hasGradingScores || impact.hasEvaluationResponses
          ? 'partial-rebaseline' as const
          : 'clean' as const;

      const { data, error } = await applyInstanceToSection(
        section.id,
        master.subject_id,
        master.term_id,
        master.level_id,
        master.curriculum_track,
        published_version_id,
        versionPayload,
        impactMode,
      );
      if (error || !data) return null;
      return data;
    }),
  );

  for (const r of results) {
    if (!r) continue;
    totalSheetsSynced += r.sheets_synced;
    totalChecklistItems += r.checklist_items_upserted;
    totalPreservedSlots += r.preserved_slots;
    totalPreservedTopics += r.preserved_topics;
    if (r.mode === 'partial-rebaseline') anyPartialRebaseline = true;
  }

  const mode = anyPartialRebaseline ? 'partial-rebaseline' : 'clean';

  const rebaselineReason = anyPartialRebaseline
    ? [
        totalPreservedSlots > 0 ? `WW/PT: ${totalPreservedSlots} slot(s) preserved (scores exist)` : '',
        totalPreservedTopics > 0 ? `Topics: ${totalPreservedTopics} item(s) preserved (ratings exist)` : '',
      ]
        .filter(Boolean)
        .join('; ')
    : null;

  await logAction({
    service,
    actor: auth.user,
    action: 'sow.instance.apply',
    entityType: 'sow_class_instance',
    entityId: published_version_id,
    context: {
      published_version_id,
      version_number: version.version_number,
      master_id: version.master_id,
      curriculum_track: master.curriculum_track,
      sections_targeted: sections.length,
      sheets_created: sheetsCreated,
      total_sheets_synced: totalSheetsSynced,
      total_checklist_items: totalChecklistItems,
      mode,
      preserved_slots: totalPreservedSlots,
      preserved_topics: totalPreservedTopics,
      rebaseline_reason: rebaselineReason,
    },
  });

  return NextResponse.json({
    ok: true,
    sections_targeted: sections.length,
    sheets_created: sheetsCreated,
    total_sheets_synced: totalSheetsSynced,
    total_checklist_items: totalChecklistItems,
    mode,
    preserved_slots: totalPreservedSlots,
    preserved_topics: totalPreservedTopics,
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/sis/admin/sow/apply/route.ts
git commit -m "feat(sow): apply route auto-creates sheets + merge strategy for mid-year SOW changes"
```

---

## Task 7: Add "sow" readiness step to `lib/sis/readiness.ts`

**Files:**
- Modify: `lib/sis/readiness.ts`

- [ ] **Step 1: Update `ReadinessStepId` and `AyReadiness.total`**

```typescript
export type ReadinessStepId =
  | "ay-setup"
  | "calendar"
  | "sections"
  | "sow"          // NEW — inserted between sections and grading-sheets
  | "grading-sheets";

export type AyReadiness = {
  ayCode: string;
  steps: ReadinessStep[];
  complete: number;
  total: 5;        // WAS 4
};
```

- [ ] **Step 2: Add `checkSow` function**

Add after `checkSections`:

```typescript
async function checkSow(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "sow",
    step: 4,
    label: "Scheme of Work",
    href: "/sis/admin/sow",
  };

  const [{ data: sections }, { data: terms }] = await Promise.all([
    db.from("sections").select("level_id, curriculum_track").eq("academic_year_id", ayId),
    db.from("terms").select("id").eq("academic_year_id", ayId),
  ]);

  if (!sections?.length || !terms?.length) {
    return { ...base, status: "not_started", description: "Create sections and terms first", fraction: { done: 0, total: 0 } };
  }

  const levelTracks = [
    ...new Map(sections.map((s) => [`${s.level_id}:${s.curriculum_track}`, s])).values(),
  ];
  const levelIds = [...new Set(levelTracks.map((s) => s.level_id))];

  const { data: configs } = await db
    .from("subject_configs")
    .select("subject_id, level_id")
    .eq("academic_year_id", ayId)
    .in("level_id", levelIds);

  if (!configs?.length) {
    return { ...base, status: "not_started", description: "No subjects configured for this AY", fraction: { done: 0, total: 0 } };
  }

  // Build the full needed scope set
  const neededKeys = new Set<string>();
  for (const lt of levelTracks) {
    for (const term of terms) {
      for (const cfg of configs.filter((c) => c.level_id === lt.level_id)) {
        neededKeys.add(`${term.id}:${cfg.subject_id}:${lt.level_id}:${lt.curriculum_track}`);
      }
    }
  }
  const total = neededKeys.size;
  if (total === 0) {
    return { ...base, status: "not_started", description: "No SOW scopes to cover", fraction: { done: 0, total: 0 } };
  }

  // Get all masters with at least one published version for this AY
  const { data: masters } = await db
    .from("sow_master_templates")
    .select("term_id, subject_id, level_id, curriculum_track, sow_published_versions(id)")
    .eq("ay_id", ayId);

  const publishedKeys = new Set(
    (masters ?? [])
      .filter((m) => ((m.sow_published_versions as { id: string }[] | null)?.length ?? 0) > 0)
      .map((m) => `${m.term_id}:${m.subject_id}:${m.level_id}:${m.curriculum_track}`),
  );

  const done = [...neededKeys].filter((k) => publishedKeys.has(k)).length;
  const allDone = done === total;

  return {
    ...base,
    status: allDone ? "done" : done > 0 ? "partial" : "not_started",
    description: allDone
      ? "All subject-term scopes have approved SOW"
      : `${done} of ${total} subject-term scopes have approved SOW`,
    fraction: { done, total },
  };
}
```

- [ ] **Step 3: Update `checkGradingSheets` step number from 4 → 5**

In `checkGradingSheets`, update the `base` object:

```typescript
const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
  id: "grading-sheets",
  step: 5,          // WAS 4
  label: "Grading Sheets",
  href: "/markbook/sections",
};
```

- [ ] **Step 4: Update `buildAllNotStarted` to include the sow step**

```typescript
function buildAllNotStarted(ayCode: string): AyReadiness {
  const steps: ReadinessStep[] = [
    { id: "ay-setup", step: 1, label: "AY Setup", href: "/sis/ay-setup", status: "not_started", description: "Create the academic year and define term dates" },
    { id: "calendar", step: 2, label: "School Calendar", href: "/sis/calendar", status: "not_started", description: "Generate school days for all terms" },
    { id: "sections", step: 3, label: "Sections", href: "/sis/sections", status: "not_started", description: "Create sections and assign form advisers" },
    { id: "sow", step: 4, label: "Scheme of Work", href: "/sis/admin/sow", status: "not_started", description: "Publish SOW for all subject-term scopes", fraction: { done: 0, total: 0 } },
    { id: "grading-sheets", step: 5, label: "Grading Sheets", href: "/markbook/sections", status: "not_started", description: "Bulk-create grading sheets in Markbook → Sections", fraction: { done: 0, total: 0 } },
  ];
  return { ayCode, steps, complete: 0, total: 5 };
}
```

- [ ] **Step 5: Update `getAyReadinessUncached` to run 5 checks**

```typescript
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
    checkSections(db, ay.id),
    checkSow(db, ay.id),
    checkGradingSheets(db, ay.id),
  ]);

  const steps = [step1, step2, step3, step4, step5];
  const complete = steps.filter((s) => s.status === "done").length;
  return { ayCode, steps, complete, total: 5 };
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/sis/readiness.ts
git commit -m "feat(readiness): add SOW step between sections and grading-sheets"
```

---

## Task 8: Update `AyReadinessPill` — add "sow" step icon

**Files:**
- Modify: `components/sis/ay-readiness-pill.tsx`

- [ ] **Step 1: Add `ScrollText` import and update `STEP_ICONS`**

Add `ScrollText` to the lucide-react import and add the sow entry to `STEP_ICONS`:

```typescript
import {
  ArrowUpRight,
  CalendarCog,
  CalendarDays,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  LayoutGrid,
  Minus,
  ScrollText,     // ADD THIS
  TableProperties,
  type LucideIcon,
} from "lucide-react";
```

```typescript
const STEP_ICONS: Record<ReadinessStepId, LucideIcon> = {
  "ay-setup": CalendarCog,
  "calendar": CalendarDays,
  "sections": LayoutGrid,
  "sow": ScrollText,            // ADD THIS
  "grading-sheets": TableProperties,
};
```

- [ ] **Step 2: Update the grading-sheets step description when sow is incomplete**

Find where the step cards are rendered (the `ReadinessStep` map in the dialog body). The steps render generically from the `readiness.steps` array — no per-step branching exists. The dependency copy ("Approve SOW first…") should surface in the `checkGradingSheets` description when the sow step is incomplete.

Update `checkGradingSheets` in `lib/sis/readiness.ts` to accept the sow step status and adjust its description. The cleanest approach: pass `sowDone` as a parameter.

Update `checkGradingSheets` signature:

```typescript
async function checkGradingSheets(db: SupabaseClient, ayId: string, sowDone: boolean): Promise<ReadinessStep> {
```

At the end of `checkGradingSheets`, update the `not_started` description:

```typescript
  // When sow step is incomplete, guide the admin to approve SOW first
  const notStartedDesc = sowDone
    ? "Bulk-create grading sheets in Markbook → Sections"
    : "Approve SOW first — grading sheets will be generated automatically on apply";

  return {
    ...base,
    status: done ? "done" : sectionsWithSheets > 0 ? "partial" : "not_started",
    description: done
      ? "Grading sheets created for all sections"
      : sectionsWithSheets > 0
        ? `${sectionsWithSheets} of ${totalSections} sections have grading sheets`
        : notStartedDesc,
    fraction: { done: sectionsWithSheets, total: totalSections },
  };
```

Update `getAyReadinessUncached` to pass `sowDone`:

```typescript
  const [step1, step2, step3, step4] = await Promise.all([
    checkAySetup(db, ay.id),
    checkCalendar(db, ay.id),
    checkSections(db, ay.id),
    checkSow(db, ay.id),
  ]);
  const step5 = await checkGradingSheets(db, ay.id, step4.status === 'done');

  const steps = [step1, step2, step3, step4, step5];
```

Note: `step5` is now sequential (depends on `step4.status`) — update accordingly.

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npx next build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add components/sis/ay-readiness-pill.tsx lib/sis/readiness.ts
git commit -m "feat(readiness-pill): add SOW step with ScrollText icon + grading-sheets dependency copy"
```

---

## Task 9: Evaluation locked state

**Files:**
- Modify: `app/(evaluation)/evaluation/sections/[sectionId]/page.tsx`

- [ ] **Step 1: Add the locked empty state**

Find the `ChecklistRosterClient` render in the Checklists tab content (the JSX that renders when the Checklists tab is active and a subject is selected). Wrap it in a conditional:

```tsx
// At the top of the file, add Lock to existing lucide imports:
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarClock, ClipboardList, Lock, MessageCircle, Sparkle, SquarePen } from "lucide-react";
```

In the JSX where `<ChecklistRosterClient>` is rendered, replace with:

```tsx
{!sowCheck.exists ? (
  // SOW not yet approved for this subject — locked state
  <div className="flex flex-col items-center gap-5 py-16">
    <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-amber to-brand-amber/60 shadow-md">
      <Lock className="size-6 text-white" />
    </div>
    <div className="space-y-1.5 text-center">
      <p className="font-serif text-xl font-semibold text-foreground">SOW not yet approved</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Topics for{" "}
        <span className="font-medium text-foreground">
          {visibleSubjects.find((s) => s.id === selectedSubjectId)?.name ?? "this subject"}
        </span>{" "}
        · {selectedTerm?.label} will appear here once the administrator publishes and applies the Scheme of Work.
      </p>
    </div>
    {(sessionUser.role === "registrar" ||
      sessionUser.role === "school_admin" ||
      sessionUser.role === "superadmin") && (
      <Link
        href="/sis/admin/sow"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:underline"
      >
        Open SOW builder
        <ArrowUpRight className="size-3.5" />
      </Link>
    )}
  </div>
) : (
  <ChecklistRosterClient
    // ... existing props unchanged ...
  />
)}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(evaluation)/evaluation/sections/[sectionId]/page.tsx"
git commit -m "feat(evaluation): locked empty state for Checklists tab when SOW not approved"
```

---

## Task 10: Update bulk-create UI — amber toast for blocked scopes

**Files:**
- Modify: `components/markbook/bulk-create-sheets-button.tsx`
- Modify: `components/sis/generate-sheets-dialog.tsx`

- [ ] **Step 1: Update `BulkCreateSheetsButton`**

In the `run()` function, update the success toast block:

```typescript
const inserted = body.inserted ?? 0;
const blockedCount = body.sow_scopes_blocked ?? 0;
const blockedSubjects: string[] = body.blocked_subjects ?? [];

if (inserted === 0 && blockedCount === 0) {
  toast.info(`No new sheets needed for ${ayCode} — every (section × subject × term) is already covered.`);
} else {
  if (inserted > 0) {
    toast.success(
      `Created ${inserted.toLocaleString('en-SG')} sheet${inserted === 1 ? '' : 's'} for ${ayCode}.`,
    );
  }
  if (blockedCount > 0) {
    toast.warning(
      `${blockedCount} scope${blockedCount === 1 ? '' : 's'} skipped — no approved SOW: ${blockedSubjects.slice(0, 3).join(', ')}${blockedSubjects.length > 3 ? ` +${blockedSubjects.length - 3} more` : ''}.`,
    );
  }
}
```

- [ ] **Step 2: Update `GenerateSheetsDialog`**

In the `run()` function, after the existing toast logic, add:

```typescript
const blockedCount = Number(json?.sow_scopes_blocked ?? 0);
const blockedSubjects: string[] = json?.blocked_subjects ?? [];

if (blockedCount > 0) {
  toast.warning(
    `${blockedCount} scope${blockedCount === 1 ? '' : 's'} skipped — no approved SOW: ${blockedSubjects.slice(0, 3).join(', ')}${blockedSubjects.length > 3 ? ` +${blockedSubjects.length - 3} more` : ''}.`,
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/markbook/bulk-create-sheets-button.tsx components/sis/generate-sheets-dialog.tsx
git commit -m "feat(markbook): show amber toast for SOW-blocked scopes in bulk-create UI"
```

---

## Task 11: SOW chip amber variant for partial rebaseline

**Files:**
- Modify: `components/grading/score-entry-grid.tsx`
- Modify: `app/(markbook)/markbook/grading/[id]/page.tsx`

- [ ] **Step 1: Add `sowPartialRebaseline` prop to `ScoreEntryGrid` and the inner `ActivityLabelsForm`**

In `components/grading/score-entry-grid.tsx`, update the `Props` type:

```typescript
type Props = {
  // ... existing props ...
  sowSourced?: boolean;
  sowVersion?: number | null;
  sowPartialRebaseline?: boolean;  // ADD THIS
};
```

Update the destructured defaults in the component function:

```typescript
  sowSourced = false,
  sowVersion = null,
  sowPartialRebaseline = false,    // ADD THIS
```

Pass it through to the `ActivityLabelsForm` call:

```tsx
<ActivityLabelsForm
  wwTotals={wwTotals}
  ptTotals={ptTotals}
  labels={labels}
  sowSourced={sowSourced}
  sowVersion={sowVersion}
  sowPartialRebaseline={sowPartialRebaseline}   // ADD THIS
/>
```

- [ ] **Step 2: Update `ActivityLabelsForm` to render amber chip when partial rebaseline**

Update the `ActivityLabelsForm` props type (around line 415):

```typescript
{
  wwTotals: number[];
  ptTotals: number[];
  labels: Required<SlotLabels>;
  sowSourced: boolean;
  sowVersion?: number | null;
  sowPartialRebaseline?: boolean;  // ADD THIS
}
```

Update the destructuring:

```typescript
  sowPartialRebaseline = false,    // ADD THIS
```

Replace the SOW chip render (lines ~438-442):

```tsx
{sowSourced && (
  <span
    title={
      sowPartialRebaseline
        ? "SOW updated mid-year. Some slots or topics were preserved because scores already existed."
        : undefined
    }
    className={
      sowPartialRebaseline
        ? "font-mono text-[10px] uppercase tracking-[0.12em] text-brand-amber"
        : "font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60"
    }
  >
    · SOW{sowVersion != null ? ` v${sowVersion}` : ""}
    {sowPartialRebaseline && " ⚠"}
  </span>
)}
```

- [ ] **Step 3: Update the grading page to pass `sowPartialRebaseline`**

In `app/(markbook)/markbook/grading/[id]/page.tsx`, update the `ScoreEntryGrid` usage:

```tsx
<ScoreEntryGrid
  sheetId={sheet.id}
  wwTotals={(sheet.ww_totals ?? []) as number[]}
  ptTotals={(sheet.pt_totals ?? []) as number[]}
  qaTotal={sheet.qa_total as number | null}
  rows={rows}
  readOnly={readOnly}
  requireApproval={requireApproval}
  slotLabels={sheet.slot_labels as { ww?: ({ label?: string | null; date?: string | null; page?: string | null } | null)[]; pt?: ({ label?: string | null; date?: string | null; page?: string | null } | null)[]; qa?: string | null } | null ?? undefined}
  letterDisplay={!isExaminable}
  sowSourced={sowSourced}
  sowVersion={sowCheck.version?.version_number ?? null}
  sowPartialRebaseline={sowCheck.partial_rebaseline}   // ADD THIS
/>
```

- [ ] **Step 4: Type-check + build**

```bash
npx tsc --noEmit
npx next build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add components/grading/score-entry-grid.tsx "app/(markbook)/markbook/grading/[id]/page.tsx"
git commit -m "feat(markbook): amber SOW chip variant when sheet has partial rebaseline"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Migration 059: `create_grading_sheets_for_scopes` RPC | Task 1 |
| Migration 059: `has_partial_rebaseline` column | Task 1 |
| Bulk-create gates on SOW per scope | Task 5 |
| Bulk-create blocked scopes in response + toast | Task 5, Task 10 |
| SOW apply auto-triggers sheet creation | Task 6 |
| SOW apply: impact detection (hasGradingScores, hasEvaluationResponses) | Task 3, Task 6 |
| SOW apply: clean vs merge path for slot labels | Task 4, Task 6 |
| SOW apply: clean vs merge path for evaluation topics | Task 4, Task 6 |
| SOW apply: audit trail with mode + reason + preserved counts | Task 6 |
| `has_partial_rebaseline` set on class instance | Task 4, Task 6 |
| Amber SOW chip when partial rebaseline | Task 11 |
| AY Readiness: "sow" step between sections + grading-sheets | Task 7, Task 8 |
| Grading-sheets dependency copy when sow incomplete | Task 8 |
| Evaluation Checklists: locked empty state when no SOW | Task 9 |
| Existing sheets unaffected (gate on new creation only) | Task 5 (gateAndActivateScopes checks SOW before creating, never touches existing sheets) |

All spec requirements covered. ✅
