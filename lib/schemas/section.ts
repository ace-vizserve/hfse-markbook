import { z } from 'zod';

// POST /api/sections — create a new section under the current AY.
//
// Scope: mid-year additions (e.g. a late transfer needs a new homeroom).
// AY rollover still happens via `create_academic_year` (copy-forward from
// prior AY). Uniqueness constraint: (academic_year_id, level_id, name) —
// API surfaces a friendly 409 on conflict.

export const SECTION_CLASS_TYPES = ['Global', 'Standard'] as const;
export type SectionClassType = (typeof SECTION_CLASS_TYPES)[number];

export const CURRICULUM_TRACKS = ['cambridge', 'o_level', 'singapore_inspired'] as const;
export type CurriculumTrack = (typeof CURRICULUM_TRACKS)[number];

export const CURRICULUM_TRACK_LABELS: Record<CurriculumTrack, string> = {
  cambridge: 'Cambridge',
  o_level: 'O-Level',
  singapore_inspired: 'Singapore-Inspired',
};

const uuidString = z.string().uuid('Invalid id');

export const SectionCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(60, 'Keep it under 60 chars'),
  level_id: uuidString,
  class_type: z.enum(SECTION_CLASS_TYPES).nullable().optional(),
});

export type SectionCreateInput = z.infer<typeof SectionCreateSchema>;

// PATCH /api/sections/[id] — rename and/or change curriculum track.
// `level_id` and `academic_year_id` are load-bearing joins and can't be
// edited without cascade concerns; class_type is set at creation for now.
// Both fields are optional — callers may send one or both.
export const SectionUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(60, 'Keep it under 60 chars').optional(),
  curriculum_track: z.enum(CURRICULUM_TRACKS).optional(),
});

export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
