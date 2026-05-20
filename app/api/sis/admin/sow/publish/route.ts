import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { SowPublishSchema } from '@/lib/schemas/sow';
import { getMasterById } from '@/lib/sis/sow/queries';
import { publishVersion } from '@/lib/sis/sow/mutations';
import { logAction } from '@/lib/audit/log-action';

// POST /api/sis/admin/sow/publish — freeze a master template into an immutable version snapshot
export async function POST(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = SowPublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { master_id, notes } = parsed.data;

  // Verify master exists
  const master = await getMasterById(master_id);
  if (!master) {
    return NextResponse.json({ error: 'master template not found' }, { status: 404 });
  }

  const { data: version, error } = await publishVersion(master_id, notes, auth.user.id);
  if (error || !version) {
    return NextResponse.json({ error: error ?? 'publish failed' }, { status: 500 });
  }

  const service = createServiceClient();
  await logAction({
    service,
    actor: auth.user,
    action: 'sow.version.publish',
    entityType: 'sow_published_version',
    entityId: version.id,
    context: {
      master_id,
      version_number: version.version_number,
      curriculum_track: master.curriculum_track,
      topics_count: (master.topics as unknown[]).length,
    },
  });

  return NextResponse.json({ ok: true, version });
}
