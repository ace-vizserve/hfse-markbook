import { NextResponse } from 'next/server';

export function PATCH() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}

export function DELETE() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}
