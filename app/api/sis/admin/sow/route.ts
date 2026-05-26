import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { getSowReviewRows } from '@/lib/sis/sow/queries';

// GET /api/sis/admin/sow?termId=&subjectId=&ayCode=
// Returns one review row per section showing the teacher-authored SOW content.
// Read-only coordinator view.
export async function GET(request: NextRequest) {
  const auth = await requireRole(['school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get('termId');
  const subjectId = searchParams.get('subjectId');
  const ayCode = searchParams.get('ayCode');

  if (!termId || !subjectId || !ayCode) {
    return NextResponse.json(
      { error: 'termId, subjectId, and ayCode are required' },
      { status: 400 },
    );
  }

  const rows = await getSowReviewRows(termId, subjectId, ayCode);
  return NextResponse.json(rows);
}
