import { NextResponse } from 'next/server';

// POST /api/evaluation/checklist-items/copy-from — deprecated.
//
// The teacher-owned "copy topics from another section" feature was removed when
// evaluation topics were reverted to admin-prescribed scope (KD #107). Topics
// are now defined once per (subject × level × curriculum_track × term) in the
// Scheme of Work builder at /sis/admin/sow and apply to all sections at that
// scope automatically.
export function POST() {
  return NextResponse.json(
    { error: 'Topic copying is no longer supported. Topics are set in the Scheme of Work builder at /sis/admin/sow.' },
    { status: 410 },
  );
}
