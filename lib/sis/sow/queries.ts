import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import type { CurriculumTrack } from '@/lib/schemas/sow';
import type { SowSlotDescriptor } from '@/lib/schemas/grading-sheet';
import type { SowTopic } from '@/lib/schemas/sow';

export type SowMasterRow = {
  id: string;
  ay_id: string;
  term_id: string;
  subject_id: string;
  level_id: string;
  curriculum_track: CurriculumTrack;
  topics: SowTopic[];
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SowPublishedVersionRow = {
  id: string;
  master_id: string;
  version_number: number;
  topics: SowTopic[];
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  notes: string | null;
  published_at: string;
  published_by: string | null;
};

export type SowClassInstanceRow = {
  id: string;
  section_id: string;
  subject_id: string;
  term_id: string;
  published_version_id: string;
  has_partial_rebaseline: boolean;
  created_at: string;
  updated_at: string;
};

export async function getMasterTemplate(
  ay_id: string,
  term_id: string,
  subject_id: string,
  level_id: string,
  curriculum_track: CurriculumTrack,
): Promise<SowMasterRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_master_templates')
    .select('*')
    .eq('ay_id', ay_id)
    .eq('term_id', term_id)
    .eq('subject_id', subject_id)
    .eq('level_id', level_id)
    .eq('curriculum_track', curriculum_track)
    .maybeSingle();
  return (data as SowMasterRow | null) ?? null;
}

export async function getMasterById(masterId: string): Promise<SowMasterRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_master_templates')
    .select('*')
    .eq('id', masterId)
    .maybeSingle();
  return (data as SowMasterRow | null) ?? null;
}

export async function getPublishedVersions(masterId: string): Promise<SowPublishedVersionRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_published_versions')
    .select('*')
    .eq('master_id', masterId)
    .order('version_number', { ascending: false });
  return (data as SowPublishedVersionRow[]) ?? [];
}

export async function getPublishedVersionById(versionId: string): Promise<SowPublishedVersionRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_published_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  return (data as SowPublishedVersionRow | null) ?? null;
}

export async function getLatestPublished(
  term_id: string,
  subject_id: string,
  level_id: string,
  curriculum_track: CurriculumTrack,
): Promise<SowPublishedVersionRow | null> {
  const service = createServiceClient();
  const { data } = await service.rpc('get_latest_sow_published_version', {
    p_term_id: term_id,
    p_subject_id: subject_id,
    p_level_id: level_id,
    p_curriculum_track: curriculum_track,
  });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as {
    version_id: string;
    version_number: number;
    ww: (SowSlotDescriptor | null)[];
    pt: (SowSlotDescriptor | null)[];
    topics: SowTopic[];
  };
  // Reconstruct a partial version row from the RPC result
  return {
    id: row.version_id,
    master_id: '',
    version_number: row.version_number,
    topics: row.topics ?? [],
    ww: row.ww ?? [],
    pt: row.pt ?? [],
    notes: null,
    published_at: '',
    published_by: null,
  };
}

export async function getClassInstance(
  section_id: string,
  subject_id: string,
  term_id: string,
): Promise<SowClassInstanceRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('sow_class_instances')
    .select('*')
    .eq('section_id', section_id)
    .eq('subject_id', subject_id)
    .eq('term_id', term_id)
    .maybeSingle();
  return (data as SowClassInstanceRow | null) ?? null;
}

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
