import { NextResponse, type NextRequest } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';
import { SectionUpdateSchema } from '@/lib/schemas/section';

// PATCH /api/sections/[id] — rename and/or change curriculum track.
// Fires `section.rename` and/or `section.curriculum_track.update` audit
// actions — only for fields that actually changed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'section id required' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = SectionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, curriculum_track } = parsed.data;

  if (name === undefined && curriculum_track === undefined) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: before, error: beforeErr } = await service
    .from('sections')
    .select('id, name, curriculum_track, academic_year_id, level_id')
    .eq('id', id)
    .maybeSingle();
  if (beforeErr) {
    return NextResponse.json({ error: beforeErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'section not found' }, { status: 404 });
  }

  const nameChanged = name !== undefined && name !== before.name;
  const trackChanged = curriculum_track !== undefined && curriculum_track !== before.curriculum_track;

  if (!nameChanged && !trackChanged) {
    return NextResponse.json({
      ok: true,
      id: before.id,
      name: before.name,
      curriculum_track: before.curriculum_track,
      unchanged: true,
    });
  }

  const patch: Record<string, string> = {};
  if (nameChanged) patch.name = name!;
  if (trackChanged) patch.curriculum_track = curriculum_track!;

  const { data: updated, error: updateErr } = await service
    .from('sections')
    .update(patch)
    .eq('id', id)
    .select('id, name, curriculum_track')
    .single();

  if (updateErr) {
    // 23505 = unique_violation (academic_year_id, level_id, curriculum_track, name)
    if ((updateErr as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: `A section named "${name}" already exists in this level and track for the current AY.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const actor = { id: auth.user.id, email: auth.user.email ?? null };
  const sharedCtx = { academic_year_id: before.academic_year_id, level_id: before.level_id };

  if (nameChanged) {
    await logAction({
      service,
      actor,
      action: 'section.rename',
      entityType: 'section',
      entityId: id,
      context: { ...sharedCtx, from: before.name, to: name! },
    });
  }

  if (trackChanged) {
    await logAction({
      service,
      actor,
      action: 'section.curriculum_track.update',
      entityType: 'section',
      entityId: id,
      context: { ...sharedCtx, from: before.curriculum_track, to: curriculum_track! },
    });
  }

  return NextResponse.json({
    ok: true,
    id: updated.id,
    name: updated.name,
    curriculum_track: updated.curriculum_track,
  });
}
