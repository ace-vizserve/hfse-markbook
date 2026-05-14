import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '@/lib/auth/roles';

// Returns the badge count to show on the "Change requests" sidebar item
// for the given role. Single indexed query per layout render. No caching
// (layout already runs per-request and we want a live-ish number).
//
// Per-role scope MUST mirror what /markbook/change-requests actually shows
// — otherwise the sidebar badge over-counts and the user clicks through to
// an empty inbox (the bug we hit during demo prep). Specifically:
//   - school_admin / superadmin: pending CRs WHERE the user is the primary
//     or secondary designated approver (KD #41), OR legacy rows with both
//     approver columns NULL (broadcast-visible during the migration).
//   - registrar: approved CRs (the ones they apply via Path A — they have
//     full visibility regardless of approver assignment).
//   - teacher: their OWN pending requests.
export async function getSidebarChangeRequestCount(
  service: SupabaseClient,
  role: Role,
  userId: string,
): Promise<number> {
  let query = service
    .from('grade_change_requests')
    .select('id', { count: 'exact', head: true });

  if (role === 'teacher') {
    query = query.eq('requested_by', userId).eq('status', 'pending');
  } else if (role === 'registrar') {
    query = query.eq('status', 'approved');
  } else if (role === 'school_admin' || role === 'superadmin') {
    query = query
      .eq('status', 'pending')
      .or(
        `primary_approver_id.eq.${userId},secondary_approver_id.eq.${userId},and(primary_approver_id.is.null,secondary_approver_id.is.null)`,
      );
  } else {
    return 0;
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
