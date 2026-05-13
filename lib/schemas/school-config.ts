import { z } from 'zod';

// PATCH /api/sis/admin/school-config
//
// Singleton settings row (id=1). Superadmin only. All fields optional so
// registrar can update one at a time; empty strings are valid (cleared).
export const SchoolConfigUpdateSchema = z.object({
  principalName: z
    .string()
    .trim()
    .max(120, 'Keep it under 120 chars')
    .optional(),
  ceoName: z
    .string()
    .trim()
    .max(120, 'Keep it under 120 chars')
    .optional(),
  peiRegistrationNumber: z
    .string()
    .trim()
    .max(64, 'Keep it under 64 chars')
    .optional(),
  defaultPublishWindowDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional(),
  // KD #94 — school-wide defaults for attendance leave quotas. Per-student
  // overrides live on `students.urgent_compassionate_allowance` and
  // `students.vacation_leave_allowance_per_term`.
  defaultCompassionateAllowancePerYear: z
    .number()
    .int()
    .min(0)
    .max(30)
    .optional(),
  defaultVlAllowancePerTerm: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional(),
  // KD #95 — Subject Award + Overall Academic Award thresholds. Cross-column
  // ordering (bronze < silver < gold ≤ max) is enforced both client-side here
  // and via a CHECK constraint in migration 049. Allows fractional values
  // (HFSE's defaults are 88.5 / 91.5 / 95.5 / 100).
  subjectAwardBronzeMin: z.number().min(0).max(100).optional(),
  subjectAwardSilverMin: z.number().min(0).max(100).optional(),
  subjectAwardGoldMin: z.number().min(0).max(100).optional(),
  subjectAwardMax: z.number().min(0).max(100).optional(),
});

export type SchoolConfigUpdateInput = z.infer<typeof SchoolConfigUpdateSchema>;
