import { z } from 'zod';

// Zod schemas for the Evaluation Phase 2 checklist + responses + PTC
// feedback surfaces. Subject / level referenced by UUID per KD #4.

const uuid = z.string().uuid('Invalid id');

// POST /api/evaluation/checklist-items — subject teacher (for their assigned
// section + subject) OR registrar+ creates a topic. Scope shifted from
// (term × subject × level) to (term × subject × section) in migration 047
// so topic ownership matches what teachers actually cover per class.
export const ChecklistItemCreateSchema = z.object({
  termId: uuid,
  subjectId: uuid,
  sectionId: uuid,
  itemText: z
    .string()
    .trim()
    .min(1, 'Topic text required')
    .max(500, 'Keep it under 500 chars'),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type ChecklistItemCreateInput = z.infer<
  typeof ChecklistItemCreateSchema
>;

// POST /api/evaluation/checklist-items/copy-from — clone every topic from
// one of the teacher's other sections (same subject + term) into the
// current section. Idempotent — duplicate item_texts skipped at the unique
// constraint (term × subject × section × item_text per migration 047).
export const ChecklistItemCopySchema = z.object({
  sourceSection: uuid,
  targetSection: uuid,
  termId: uuid,
  subjectId: uuid,
});
export type ChecklistItemCopyInput = z.infer<typeof ChecklistItemCopySchema>;

// PATCH /api/evaluation/checklist-items/[id] — rename or reorder an item.
export const ChecklistItemUpdateSchema = z.object({
  itemText: z.string().trim().min(1, 'Item text required').max(500).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type ChecklistItemUpdateInput = z.infer<
  typeof ChecklistItemUpdateSchema
>;

// PATCH /api/evaluation/checklist-responses — subject teacher rates one
// student's proficiency on one item. Upsert on (term, student, item).
// `rating` is the 1–5 proficiency scale (migration 046); nullable so the
// client can clear a previously-set value.
export const ChecklistResponseUpsertSchema = z.object({
  termId: uuid,
  sectionId: uuid,
  studentId: uuid,
  checklistItemId: uuid,
  rating: z.number().int().min(1).max(5).nullable(),
});
export type ChecklistResponseUpsertInput = z.infer<
  typeof ChecklistResponseUpsertSchema
>;

// PATCH /api/evaluation/subject-comments — teacher per-subject comment
// per student per term. Upsert on (term, student, subject).
export const SubjectCommentUpsertSchema = z.object({
  termId: uuid,
  sectionId: uuid,
  studentId: uuid,
  subjectId: uuid,
  comment: z
    .string()
    .max(5000, 'Keep the comment under 5,000 chars')
    .nullable()
    .optional(),
});
export type SubjectCommentUpsertInput = z.infer<
  typeof SubjectCommentUpsertSchema
>;

// PATCH /api/evaluation/ptc-feedback — registrar/school_admin records
// parent feedback. Upsert on (term, student).
export const PtcFeedbackUpsertSchema = z.object({
  termId: uuid,
  sectionId: uuid,
  studentId: uuid,
  feedback: z
    .string()
    .max(10_000, 'Keep feedback under 10,000 chars')
    .nullable()
    .optional(),
});
export type PtcFeedbackUpsertInput = z.infer<typeof PtcFeedbackUpsertSchema>;
