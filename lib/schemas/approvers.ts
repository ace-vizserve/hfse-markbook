import { z } from 'zod';

// Canonical list of approval flows the SIS knows about. Add a new entry
// when a module grows its own approval flow (e.g. `sis.stage_escalation`,
// `attendance.correction`). The superadmin UI at /sis/admin/approvers
// renders one section per flow listed here.
export const APPROVER_FLOWS = [
  'markbook.change_request',
] as const;
export type ApproverFlow = (typeof APPROVER_FLOWS)[number];

export const APPROVER_FLOW_LABELS: Record<ApproverFlow, string> = {
  'markbook.change_request': 'Markbook · Change Requests',
};

export const APPROVER_FLOW_DESCRIPTIONS: Record<ApproverFlow, string> = {
  'markbook.change_request':
    'Approve or reject teacher requests to edit locked grading sheets. Teachers pick a primary + secondary from this list at submission; only those two can act on the request.',
};

// Payload for POST /api/sis/admin/approvers (superadmin-only).
export const AssignApproverSchema = z.object({
  user_id: z.string().uuid('Pick a user'),
  flow: z.enum(APPROVER_FLOWS),
});
export type AssignApproverInput = z.infer<typeof AssignApproverSchema>;
