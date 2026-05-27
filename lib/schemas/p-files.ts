import { z } from 'zod';
import { DOCUMENT_SLOTS } from '@/lib/p-files/document-config';
import { MODULE_VALUES } from '@/lib/p-files/_shared';

const SlotKeyEnum = z.enum(
  DOCUMENT_SLOTS.map((s) => s.key) as [string, ...string[]]
);

export const NotifySchema = z.object({
  slotKey: SlotKeyEnum,
  module: z.enum(MODULE_VALUES).optional(),
});

export const PromiseSchema = z.object({
  slotKey: SlotKeyEnum,
  promisedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  module: z.enum(MODULE_VALUES).optional(),
});

export const BulkNotifySchema = z.object({
  items: z
    .array(
      z.object({
        enroleeNumber: z.string().min(1).max(20),
        slotKey: SlotKeyEnum,
      })
    )
    .min(1)
    .max(50),
  module: z.enum(MODULE_VALUES).optional(),
});
