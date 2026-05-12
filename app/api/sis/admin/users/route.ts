import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { InviteUserSchema } from '@/lib/schemas/user-admin';

// POST /api/sis/admin/users — provision a new staff user.
//
// Two modes (selected on the wire via `mode`):
//   - 'invite' (default): magic-link via Supabase Auth. The invitee signs
//     in once with the link, sets their own password through the standard
//     recovery flow. Role is assigned immediately on app_metadata.
//   - 'create': directly provisions an active account with the
//     superadmin-supplied password. `email_confirm: true` is set so the
//     account skips email verification entirely — useful for users who
//     can't receive the invite email (shared inboxes, on-premise
//     accounts, immediate-access needs).
//
// Superadmin only. If the email already exists, the route returns 409 —
// no silent re-invites or duplicate accounts.
export async function POST(request: NextRequest) {
  const auth = await requireRole(['superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = InviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const { email, role, displayName } = data;
  const mode = 'mode' in data && data.mode === 'create' ? 'create' : 'invite';

  const service = createServiceClient();

  // Pre-check for an existing user to give a clean 409 instead of a 500 from
  // the Auth layer's unique-email constraint.
  const { data: existing } = await service.auth.admin.listUsers({ perPage: 1000 });
  const alreadyExists = existing?.users.some(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (alreadyExists) {
    return NextResponse.json(
      { error: `A user with email ${email} already exists.` },
      { status: 409 },
    );
  }

  if (mode === 'create') {
    // Direct provisioning — bypass the magic-link verification flow.
    // `email_confirm: true` marks the email as already-verified so the
    // user can sign in immediately with the superadmin-set password.
    // app_metadata.role + user_metadata.display_name are set in the same
    // call (no follow-up updateUserById needed, unlike the invite path).
    const password = 'password' in data ? data.password : '';
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? 'user create failed' },
        { status: 500 },
      );
    }

    await logAction({
      service,
      actor: { id: auth.user.id, email: auth.user.email ?? null },
      action: 'user.create',
      entityType: 'user_account',
      entityId: created.user.id,
      context: { email, role, display_name: displayName ?? null, mode: 'create' },
    });

    return NextResponse.json({ ok: true, id: created.user.id, email, role, mode });
  }

  // mode === 'invite' — existing magic-link flow.
  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(
    email,
    {
      data: displayName ? { display_name: displayName } : undefined,
    },
  );
  if (inviteErr || !invited?.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? 'invite failed' },
      { status: 500 },
    );
  }

  // Set the role in app_metadata.role (the canonical location per KD #2).
  // The invite call above can't set app_metadata directly, so we follow up
  // with an update.
  const { error: updateErr } = await service.auth.admin.updateUserById(invited.user.id, {
    app_metadata: { role },
  });
  if (updateErr) {
    return NextResponse.json(
      { error: `invite sent, but role assignment failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'user.invite',
    entityType: 'user_account',
    entityId: invited.user.id,
    context: { email, role, display_name: displayName ?? null, mode: 'invite' },
  });

  return NextResponse.json({ ok: true, id: invited.user.id, email, role, mode });
}
