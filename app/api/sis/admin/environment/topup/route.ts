import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { seedPopulated } from '@/lib/sis/seeder/populated';
import { createServiceClient } from '@/lib/supabase/service';

// POST /api/sis/admin/environment/topup
//
// Re-runs `seedPopulated` against the currently-active test AY (must match
// `^AY9`) WITHOUT wiping anything. Used after merging new seeder code (e.g.
// the seedEnrollmentStatusMix + seedChangeRequests demo-extras passes) to
// patch the existing test environment in place without losing the demo
// state that's already been hand-crafted.
//
// Every step inside seedPopulated is idempotent (skip-guards on natural
// keys), so this is safe to call repeatedly. Re-runs add only what's
// missing; existing rows are untouched.
//
// Refuses if the current AY isn't a test AY — production seeding is not
// the responsibility of this surface.
//
// Superadmin only.
export async function POST() {
  const auth = await requireRole(['superadmin']);
  if ('error' in auth) return auth.error;

  const service = createServiceClient();

  // Resolve the active AY. Top-up only operates against a `^AY9` test AY.
  const { data: currentRows, error: currentErr } = await service
    .from('academic_years')
    .select('id, ay_code')
    .eq('is_current', true)
    .limit(1);
  if (currentErr) {
    return NextResponse.json({ error: currentErr.message }, { status: 500 });
  }
  const current = (currentRows ?? [])[0];
  if (!current) {
    return NextResponse.json(
      { error: 'No current academic year. Switch to Test first.' },
      { status: 400 },
    );
  }
  if (!/^AY9/.test(current.ay_code)) {
    return NextResponse.json(
      {
        error: `Top-up only operates on a test AY (^AY9). Current AY is ${current.ay_code} — switch to Test first.`,
      },
      { status: 400 },
    );
  }

  try {
    const populated = await seedPopulated(service, current);

    await logAction({
      service,
      actor: { id: auth.user.id, email: auth.user.email ?? null },
      action: 'environment.topup',
      entityType: 'academic_year',
      entityId: current.id,
      context: {
        ay_code: current.ay_code,
        populated,
      },
    });

    revalidatePath('/', 'layout');

    return NextResponse.json({
      ok: true,
      ayCode: current.ay_code,
      populated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'top-up failed';
    console.error('[environment topup] failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
