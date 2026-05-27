import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { SowLabel, SowTopic } from './queries';

type SowSlotLabels = {
  ww: (SowLabel | null)[];
  pt: (SowLabel | null)[];
  qa: string | null;
};

/**
 * Merge new SOW WW/PT labels into an existing grading sheet's slot_labels.
 * Scored positions keep their existing label; unscored positions take the new label.
 * Labels carry { label, page } — date is intentionally left blank for the
 * teacher to fill in per-section.
 */
export async function mergeGradingSheetSlots(
  service: ReturnType<typeof createServiceClient>,
  sheetId: string,
  newWw: SowLabel[],
  newPt: SowLabel[]
): Promise<{ error: string | null; preserved: number }> {
  const { data: sheet } = await service
    .from('grading_sheets')
    .select('slot_labels, ww_totals, pt_totals')
    .eq('id', sheetId)
    .single();
  if (!sheet) return { error: 'sheet not found', preserved: 0 };

  const { data: entries } = await service
    .from('grade_entries')
    .select('ww_scores, pt_scores')
    .eq('grading_sheet_id', sheetId);

  const current = (sheet.slot_labels ?? {
    ww: [],
    pt: [],
    qa: null,
  }) as SowSlotLabels;

  const wwHasScore = (i: number) =>
    (entries ?? []).some(
      (e) => ((e.ww_scores ?? []) as (number | null)[])[i] != null
    );
  const ptHasScore = (i: number) =>
    (entries ?? []).some(
      (e) => ((e.pt_scores ?? []) as (number | null)[])[i] != null
    );

  let preservedCount = 0;
  const mergedWw = ((sheet.ww_totals ?? []) as number[]).map((_, i) => {
    if (i < newWw.length && newWw[i]) return { ...newWw[i], date: null };
    if (wwHasScore(i)) {
      preservedCount++;
      return current.ww[i] ?? null;
    }
    return null;
  });

  const mergedPt = ((sheet.pt_totals ?? []) as number[]).map((_, i) => {
    if (i < newPt.length && newPt[i]) return { ...newPt[i], date: null };
    if (ptHasScore(i)) {
      preservedCount++;
      return current.pt[i] ?? null;
    }
    return null;
  });

  const { error } = await service
    .from('grading_sheets')
    .update({ slot_labels: { ...current, ww: mergedWw, pt: mergedPt } })
    .eq('id', sheetId);

  return { error: error?.message ?? null, preserved: preservedCount };
}

/**
 * Seed SOW topics into evaluation_checklist_items for a (section × subject × term).
 * Items that already have ratings are preserved. Items with no ratings are replaced.
 * New topics not in the preserved set are inserted.
 */
export async function mergeEvaluationTopics(
  service: ReturnType<typeof createServiceClient>,
  scope: {
    term_id: string;
    subject_id: string;
    section_id: string;
    sow_instance_id?: string | null;
  },
  newTopics: SowTopic[]
): Promise<{ preserved: number; deleted: number; inserted: number }> {
  const { data: existingItems } = await service
    .from('evaluation_checklist_items')
    .select('id, item_text')
    .eq('term_id', scope.term_id)
    .eq('subject_id', scope.subject_id)
    .eq('section_id', scope.section_id);

  if (!existingItems?.length) {
    if (newTopics.length > 0) {
      await service.from('evaluation_checklist_items').insert(
        newTopics.map((t) => ({
          term_id: scope.term_id,
          subject_id: scope.subject_id,
          section_id: scope.section_id,
          sow_instance_id: scope.sow_instance_id ?? null,
          item_text: t.text,
          sort_order: t.sort_order,
        }))
      );
    }
    return { preserved: 0, deleted: 0, inserted: newTopics.length };
  }

  const { data: responses } = await service
    .from('evaluation_checklist_responses')
    .select('item_id')
    .in(
      'item_id',
      existingItems.map((i) => (i as { id: string }).id)
    )
    .not('rating', 'is', null);

  const respondedIds = new Set(
    (responses ?? []).map((r) => (r as { item_id: string }).item_id)
  );
  const toKeep = existingItems.filter((i) =>
    respondedIds.has((i as { id: string }).id)
  );
  const toDelete = existingItems.filter(
    (i) => !respondedIds.has((i as { id: string }).id)
  );

  if (toDelete.length > 0) {
    await service
      .from('evaluation_checklist_items')
      .delete()
      .in(
        'id',
        toDelete.map((i) => (i as { id: string }).id)
      );
  }

  const keptTexts = new Set(
    toKeep.map((i) => (i as { item_text: string }).item_text)
  );
  const toInsert = newTopics.filter((t) => !keptTexts.has(t.text));

  if (toInsert.length > 0) {
    await service.from('evaluation_checklist_items').insert(
      toInsert.map((t) => ({
        term_id: scope.term_id,
        subject_id: scope.subject_id,
        section_id: scope.section_id,
        sow_instance_id: scope.sow_instance_id ?? null,
        item_text: t.text,
        sort_order: t.sort_order,
      }))
    );
  }

  return {
    preserved: toKeep.length,
    deleted: toDelete.length,
    inserted: toInsert.length,
  };
}
