import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { SowMasterUpsert } from '@/lib/schemas/sow';
import type { SowSlotDescriptor } from '@/lib/schemas/grading-sheet';
import type { SowTopic } from '@/lib/schemas/sow';
import type { SowMasterRow, SowPublishedVersionRow, SowClassInstanceRow } from './queries';

export async function upsertMaster(
  data: SowMasterUpsert,
  userId: string,
): Promise<{ data: SowMasterRow | null; error: string | null }> {
  const service = createServiceClient();

  // Check if a master already exists for this scope
  const { data: existing } = await service
    .from('sow_master_templates')
    .select('id')
    .eq('ay_id', data.ay_id)
    .eq('term_id', data.term_id)
    .eq('subject_id', data.subject_id)
    .eq('level_id', data.level_id)
    .eq('curriculum_track', data.curriculum_track)
    .maybeSingle();

  if (existing?.id) {
    const { data: updated, error } = await service
      .from('sow_master_templates')
      .update({
        topics: data.topics,
        ww: data.ww,
        pt: data.pt,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: updated as SowMasterRow, error: null };
  }

  const { data: inserted, error } = await service
    .from('sow_master_templates')
    .insert({
      ay_id: data.ay_id,
      term_id: data.term_id,
      subject_id: data.subject_id,
      level_id: data.level_id,
      curriculum_track: data.curriculum_track,
      topics: data.topics,
      ww: data.ww,
      pt: data.pt,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: inserted as SowMasterRow, error: null };
}

export async function publishVersion(
  masterId: string,
  notes: string | undefined,
  userId: string,
): Promise<{ data: SowPublishedVersionRow | null; error: string | null }> {
  const service = createServiceClient();

  // Fetch master to snapshot its current ww/pt/topics
  const { data: master, error: masterErr } = await service
    .from('sow_master_templates')
    .select('*')
    .eq('id', masterId)
    .single();
  if (masterErr || !master) return { data: null, error: masterErr?.message ?? 'master not found' };

  // Find next version_number
  const { data: latestVersion } = await service
    .from('sow_published_versions')
    .select('version_number')
    .eq('master_id', masterId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latestVersion?.version_number ?? 0) + 1;

  const { data: published, error } = await service
    .from('sow_published_versions')
    .insert({
      master_id: masterId,
      version_number: nextVersion,
      topics: master.topics,
      ww: master.ww,
      pt: master.pt,
      notes: notes ?? null,
      published_by: userId,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: published as SowPublishedVersionRow, error: null };
}

export async function createOrUpdateClassInstance(
  section_id: string,
  subject_id: string,
  term_id: string,
  published_version_id: string,
  has_partial_rebaseline = false,
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
      .update({
        published_version_id,
        has_partial_rebaseline,
        updated_at: new Date().toISOString(),
      })
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

type SowSlotLabels = {
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  qa: string | null;
};

/**
 * Merge new SOW slot descriptors into an existing grading sheet's slot_labels.
 * Scored positions keep their existing label; unscored positions take the new SOW label.
 */
export async function mergeGradingSheetSlots(
  service: ReturnType<typeof createServiceClient>,
  sheetId: string,
  newWw: (SowSlotDescriptor | null)[],
  newPt: (SowSlotDescriptor | null)[],
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

  const current = (sheet.slot_labels ?? { ww: [], pt: [], qa: null }) as SowSlotLabels;

  const wwHasScore = (i: number) =>
    (entries ?? []).some((e) => ((e.ww_scores ?? []) as (number | null)[])[i] != null);
  const ptHasScore = (i: number) =>
    (entries ?? []).some((e) => ((e.pt_scores ?? []) as (number | null)[])[i] != null);

  let preservedCount = 0;
  const mergedWw = ((sheet.ww_totals ?? []) as number[]).map((_, i) => {
    if (i < newWw.length && newWw[i] !== null) return newWw[i];
    if (wwHasScore(i)) { preservedCount++; return current.ww[i] ?? null; }
    return null;
  });

  const mergedPt = ((sheet.pt_totals ?? []) as number[]).map((_, i) => {
    if (i < newPt.length && newPt[i] !== null) return newPt[i];
    if (ptHasScore(i)) { preservedCount++; return current.pt[i] ?? null; }
    return null;
  });

  const { error } = await service
    .from('grading_sheets')
    .update({ slot_labels: { ...current, ww: mergedWw, pt: mergedPt } })
    .eq('id', sheetId);

  return { error: error?.message ?? null, preserved: preservedCount };
}

/**
 * Merge new SOW topics into existing evaluation_checklist_items for a scope.
 * Items with ≥1 non-null rating are preserved. Items with no ratings are deleted.
 * New topics not in the preserved set are inserted.
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

  const { data: responses } = await service
    .from('evaluation_checklist_responses')
    .select('item_id')
    .in(
      'item_id',
      existingItems.map((i) => i.id),
    )
    .not('rating', 'is', null);

  const respondedIds = new Set((responses ?? []).map((r) => r.item_id));
  const toKeep = existingItems.filter((i) => respondedIds.has(i.id));
  const toDelete = existingItems.filter((i) => !respondedIds.has(i.id));

  if (toDelete.length > 0) {
    await service
      .from('evaluation_checklist_items')
      .delete()
      .in(
        'id',
        toDelete.map((i) => i.id),
      );
  }

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

export type ApplyMode = 'clean' | 'partial-rebaseline';

export type ApplyResult = {
  instance_id: string;
  sheets_synced: number;
  checklist_items_upserted: number;
  mode: ApplyMode;
  preserved_slots: number;
  preserved_topics: number;
};

// Apply a published version to a single section:
// 1. Create/update sow_class_instance
// 2. Sync grading sheet slot labels — clean mode uses the hard-reset RPC,
//    partial-rebaseline mode merges into unlocked sheets preserving scored slots
// 3. Sync evaluation_checklist_items — clean mode hard-resets, partial-rebaseline
//    mode preserves topics that already have ratings
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
    section_id,
    subject_id,
    term_id,
    published_version_id,
    impactMode === 'partial-rebaseline',
  );
  if (instanceErr || !instance) return { data: null, error: instanceErr ?? 'instance create failed' };

  let sheetsSync = 0;
  let preservedSlots = 0;

  if (impactMode === 'clean') {
    // Step 2a: hard-reset slot labels via RPC (handles locked-sheet exclusion)
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
    // Step 2b: merge slot labels into the section's unlocked grading sheet
    const { data: gradingSheet } = await service
      .from('grading_sheets')
      .select('id')
      .eq('section_id', section_id)
      .eq('subject_id', subject_id)
      .eq('term_id', term_id)
      .maybeSingle();

    if (gradingSheet?.id) {
      const locked = await isSheetLocked(service, gradingSheet.id);
      if (!locked) {
        const mergeResult = await mergeGradingSheetSlots(service, gradingSheet.id, version.ww, version.pt);
        if (!mergeResult.error) {
          sheetsSync = 1;
          preservedSlots = mergeResult.preserved;
        }
      }
    }
  }

  // Step 3: Sync evaluation_checklist_items
  let checklistCount = 0;
  let preservedTopics = 0;

  if (impactMode === 'clean') {
    // Step 3a: hard reset — delete existing items for this scope then re-insert
    await service
      .from('evaluation_checklist_items')
      .delete()
      .eq('term_id', term_id)
      .eq('subject_id', subject_id)
      .eq('level_id', level_id)
      .eq('curriculum_track', curriculum_track);

    if (version.topics.length > 0) {
      const rows = version.topics.map((topic) => ({
        term_id,
        subject_id,
        level_id,
        curriculum_track,
        sow_class_instance_id: instance.id,
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
    // Step 3b: merge — preserve rated topics, delete unrated, insert new
    const mergeResult = await mergeEvaluationTopics(
      service,
      { term_id, subject_id, level_id, curriculum_track },
      version.topics,
    );
    checklistCount = mergeResult.inserted;
    preservedTopics = mergeResult.preserved;
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
