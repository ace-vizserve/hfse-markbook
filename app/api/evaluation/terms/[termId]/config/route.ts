import { NextResponse } from 'next/server';

// Evaluation window open/close was removed — write access is always on.
export async function PUT() {
  return NextResponse.json(
    { error: 'Evaluation window has been removed. Write access is always open.' },
    { status: 410 },
  );
}
