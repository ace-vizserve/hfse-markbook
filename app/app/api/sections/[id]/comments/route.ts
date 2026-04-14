import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { getUserRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { loadAssignmentsForUser, isFormAdviser } from '@/lib/auth/teacher-assignments';

// GET /api/sections/[id]/comments?term_id=...
// Returns one row per active student in the section, with their comment for
// the given term (null if none written yet). Defaults to the current term.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sectionId } = await params;
  const supabase = await createClient();
  const termIdParam = request.nextUrl.searchParams.get('term_id');
  let termId = termIdParam;
  if (!termId) {
    const { data: term } = await supabase
      .from('terms').select('id').eq('is_current', true).maybeSingle();
    termId = term?.id ?? null;
  }
  if (!termId) {
    return NextResponse.json({ error: 'no term_id given and no current term set' }, { status: 400 });
  }

  const { data: enrolments, error: enrErr } = await supabase
    .from('section_students')
    .select(
      'id, index_number, enrollment_status, student:students(id, student_number, last_name, first_name, middle_name)',
    )
    .eq('section_id', sectionId)
    .order('index_number');
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });

  const studentIds = (enrolments ?? [])
    .map(e => {
      const s = Array.isArray(e.student) ? e.student[0] : e.student;
      return s?.id;
    })
    .filter((x): x is string => !!x);

  const { data: comments, error: comErr } = studentIds.length > 0
    ? await supabase
        .from('report_card_comments')
        .select('id, student_id, comment')
        .eq('term_id', termId)
        .eq('section_id', sectionId)
        .in('student_id', studentIds)
    : { data: [], error: null };
  if (comErr) return NextResponse.json({ error: comErr.message }, { status: 500 });

  const byStudent = new Map((comments ?? []).map(c => [c.student_id, c]));

  return NextResponse.json({
    term_id: termId,
    rows: (enrolments ?? []).map(e => {
      const s = Array.isArray(e.student) ? e.student[0] : e.student;
      const c = s ? byStudent.get(s.id) : undefined;
      return {
        enrolment_id: e.id,
        index_number: e.index_number,
        enrollment_status: e.enrollment_status,
        student: s,
        comment: c?.comment ?? null,
      };
    }),
  });
}

// PUT /api/sections/[id]/comments
// Body: { term_id, student_id, comment }
// Upserts one comment on the unique (term_id, section_id, student_id) tuple.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sectionId } = await params;
  const role = getUserRole(auth.user);

  // Teachers can only write comments for sections where they are the form
  // adviser. Registrar / admin / superadmin can write for any section.
  if (role === 'teacher') {
    const supabase = await createClient();
    const assignments = await loadAssignmentsForUser(supabase, auth.user.id);
    if (!isFormAdviser(assignments, sectionId)) {
      return NextResponse.json(
        { error: 'only the form class adviser of this section can write comments' },
        { status: 403 },
      );
    }
  }

  const body = (await request.json().catch(() => null)) as
    | { term_id?: string; student_id?: string; comment?: string | null }
    | null;
  if (!body?.term_id || !body.student_id) {
    return NextResponse.json({ error: 'term_id and student_id are required' }, { status: 400 });
  }
  const comment = (body.comment ?? '').toString().trim() || null;

  const service = createServiceClient();
  const { error } = await service
    .from('report_card_comments')
    .upsert(
      {
        term_id: body.term_id,
        section_id: sectionId,
        student_id: body.student_id,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'term_id,section_id,student_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
