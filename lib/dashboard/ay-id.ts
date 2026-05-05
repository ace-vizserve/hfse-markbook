import 'server-only';
import { cache } from 'react';

import { createServiceClient } from '@/lib/supabase/service';

// Request-scoped resolver for `ay_code` → `ay_id`. The dashboard pages
// load 5–12 helpers in parallel, and several of them used to each query
// `academic_years` independently to resolve the same row. Wrapping the
// lookup in React's `cache()` dedupes those calls within a single render
// — every helper sharing the same `ayCode` reuses one Supabase round-trip.
//
// Returns `null` if the AY code doesn't exist, so callers can early-out
// with empty/zero results instead of querying with `null`.

export const getAyIdByCode = cache(async (ayCode: string): Promise<string | null> => {
  const service = createServiceClient();
  const { data } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
});
