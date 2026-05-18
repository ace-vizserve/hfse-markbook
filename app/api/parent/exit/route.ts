import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { PARENT_SESSION_COOKIE, verifyParentSession } from '@/lib/parent/cookie';
import { logAction } from '@/lib/audit/log-action';
import { createServiceClient } from '@/lib/supabase/service';

// Clears the parent_session cookie. Called from the sidebar profile's
// "Done viewing" button AND from the parent layout's pagehide handler
// via navigator.sendBeacon — closing the tab or navigating to another
// origin actively wipes the cookie rather than waiting for the 2h TTL.

export async function POST() {
  // Read the cookie before clearing so we can attribute the audit row.
  const cookieStore = await cookies();
  const raw = cookieStore.get(PARENT_SESSION_COOKIE)?.value;
  const session = verifyParentSession(raw);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PARENT_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  if (session) {
    const service = createServiceClient();
    await logAction({
      service,
      actor: { id: null, email: session.email },
      action: 'parent.session.cleared',
      entityType: 'user_account',
      context: { reason: 'explicit_exit' },
    });
  }

  return res;
}
