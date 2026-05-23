import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction } from '@/lib/audit/log-action';
import { z } from 'zod';
import { CURRICULUM_TRACKS } from '@/lib/schemas/section';

const AddScopeSchema = z.object({
  level_id: z.string().uuid(),
  curriculum_track: z.enum(CURRICULUM_TRACKS),
  subject_id: z.string().uuid(),
});

const RemoveScopeSchema = z.object({
  level_id: z.string().uuid(),
  curriculum_track: z.enum(CURRICULUM_TRACKS),
  subject_id: z.string().uuid(),
});

// GET /api/sis/admin/sow/scopes
// Returns all subject scope entries grouped for display.
export async function GET() {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const service = createServiceClient();
  const { data, error } = await service
    .from('sow_subject_scopes')
    .select('id, level_id, curriculum_track, subject_id, sort_order')
    .order('sort_order');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scopes: data ?? [] });
}

// POST /api/sis/admin/sow/scopes — add a subject to a scope
export async function POST(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = AddScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { level_id, curriculum_track, subject_id } = parsed.data;
  const service = createServiceClient();

  const { data: maxRow } = await service
    .from('sow_subject_scopes')
    .select('sort_order')
    .eq('level_id', level_id)
    .eq('curriculum_track', curriculum_track)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await service
    .from('sow_subject_scopes')
    .insert({ level_id, curriculum_track, subject_id, sort_order: nextOrder })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'subject already in scope' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction({
    service,
    actor: auth.user,
    action: 'sow.scope.add',
    entityType: 'sow_subject_scope',
    entityId: (data as { id: string }).id,
    context: { level_id, curriculum_track, subject_id },
  });

  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

// DELETE /api/sis/admin/sow/scopes — remove a subject from a scope
export async function DELETE(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = RemoveScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const { level_id, curriculum_track, subject_id } = parsed.data;
  const service = createServiceClient();

  const { error } = await service
    .from('sow_subject_scopes')
    .delete()
    .eq('level_id', level_id)
    .eq('curriculum_track', curriculum_track)
    .eq('subject_id', subject_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction({
    service,
    actor: auth.user,
    action: 'sow.scope.remove',
    entityType: 'sow_subject_scope',
    context: { level_id, curriculum_track, subject_id },
  });

  return NextResponse.json({ ok: true });
}
