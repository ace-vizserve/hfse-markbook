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
      .update({ published_version_id, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return { data: null, error: error.message };
    return { data: updated as SowClassInstanceRow, error: null };
  }

  const { data: inserted, error } = await service
    .from('sow_class_instances')
    .insert({ section_id, subject_id, term_id, published_version_id })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: inserted as SowClassInstanceRow, error: null };
}

export type ApplyResult = {
  instance_id: string;
  sheets_synced: number;
  checklist_items_upserted: number;
};

// Apply a published version to a single section:
// 1. Create/update sow_class_instance
// 2. Call sync_grading_sheets_from_sow RPC (updates unlocked sheets' slot_labels)
// 3. Upsert evaluation_checklist_items from SOW topics
export async function applyInstanceToSection(
  section_id: string,
  subject_id: string,
  term_id: string,
  level_id: string,
  curriculum_track: string,
  published_version_id: string,
  version: { ww: (SowSlotDescriptor | null)[]; pt: (SowSlotDescriptor | null)[]; topics: SowTopic[] },
): Promise<{ data: ApplyResult | null; error: string | null }> {
  const service = createServiceClient();

  // Step 1: Create or update class instance
  const { data: instance, error: instanceErr } = await createOrUpdateClassInstance(
    section_id,
    subject_id,
    term_id,
    published_version_id,
  );
  if (instanceErr || !instance) return { data: null, error: instanceErr ?? 'instance create failed' };

  // Step 2: Sync grading sheet labels (RPC handles locked-sheet exclusion)
  const { data: syncResult } = await service.rpc('sync_grading_sheets_from_sow', {
    p_term_id: term_id,
    p_subject_id: subject_id,
    p_level_id: level_id,
    p_curriculum_track: curriculum_track,
    p_ww: version.ww,
    p_pt: version.pt,
  });
  const sheetsSync = (syncResult as { rows_synced?: number } | null)?.rows_synced ?? 0;

  // Step 3: Upsert evaluation_checklist_items from topics
  // Hard reset: delete existing items for this scope then re-insert
  await service
    .from('evaluation_checklist_items')
    .delete()
    .eq('term_id', term_id)
    .eq('subject_id', subject_id)
    .eq('level_id', level_id)
    .eq('curriculum_track', curriculum_track);

  let checklistCount = 0;
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

  return {
    data: {
      instance_id: instance.id,
      sheets_synced: sheetsSync,
      checklist_items_upserted: checklistCount,
    },
    error: null,
  };
}
