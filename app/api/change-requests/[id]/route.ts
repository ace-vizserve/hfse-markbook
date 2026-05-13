import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction, type AuditAction } from '@/lib/audit/log-action';
import { ChangeRequestActionSchema } from '@/lib/schemas/change-request';
import {
  notifyRequestApproved,
  notifyRequestRejected,
} from '@/lib/notifications/email-change-request';
import {
  fetchLabels,
  fetchRegistrarEmails,
} from '../route';
import { invalidateDrillTags } from '@/lib/cache/invalidate-drill-tags';
import { requireCurrentAyCode } from '@/lib/academic-year';

// PATCH /api/change-requests/[id]
// Body: { action: 'approve' | 'reject' | 'cancel', decision_note?: string }
//
// Transitions:
//   approve  — school_admin+ only. pending → approved. decision_note optional.
//              Fires notifyRequestApproved() to teacher + registrar.
//   reject   — school_admin+ only. pending → rejected. decision_note required.
//              Fires notifyRequestRejected() to teacher.
//   cancel   — original requester only. pending → cancelled. No notifications.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ChangeRequestActionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? 'invalid body' },
      { status: 400 },
    );
  }
  const { action, decision_note } = parsed.data;

  const service = createServiceClient();

  const { data: existing, error: fetchError } = await service
    .from('grade_change_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: 'request not found' }, { status: 404 });
  }
  // Cancel must always be on a pending request — only the original
  // requester can call cancel and only before either reviewer has acted.
  // Approve/reject loosen this guard: a secondary reviewer co-signs AFTER
  // the first review has flipped status, so we accept approved/rejected
  // here too and let the per-ordinal logic below decide what's legal.
  const isReview = action === 'approve' || action === 'reject';
  if (!isReview && existing.status !== 'pending') {
    return NextResponse.json(
      { error: `cannot ${action} a request in status "${existing.status}"` },
      { status: 400 },
    );
  }
  if (
    isReview &&
    existing.status !== 'pending' &&
    existing.status !== 'approved' &&
    existing.status !== 'rejected'
  ) {
    // applied / cancelled — terminal states no reviewer should write into.
    return NextResponse.json(
      { error: `cannot ${action} a request in status "${existing.status}"` },
      { status: 400 },
    );
  }

  // Authorization per action
  let isPrimaryReview = false;
  let reviewerOrdinal: 'primary' | 'secondary' = 'primary';
  if (isReview) {
    // Approvers are school_admin role only. Superadmins manage who's
    // designated as an approver (via /sis/admin/approvers) but don't
    // approve change requests themselves.
    if (auth.role !== 'school_admin') {
      return NextResponse.json(
        { error: 'Only school administrators can approve or reject change requests.' },
        { status: 403 },
      );
    }
    // Designated-approver scope: the acting school_admin must be the
    // primary or secondary approver on this specific request. Legacy rows
    // with both NULL (pre-feature) fall back to broadcast scope.
    const isLegacy =
      existing.primary_approver_id == null &&
      existing.secondary_approver_id == null;
    const isDesignated =
      existing.primary_approver_id === auth.user.id ||
      existing.secondary_approver_id === auth.user.id;
    if (!isLegacy && !isDesignated) {
      return NextResponse.json(
        {
          error:
            'You are not a designated approver on this request. Only the primary or secondary approver selected by the teacher can act on it.',
        },
        { status: 403 },
      );
    }

    // Ordinal: first reviewer to act is "primary" (writes both legacy
    // reviewed_* and new primary_* columns + flips status); the second
    // to act is "secondary" (writes only secondary_* + does NOT touch
    // status). Same person may not act twice on the same request — block
    // both the "primary acts again as secondary" path AND the "secondary
    // acts again as secondary" path.
    isPrimaryReview = existing.primary_reviewed_by == null;
    reviewerOrdinal = isPrimaryReview ? 'primary' : 'secondary';

    const sameUserAlreadyReviewed =
      !isPrimaryReview &&
      (existing.primary_reviewed_by === auth.user.id ||
        existing.secondary_reviewed_by === auth.user.id);
    if (sameUserAlreadyReviewed) {
      return NextResponse.json(
        {
          error:
            'You have already reviewed this request. The other designated approver still needs to co-sign.',
        },
        { status: 400 },
      );
    }

    // Once a request is rejected, secondary co-signs serve no purpose — the
    // request is dead and cannot be applied (the apply route requires
    // status='approved'). Block the secondary path on rejected so we don't
    // record a confusing secondary_decision='approved' against a
    // status='rejected' row.
    if (!isPrimaryReview && existing.status === 'rejected') {
      return NextResponse.json(
        {
          error:
            'This request was already rejected by the other approver. A second review is not needed.',
        },
        { status: 400 },
      );
    }
  } else if (action === 'cancel') {
    if (existing.requested_by !== auth.user.id) {
      return NextResponse.json(
        { error: 'only the original requester can cancel this request' },
        { status: 403 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {};
  let auditAction: AuditAction;

  if (action === 'approve' || action === 'reject') {
    const decision: 'approved' | 'rejected' =
      action === 'approve' ? 'approved' : 'rejected';
    if (isPrimaryReview) {
      // First reviewer: write both the legacy reviewed_* columns (back-compat
      // for existing display logic + admin inbox queries) AND the new
      // primary_* columns. Status flips here.
      update.status = decision;
      update.reviewed_by = auth.user.id;
      update.reviewed_by_email = auth.user.email ?? '(unknown)';
      update.reviewed_at = nowIso;
      update.decision_note = decision_note ?? null;
      update.primary_reviewed_by = auth.user.id;
      update.primary_reviewed_by_email = auth.user.email ?? null;
      update.primary_reviewed_at = nowIso;
      update.primary_decision = decision;
    } else {
      // Second reviewer: write only secondary_* columns. Status was already
      // flipped by the first reviewer; we do NOT touch status, reviewed_*,
      // or any legacy column. The second review is a co-sign, not a
      // status transition.
      update.secondary_reviewed_by = auth.user.id;
      update.secondary_reviewed_by_email = auth.user.email ?? null;
      update.secondary_reviewed_at = nowIso;
      update.secondary_decision = decision;
    }
    auditAction =
      action === 'approve' ? 'grade_change_approved' : 'grade_change_rejected';
  } else {
    update.status = 'cancelled';
    auditAction = 'grade_change_cancelled';
  }

  // Optimistic-concurrency guard. The existing pre-update status check
  // above is the first line of defense (catches a stale UI acting on an
  // already-decided request); this is the second line of defense that
  // catches a genuine race between two designees clicking simultaneously.
  // For the FIRST reviewer (primary): require status === 'pending'. The
  // loser of a simultaneous-click race finds status already moved.
  // For the SECOND reviewer: status has already moved; pin it to whatever
  // we read at the top so an unrelated state change between read + write
  // (e.g., teacher cancellation racing in) also returns null.
  const expectedStatus = isReview && !isPrimaryReview
    ? existing.status
    : 'pending';
  const { data: updated, error: updateError } = await service
    .from('grade_change_requests')
    .update(update)
    .eq('id', id)
    .eq('status', expectedStatus)
    .select('*')
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? 'update failed' },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      {
        error:
          'This request was already handled by another administrator. Refresh to see the latest status.',
      },
      { status: 409 },
    );
  }

  await logAction({
    service,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: auditAction,
    entityType: 'grade_change_request',
    entityId: id,
    context: {
      grading_sheet_id: updated.grading_sheet_id,
      grade_entry_id: updated.grade_entry_id,
      field: updated.field_changed,
      proposed: updated.proposed_value,
      decision_note: updated.decision_note ?? null,
      ...(isReview ? { reviewer_ordinal: reviewerOrdinal } : {}),
    },
  });

  invalidateDrillTags('markbook', await requireCurrentAyCode(service));

  // Fire-and-forget notifications for approve/reject. Cancel is silent.
  if (action === 'approve' || action === 'reject') {
    void (async () => {
      try {
        const labels = await fetchLabels(service, updated.grading_sheet_id, updated.grade_entry_id);
        const summary = {
          id: updated.id,
          grading_sheet_id: updated.grading_sheet_id,
          field_changed: updated.field_changed,
          current_value: updated.current_value,
          proposed_value: updated.proposed_value,
          reason_category: updated.reason_category,
          justification: updated.justification,
          requested_by_email: updated.requested_by_email,
          requested_at: updated.requested_at,
          reviewed_by_email: updated.reviewed_by_email,
          decision_note: updated.decision_note,
          student_label: labels.student_label,
          sheet_label: labels.sheet_label,
        };
        if (action === 'approve') {
          const registrarEmails = await fetchRegistrarEmails(service);
          await notifyRequestApproved(summary, updated.requested_by_email, registrarEmails);
        } else {
          await notifyRequestRejected(summary, updated.requested_by_email);
        }
      } catch (e) {
        console.error('[change-requests] notify decision failed', e);
      }
    })();
  }

  return NextResponse.json({ request: updated });
}
