import { NextResponse } from 'next/server';

// POST /api/evaluation/checklist-items — deprecated.
//
// Evaluation topics are now admin-prescribed via the Scheme of Work builder
// at /sis/admin/sow (KD #107). Migration 058 reverted the scope from
// (section × subject × term) back to (level × curriculum_track × subject × term).
// The SOW builder is the sole writer via lib/sis/sow/mutations.ts server-side
// functions; this client-facing route is no longer in use.
export function POST() {
  return NextResponse.json(
    { error: 'Evaluation topics are managed through the Scheme of Work builder at /sis/admin/sow.' },
    { status: 410 },
  );
}
