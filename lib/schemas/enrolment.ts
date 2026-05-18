import { z } from 'zod';

// Per-enrolment metadata editor. PATCH /api/sections/[id]/students/[enrolmentId]
// Writes to `section_students.bus_no` and `section_students.classroom_officer_role`
// (added in migration 015) and optionally `enrollment_status` for status changes.
//
// Empty string → null, same pattern as SIS schemas.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable();

export const ENROLLMENT_STATUS_VALUES = [
  'active',
  'late_enrollee',
  'withdrawn',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUS_VALUES)[number];

export const WITHDRAWAL_REASON_MAX = 200;

export const EnrolmentMetadataSchema = z.object({
  bus_no: optionalText(40),
  classroom_officer_role: optionalText(80),
  enrollment_status: z.enum(ENROLLMENT_STATUS_VALUES).optional(),
  reason: optionalText(WITHDRAWAL_REASON_MAX).optional(),
});

export type EnrolmentMetadataInput = z.infer<typeof EnrolmentMetadataSchema>;

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: 'Active',
  late_enrollee: 'Late enrollee',
  withdrawn: 'Withdrawn',
};
