import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/grading-sheets/[id]/labels
// Updates the slot_labels on a grading sheet. No lock enforcement — labels
// are activity descriptions (display metadata), not grade values.
// Teachers may only label their own sheet; registrar+ may label any sheet.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    ww?: (string | null)[];
    pt?: (string | null)[];
    qa?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const isManager = auth.role === 'registrar' || auth.role === 'school_admin' || auth.role === 'superadmin';

  const service = createServiceClient();

  // For teachers, verify they own the sheet (teacher_assignments subject_teacher).
  if (!isManager) {
    const supabase = await createClient();
    const { data: sheetRaw } = await supabase
      .from('grading_sheets')
      .select('id, section:sections(id), subject:subjects(id)')
      .eq('id', id)
      .single();
    if (!sheetRaw) {
      return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
    }
    type IdRow = { id: string } | { id: string }[] | null;
    const sheet = sheetRaw as unknown as { section: IdRow; subject: IdRow };
    const sectionRaw = Array.isArray(sheet.section) ? sheet.section[0] : sheet.section;
    const subjectRaw = Array.isArray(sheet.subject) ? sheet.subject[0] : sheet.subject;
    // Check teacher has a subject_teacher assignment for this sheet.
    const sectionId = sectionRaw?.id;
    const subjectId = subjectRaw?.id;
    if (!sectionId || !subjectId) {
      return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
    }
    const { data: assignment } = await supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', auth.user.id)
      .eq('section_id', sectionId)
      .eq('subject_id', subjectId)
      .eq('role', 'subject_teacher')
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: 'not assigned to this sheet' }, { status: 403 });
    }
  }

  // Sanitize: trim strings, coerce empty to null.
  const sanitize = (v: string | null | undefined): string | null => {
    if (v == null) return null;
    const t = String(v).trim().slice(0, 120);
    return t || null;
  };

  const newLabels: Record<string, unknown> = {};
  if ('ww' in body) newLabels.ww = (body.ww ?? []).map(sanitize);
  if ('pt' in body) newLabels.pt = (body.pt ?? []).map(sanitize);
  if ('qa' in body) newLabels.qa = sanitize(body.qa);

  // Merge with existing labels so a ww update doesn't wipe pt labels.
  const { data: existing } = await service
    .from('grading_sheets')
    .select('slot_labels')
    .eq('id', id)
    .single();
  if (!existing) {
    return NextResponse.json({ error: 'sheet not found' }, { status: 404 });
  }

  const merged = { ...(existing.slot_labels as Record<string, unknown> ?? {}), ...newLabels };

  const { error } = await service
    .from('grading_sheets')
    .update({ slot_labels: merged })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slot_labels: merged });
}
