import { z } from 'zod';
import { SowSlotDescriptorSchema } from './grading-sheet';
import { CURRICULUM_TRACKS, type CurriculumTrack } from './section';

// Re-export so existing consumers of '@/lib/schemas/sow' keep working.
export { CURRICULUM_TRACKS, type CurriculumTrack };

export const CurriculumTrackSchema = z.enum(CURRICULUM_TRACKS);

export const SowTopicSchema = z.object({
  text: z.string().min(1).max(200),
  sort_order: z.number().int().min(0),
});

export type SowTopic = z.infer<typeof SowTopicSchema>;

// PUT /api/sis/admin/sow — upsert a master template
export const SowMasterUpsertSchema = z.object({
  ay_id: z.string().uuid(),
  term_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  level_id: z.string().uuid(),
  curriculum_track: CurriculumTrackSchema,
  topics: z.array(SowTopicSchema).max(30),
  ww: z.array(SowSlotDescriptorSchema.nullable()).max(5),
  pt: z.array(SowSlotDescriptorSchema.nullable()).max(5),
});

export type SowMasterUpsert = z.infer<typeof SowMasterUpsertSchema>;

// POST /api/sis/admin/sow/publish — publish a master template snapshot
export const SowPublishSchema = z.object({
  master_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type SowPublish = z.infer<typeof SowPublishSchema>;

// POST /api/sis/admin/sow/apply — apply a published version to class instances
export const SowApplySchema = z.object({
  published_version_id: z.string().uuid(),
  // Scope: which (term, subject, level, track) to target — derived server-side
  // from the published version's master_id chain, not trusted from client
});

export type SowApply = z.infer<typeof SowApplySchema>;

// GET query params for the SOW builder
export const SowScopeSchema = z.object({
  ay_id: z.string().uuid().optional(),
  term_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  level_id: z.string().uuid().optional(),
  curriculum_track: CurriculumTrackSchema.optional(),
});

export type SowScope = z.infer<typeof SowScopeSchema>;
