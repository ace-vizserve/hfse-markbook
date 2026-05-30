import { NextResponse } from 'next/server';

export function PATCH() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}
