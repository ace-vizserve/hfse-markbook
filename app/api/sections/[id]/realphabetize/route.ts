import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { invalidateAllOperationalDrills } from '@/lib/cache/invalidate-drill-tags';

// POST /api/sections/[id]/realphabetize — re-assigns section_students.index_number
// 1..N alphabetically by (last_name, first_name, middle_name). Active +
// late_enrollee rows first, then withdrawn rows at the bottom. Pain point #9.
//
// Audit action: `section.realphabetize` with before/after snapshots in context.
// Idempotent: running on an already-alphabetical section is a no-op semantically
// (rows_renumbered will still equal N because every UPDATE touches every row,
// but the resulting indexes match the prior state).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'section id required' }, { status: 400 });
  }

  const service = createServiceClient();

  // Resolve section + AY for the audit context + drill cache invalidation.
  const { data: section, error: sectionErr } = await service
    .from('sections')
    .select(
      'id, name, academic_year_id, academic_year:academic_years!inner(ay_code)'
    )
    .eq('id', id)
    .maybeSingle();
  if (sectionErr) {
    return NextResponse.json({ error: sectionErr.message }, { status: 500 });
  }
  if (!section) {
    return NextResponse.json({ error: 'section not found' }, { status: 404 });
  }
  const ayCode = section.academic_year as
    | { ay_code: string }
    | { ay_code: string }[]
    | null;
  const ayCodeStr = Array.isArray(ayCode)
    ? ayCode[0]?.ay_code
    : ayCode?.ay_code;

  // Run the RPC. Returns { rows_renumbered, before, after }.
  const { data: result, error: rpcErr } = await service.rpc(
    'realphabetize_section_index_numbers',
    { p_section_id: id }
  );
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const { rows_renumbered, before, after } = (result ?? {
    rows_renumbered: 0,
    before: [],
    after: [],
  }) as {
    rows_renumbered: number;
    before: unknown[];
    after: unknown[];
  };

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'section.realphabetize',
    entityType: 'section',
    entityId: id,
    context: {
      academic_year_id: section.academic_year_id,
      section_name: section.name,
      rows_renumbered,
      before,
      after,
    },
  });

  // Invalidate drill caches across all operational modules — every drill that
  // references a student in this section may have stale ordering.
  if (ayCodeStr) {
    await invalidateAllOperationalDrills(ayCodeStr);
  }

  return NextResponse.json({ ok: true, rows_renumbered });
}
