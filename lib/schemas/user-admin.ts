import { z } from 'zod';

// User-provisioning schemas for /sis/admin/users. Superadmin-only surface.
// `role` values match the `Role` union in lib/auth/roles.ts (KD #2). Kept
// as a literal zod enum here so the runtime value list doesn't drift from
// the type-level union — if you add a role, update both.

const RoleEnum = z.enum([
  'teacher',
  'registrar',
  'school_admin',
  'superadmin',
  'p-file',
  'admissions',
]);
export type AssignableRole = z.infer<typeof RoleEnum>;

// Two provisioning modes (selected by `mode` on the wire):
//
//   mode='invite' — sends a magic-link via Supabase Auth's
//     inviteUserByEmail. The invitee signs in once with the link, sets
//     their own password through the standard recovery flow. The role
//     is assigned immediately on app_metadata. This is the existing
//     flow.
//
//   mode='create' — directly provisions an active account via
//     auth.admin.createUser with `email_confirm: true`. The superadmin
//     sets the initial password upfront and shares it out-of-band
//     (Slack, in-person, etc.). The account skips email verification
//     entirely — useful for users who can't receive the invite email
//     (e.g. shared inboxes, on-premise accounts, or staff who need
//     immediate access without waiting for SMTP delivery).
const InviteModeSchema = z.object({
  mode: z.literal('invite').optional().default('invite'),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  role: RoleEnum,
  displayName: z.string().trim().max(120).optional(),
});

const CreateModeSchema = z.object({
  mode: z.literal('create'),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  role: RoleEnum,
  displayName: z.string().trim().max(120).optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'),
});

export const InviteUserSchema = z.union([CreateModeSchema, InviteModeSchema]);
export type InviteUserInput = z.infer<typeof InviteUserSchema>;

// PATCH /api/sis/admin/users/[id] — partial update. All fields optional.
// Passing `role: "x"` updates app_metadata.role; `disabled: true` bans the
// user indefinitely via `ban_duration`; `disabled: false` lifts the ban.
export const UpdateUserSchema = z
  .object({
    role: RoleEnum.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.disabled !== undefined, {
    message: 'At least one field (role or disabled) required',
  });
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
