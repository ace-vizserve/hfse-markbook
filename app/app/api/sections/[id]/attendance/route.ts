import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// GET /api/sections/[id]/attendance?term_id=...
// Returns one row per enrolment in the section with the attendance record for
// the given term (null fields if none yet). Defaults to the current term.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id: sectionId } = await params;
  const supabase = await createClient();
  let termId = request.nextUrl.searchParams.get('term_id');
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
      'id, index_number, enrollment_status, student:students(student_number, last_name, first_name, middle_name)',
    )
    .eq('section_id', sectionId)
    .order('index_number');
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });

  const enrolmentIds = (enrolments ?? []).map(e => e.id);
  const { data: records } = enrolmentIds.length > 0
    ? await supabase
        .from('attendance_records')
        .select('section_student_id, school_days, days_present, days_late')
        .eq('term_id', termId)
        .in('section_student_id', enrolmentIds)
    : { data: [] };

  const byEnrolment = new Map((records ?? []).map(r => [r.section_student_id, r]));

  return NextResponse.json({
    term_id: termId,
    rows: (enrolments ?? []).map(e => {
      const rec = byEnrolment.get(e.id);
      return {
        enrolment_id: e.id,
        index_number: e.index_number,
        enrollment_status: e.enrollment_status,
        student: Array.isArray(e.student) ? e.student[0] : e.student,
        school_days: rec?.school_days ?? null,
        days_present: rec?.days_present ?? null,
        days_late: rec?.days_late ?? null,
      };
    }),
  });
}

// PUT /api/sections/[id]/attendance
// Body: { term_id, section_student_id, school_days, days_present, days_late }
// Upserts on (term_id, section_student_id). Registrar+ only.
export async function PUT(request: NextRequest) {
  const auth = await requireRole(['registrar', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | {
        term_id?: string;
        section_student_id?: string;
        school_days?: number | null;
        days_present?: number | null;
        days_late?: number | null;
      }
    | null;
  if (!body?.term_id || !body.section_student_id) {
    return NextResponse.json(
      { error: 'term_id and section_student_id are required' },
      { status: 400 },
    );
  }
  const norm = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };

  const service = createServiceClient();
  const { error } = await service.from('attendance_records').upsert(
    {
      term_id: body.term_id,
      section_student_id: body.section_student_id,
      school_days: norm(body.school_days),
      days_present: norm(body.days_present),
      days_late: norm(body.days_late),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'term_id,section_student_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
