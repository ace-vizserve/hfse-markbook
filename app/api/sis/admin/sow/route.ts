import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { SowMasterUpsertSchema, SowScopeSchema } from '@/lib/schemas/sow';
import { getMasterTemplate, getPublishedVersions } from '@/lib/sis/sow/queries';
import { upsertMaster } from '@/lib/sis/sow/mutations';
import { logAction } from '@/lib/audit/log-action';

// GET /api/sis/admin/sow?ay_id=&term_id=&subject_id=&level_id=&curriculum_track=
// Returns the master template + published version history for a given scope.
export async function GET(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = SowScopeSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query params', issues: parsed.error.issues }, { status: 400 });
  }

  const { ay_id, term_id, subject_id, level_id, curriculum_track } = parsed.data;

  // If all scope params are present, return master + versions + slot limits
  if (ay_id && term_id && subject_id && level_id && curriculum_track) {
    const service = createServiceClient();
    const [master, configRes] = await Promise.all([
      getMasterTemplate(ay_id, term_id, subject_id, level_id, curriculum_track),
      service
        .from('subject_configs')
        .select('ww_max_slots, pt_max_slots')
        .eq('academic_year_id', ay_id)
        .eq('subject_id', subject_id)
        .eq('level_id', level_id)
        .maybeSingle(),
    ]);
    const versions = master ? await getPublishedVersions(master.id) : [];
    const slotLimits = {
      ww: (configRes.data as { ww_max_slots?: number } | null)?.ww_max_slots ?? 5,
      pt: (configRes.data as { pt_max_slots?: number } | null)?.pt_max_slots ?? 5,
    };
    return NextResponse.json({ master, versions, slotLimits });
  }

  // Without full scope, return an empty payload so the builder can initialise
  return NextResponse.json({ master: null, versions: [] });
}

// PUT /api/sis/admin/sow — upsert a master template (save draft)
export async function PUT(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = SowMasterUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await upsertMaster(parsed.data, auth.user.id);
  if (error || !data) {
    return NextResponse.json({ error: error ?? 'upsert failed' }, { status: 500 });
  }

  const service = createServiceClient();
  await logAction({
    service,
    actor: auth.user,
    action: 'sow.master.upsert',
    entityType: 'sow_master_template',
    entityId: data.id,
    context: {
      ay_id: parsed.data.ay_id,
      term_id: parsed.data.term_id,
      subject_id: parsed.data.subject_id,
      level_id: parsed.data.level_id,
      curriculum_track: parsed.data.curriculum_track,
      topics_count: parsed.data.topics.length,
    },
  });

  return NextResponse.json({ ok: true, master: data });
}
