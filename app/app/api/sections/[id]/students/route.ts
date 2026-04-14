import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// Roster for a single section — ordered by index number (immutable).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const supabase = await createClient();

  const { data: section, error: secErr } = await supabase
    .from('sections')
    .select('id, name, level:levels(code, label)')
    .eq('id', id)
    .single();
  if (secErr || !section) {
    return NextResponse.json({ error: 'section not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('section_students')
    .select(
      'id, index_number, enrollment_status, enrollment_date, withdrawal_date, student:students(id, student_number, last_name, first_name, middle_name)',
    )
    .eq('section_id', id)
    .order('index_number');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ section, students: data ?? [] });
}

// Manually add a student to a section (fallback when admissions data is missing).
// Upserts the student row by student_number, then inserts an enrolment with
// the next available index.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sectionId } = await params;
  const body = await request.json().catch(() => null) as
    | {
        student_number?: string;
        last_name?: string;
        first_name?: string;
        middle_name?: string | null;
        enrollment_status?: 'active' | 'late_enrollee';
      }
    | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const student_number = body.student_number?.trim();
  const last_name = body.last_name?.trim();
  const first_name = body.first_name?.trim();
  if (!student_number || !last_name || !first_name) {
    return NextResponse.json(
      { error: 'student_number, last_name, first_name are required' },
      { status: 400 },
    );
  }
  const middle_name = body.middle_name?.trim() || null;
  const enrollment_status = body.enrollment_status === 'late_enrollee' ? 'late_enrollee' : 'active';

  const service = createServiceClient();

  // Verify section exists.
  const { data: section, error: secErr } = await service
    .from('sections')
    .select('id')
    .eq('id', sectionId)
    .single();
  if (secErr || !section) return NextResponse.json({ error: 'section not found' }, { status: 404 });

  // Upsert student by student_number.
  let studentId: string;
  const { data: existing, error: exErr } = await service
    .from('students')
    .select('id')
    .eq('student_number', student_number)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  if (existing) {
    studentId = existing.id;
    const { error } = await service
      .from('students')
      .update({ last_name, first_name, middle_name, updated_at: new Date().toISOString() })
      .eq('id', studentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: inserted, error } = await service
      .from('students')
      .insert({ student_number, last_name, first_name, middle_name })
      .select('id')
      .single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
    studentId = inserted.id;
  }

  // Already enrolled? Reject to avoid double-enrolment.
  const { data: enrolCheck } = await service
    .from('section_students')
    .select('id, enrollment_status')
    .eq('section_id', sectionId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (enrolCheck) {
    return NextResponse.json(
      { error: `already enrolled in this section (status: ${enrolCheck.enrollment_status})` },
      { status: 409 },
    );
  }

  // Next available index for this section (append-only).
  const { data: maxRow } = await service
    .from('section_students')
    .select('index_number')
    .eq('section_id', sectionId)
    .order('index_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (maxRow?.index_number ?? 0) + 1;

  const { error: enrErr } = await service.from('section_students').insert({
    section_id: sectionId,
    student_id: studentId,
    index_number: nextIndex,
    enrollment_status,
    enrollment_date: new Date().toISOString().slice(0, 10),
  });
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });

  return NextResponse.json({ success: true, student_id: studentId, index_number: nextIndex });
}
