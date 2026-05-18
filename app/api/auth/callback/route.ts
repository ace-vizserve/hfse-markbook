import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction } from '@/lib/audit/log-action';

// Supabase OAuth / magic-link / email-confirm callback.
// Email+password login doesn't use this, but keep it wired up for later.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const service = createServiceClient();
      await logAction({
        service,
        actor: { id: data.user.id, email: data.user.email ?? null },
        action: 'user.login',
        entityType: 'user_account',
        entityId: data.user.id,
        context: { provider: data.session?.user.app_metadata?.provider ?? 'magic_link', redirect_to: next },
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
