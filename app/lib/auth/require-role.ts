import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole, type Role } from '@/lib/auth/roles';

// Use inside API route handlers to assert the caller holds one of the allowed
// roles. Returns either { user, role } or a NextResponse to return directly.
export async function requireRole(allowed: Role[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    } as const;
  }
  const role = getUserRole(user);
  if (!role || !allowed.includes(role)) {
    return {
      error: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    } as const;
  }
  return { user, role } as const;
}
