import { z } from 'zod';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SlotMetaSchema = z.object({
  label: z.string().max(120).nullable().optional(),
  date: z
    .string()
    .refine((v) => ISO_DATE_RE.test(v), { message: 'must be YYYY-MM-DD' })
    .nullable()
    .optional(),
  page: z.string().max(40).nullable().optional(),
});

export type SlotMeta = z.infer<typeof SlotMetaSchema>;

export const SlotLabelsSchema = z.object({
  ww: z.array(SlotMetaSchema.nullable()).optional(),
  pt: z.array(SlotMetaSchema.nullable()).optional(),
  qa: z.string().max(120).nullable().optional(),
});

export type SlotLabels = z.infer<typeof SlotLabelsSchema>;

// SOW-sourced descriptor — label + page only (no date; date is teacher-entered)
export const SowSlotDescriptorSchema = z.object({
  label: z.string().max(120).nullable().optional(),
  page: z.string().max(40).nullable().optional(),
});

export type SowSlotDescriptor = z.infer<typeof SowSlotDescriptorSchema>;

export const SlotMetaPatchSchema = z.object({
  ww: z.array(SlotMetaSchema.nullable()).optional(),
  pt: z.array(SlotMetaSchema.nullable()).optional(),
  qa: z.string().max(120).nullable().optional(),
});

export type SlotMetaPatch = z.infer<typeof SlotMetaPatchSchema>;
