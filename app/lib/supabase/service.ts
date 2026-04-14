import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client for the grading DB.
// Use ONLY in API routes after verifying the caller's role via the
// cookie-bound server client. Bypasses RLS — never import from client code.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
