import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';

// POST /api/sis/admin/environment/topup
//
// Disabled while the admissions seeder is being validated. The populated
// seeder (grades, attendance, evaluations, etc.) is intentionally unused
// during this phase — the registrar drives those flows manually through
// the UI to verify end-to-end correctness before go-live.
//
// To re-seed test data: use the Reset + Switch flow on /sis/admin/settings.
//
// Superadmin only.
export async function POST() {
  const auth = await requireRole(['superadmin']);
  if ('error' in auth) return auth.error;

  const service = createServiceClient();

  const { data: currentRows } = await service
    .from('academic_years')
    .select('id, ay_code')
    .eq('is_current', true)
    .limit(1);
  const current = (currentRows ?? [])[0];

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'environment.topup',
    entityType: 'academic_year',
    entityId: current?.id ?? 'unknown',
    context: {
      ay_code: current?.ay_code ?? 'unknown',
      disabled: true,
      reason: 'Topup disabled while admissions seeder is being validated.',
    },
  });

  return new NextResponse(
    JSON.stringify({
      error:
        'Topup disabled while admissions seeder is being validated. Use the Reset + Switch flow to re-seed.',
    }),
    { status: 410, headers: { 'content-type': 'application/json' } }
  );
}
