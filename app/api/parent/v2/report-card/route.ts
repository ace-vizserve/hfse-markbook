import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAllStudentsByParentEmail } from '@/lib/supabase/admissions';
import { buildReportCard } from '@/lib/report-card/build-report-card';

// GET /api/parent/v2/report-card?studentId=<uuid>&termNumber=<1|2|3|4>
//
// Called by the admissions portal SPA. Validates Bearer token, confirms
// parent → student linkage, checks an active publication window for the
// requested term, then returns the full ReportCardPayload as JSON.
//
// termNumber is optional — if omitted the payload still returns all terms
// and the client picks which to display.

function getAllowedOrigin() {
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:5173';
  }
  return process.env.ADMISSIONS_PORTAL_ORIGIN ?? '';
}

function corsHeaders(origin: string | null) {
  const allowed = getAllowedOrigin();
  const expose = origin === allowed ? allowed : allowed;
  return {
    'Access-Control-Allow-Origin': expose,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);
  const url = new URL(request.url);

  const studentId = url.searchParams.get('studentId') ?? '';
  const termNumberRaw = url.searchParams.get('termNumber');
  const termNumber = termNumberRaw ? parseInt(termNumberRaw, 10) : null;

  if (!studentId) {
    return NextResponse.json({ error: 'missing studentId' }, { status: 400, headers: cors });
  }

  // 1. Verify Bearer token.
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'missing Bearer token' }, { status: 401, headers: cors });
  }

  const service = createServiceClient();
  const { data: userData, error: authError } = await service.auth.getUser(token);
  if (authError || !userData.user?.email) {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 401, headers: cors });
  }
  const email = userData.user.email.trim().toLowerCase();

  // 2. Resolve the requested student and confirm they belong to this parent.
  const { data: studentRow } = await service
    .from('students')
    .select('id, student_number')
    .eq('id', studentId)
    .single();
  if (!studentRow) {
    return NextResponse.json({ error: 'student not found' }, { status: 404, headers: cors });
  }

  const admissionsRows = await getAllStudentsByParentEmail(email);
  const linked = admissionsRows.some(
    (r) => r.student_number === (studentRow as { student_number: string }).student_number,
  );
  if (!linked) {
    return NextResponse.json({ error: 'not authorised for this student' }, { status: 403, headers: cors });
  }

  // 3. Check that a currently-active publication window exists for the
  //    requested term (or any term when termNumber is omitted).
  const { data: enrolment } = await service
    .from('section_students')
    .select('section_id')
    .eq('student_id', studentId)
    .not('enrollment_status', 'in', '("withdrawn")')
    .limit(1)
    .single();
  if (!enrolment) {
    return NextResponse.json({ error: 'student is not enrolled' }, { status: 403, headers: cors });
  }

  const now = new Date().toISOString();
  let pubQuery = service
    .from('report_card_publications')
    .select('id, term_id, terms!inner(term_number)')
    .eq('section_id', (enrolment as { section_id: string }).section_id)
    .lte('publish_from', now)
    .gte('publish_until', now);
  if (termNumber !== null) {
    pubQuery = pubQuery.eq('terms.term_number', termNumber);
  }
  const { data: activePub } = await pubQuery.limit(1).single();
  if (!activePub) {
    return NextResponse.json(
      { error: 'no active publication window for this term' },
      { status: 403, headers: cors },
    );
  }

  // 4. Build the report card payload (same function used by the SIS UI).
  const result = await buildReportCard(service, studentId);
  if (!result.ok) {
    const status =
      result.error.kind === 'student_not_found' || result.error.kind === 'level_not_found'
        ? 404
        : 422;
    return NextResponse.json({ error: result.error.kind }, { status, headers: cors });
  }

  // 5. If a specific term was requested, filter subjects/attendance/comments
  //    to that term so the payload is smaller and the client doesn't need to
  //    filter client-side.
  let payload = result.payload;
  if (termNumber !== null) {
    const term = payload.terms.find((t) => t.term_number === termNumber);
    if (term) {
      payload = {
        ...payload,
        terms: [term],
        attendance: payload.attendance.filter((a) => a.term_id === term.id),
        comments: payload.comments.filter((c) => c.term_id === term.id),
      };
    }
  }

  return NextResponse.json({ payload }, { headers: cors });
}
