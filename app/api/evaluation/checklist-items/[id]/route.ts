import { NextResponse } from 'next/server';

// PATCH/DELETE /api/evaluation/checklist-items/[id] — deprecated.
//
// Evaluation topics are now admin-prescribed via the Scheme of Work builder
// at /sis/admin/sow (KD #107). The SOW builder is the sole writer via
// lib/sis/sow/mutations.ts; these client-facing mutation routes are no longer
// in use.
export function PATCH() {
  return NextResponse.json(
    { error: 'Evaluation topics are managed through the Scheme of Work builder at /sis/admin/sow.' },
    { status: 410 },
  );
}

export function DELETE() {
  return NextResponse.json(
    { error: 'Evaluation topics are managed through the Scheme of Work builder at /sis/admin/sow.' },
    { status: 410 },
  );
}
