import { z } from 'zod';

// Catalog-level subject CRUD. The subjects table itself is small (a
// catalog of roughly 10–20 subjects per HFSE). Adding a new subject is
// rare — once-per-AY-rollover at most — but doing it via SQL was a
// bottleneck for the AY-rollover workflow.
//
// Code is uppercase + length-bounded + restricted to A-Z 0-9 _ - so the
// existing seed convention (MATH, ENG, FIL, RIZAL, etc.) holds. The route
// uppercases inbound code defensively (the regex passes only uppercase
// already, but a safety net trims user-typed lowercase).

export const SubjectCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code required')
    .max(32, 'Keep code under 32 chars')
    .regex(/^[A-Z0-9_-]+$/, 'Code must be uppercase letters, digits, underscore, or hyphen'),
  name: z.string().trim().min(1, 'Name required').max(128, 'Keep name under 128 chars'),
  is_examinable: z.boolean(),
});
export type SubjectCreateInput = z.infer<typeof SubjectCreateSchema>;
