import { z } from 'zod';

export const EnvironmentSwitchSchema = z.object({
  target: z.enum(['production', 'test']),
  // Optional explicit non-test AY to switch INTO when target === 'production'.
  // Lets the user pick which prod AY becomes current when more than one exists
  // (e.g. AY2025 / AY2026 / AY2027 — historical / current / early-bird). When
  // omitted, the lib falls back to the legacy default-pick logic.
  ay_code: z
    .string()
    .regex(/^AY[0-9]{4}$/, 'ay_code must match ^AY[0-9]{4}$')
    .optional(),
});
export type EnvironmentSwitchInput = z.infer<typeof EnvironmentSwitchSchema>;
