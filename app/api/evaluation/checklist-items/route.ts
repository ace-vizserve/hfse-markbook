import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}
