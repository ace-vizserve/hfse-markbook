import "server-only";

import { Resend } from 'resend';

import { escapeHtml, renderEmailFrame } from '@/lib/notifications/email-frame';

// Server-only. Four email notifications for the change-request workflow.
// All functions are best-effort: they silently no-op when RESEND_API_KEY is
// unset, and per-recipient errors are logged but never thrown. The workflow
// state machine is the source of truth; email is a courtesy nudge.
//
// CTAs deep-link to /markbook/change-requests?req=<id>[&action=...]; the
// page reads the params, scrolls to the row and (for the approver email)
// auto-opens the decision dialog. Absolute URLs require NEXT_PUBLIC_SIS_URL;
// when unset the build still ships but the buttons render relative URLs that
// most email clients won't navigate from. Logged via console.warn at render.

type RequestSummary = {
  id: string;
  grading_sheet_id: string;
  field_changed: string;
  current_value: string | null;
  proposed_value: string;
  reason_category: string;
  justification: string;
  requested_by_email: string;
  requested_at: string;
  reviewed_by_email?: string | null;
  decision_note?: string | null;
  student_label?: string | null;
  sheet_label?: string | null;
};

function changeRequestUrl(requestId: string, action?: 'approve' | 'reject'): string {
  const base = process.env.NEXT_PUBLIC_SIS_URL;
  if (!base) {
    console.warn(
      '[notify] NEXT_PUBLIC_SIS_URL unset — change-request email CTAs will use relative URLs and may not navigate from email clients',
    );
  }
  const origin = base ?? '';
  const path = `/markbook/change-requests?req=${encodeURIComponent(requestId)}`;
  const suffix = action ? `&action=${action}` : '';
  return `${origin}${path}${suffix}`;
}

function getTransport(): { resend: Resend; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify] skipping change-request email: RESEND_API_KEY unset');
    return null;
  }
  const from =
    process.env.RESEND_FROM_EMAIL ?? 'HFSE SIS <noreply@hfse.edu.sg>';
  return { resend: new Resend(apiKey), from };
}

async function sendAll(
  resend: Resend,
  from: string,
  recipients: string[],
  subject: string,
  html: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const devTo = process.env.NODE_ENV !== 'production' ? 'ace.vizserve@gmail.com' : null;
  for (const to of recipients) {
    try {
      const res = await resend.emails.send({ from, to: devTo ?? to, subject, html });
      if (res.error) {
        failed += 1;
        console.error('[notify] resend error for', to, res.error);
      } else {
        sent += 1;
      }
    } catch (e) {
      failed += 1;
      console.error('[notify] resend throw for', to, e);
    }
  }
  return { sent, failed };
}

function summaryTable(req: RequestSummary): string {
  const rows: Array<[string, string]> = [
    ['Sheet', req.sheet_label ?? '(sheet)'],
    ['Student', req.student_label ?? '(student)'],
    ['Field', req.field_changed],
    ['Current value', req.current_value ?? '(blank)'],
    ['Proposed value', req.proposed_value],
    ['Reason category', req.reason_category.replace(/_/g, ' ')],
    ['Teacher', req.requested_by_email],
  ];
  return `
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 14px;">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding: 6px 12px 6px 0; color: #64748B; width: 140px; vertical-align: top;">${label}</td>
          <td style="padding: 6px 0; color: #1d1c1d;">${escapeHtml(value)}</td>
        </tr>`,
        )
        .join('')}
    </table>
  `;
}

// Fired on: POST /api/change-requests (teacher files a request)
// Recipients: the request's primary + secondary approvers (per KD #41).
// Has 2 primary buttons (Approve navy, Reject red) + 1 secondary text link.
export async function notifyRequestFiled(
  req: RequestSummary,
  approverEmails: string[],
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t || approverEmails.length === 0) return { sent: 0, failed: 0 };

  const subject = `New grade change request — ${req.student_label ?? 'student'}`;
  const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      A teacher has filed a request to edit a locked grading sheet.
    </p>
    ${summaryTable(req)}
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      <strong>Justification:</strong><br/>
      <span style="color:#475569;">${escapeHtml(req.justification)}</span>
    </p>
  `;
  const html = renderEmailFrame({
    headline: 'New grade change request',
    bodyHtml,
    ctas: [
      { label: 'Approve', href: changeRequestUrl(req.id, 'approve'), variant: 'primary' },
      { label: 'Reject', href: changeRequestUrl(req.id, 'reject'), variant: 'destructive' },
      {
        label: 'To review the request, click here',
        href: changeRequestUrl(req.id),
        variant: 'secondary-text',
      },
    ],
  });

  return sendAll(t.resend, t.from, approverEmails, subject, html);
}

// Fired on: PATCH approve
// Recipients: the teacher who filed it + all registrar users.
export async function notifyRequestApproved(
  req: RequestSummary,
  teacherEmail: string,
  applierEmails: string[],
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0 };

  const recipients = Array.from(new Set([teacherEmail, ...applierEmails])).filter(Boolean);
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const subject = `Grade change approved — ${req.student_label ?? 'student'}`;
  const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      Your grade change request has been approved by
      <strong>${escapeHtml(req.reviewed_by_email ?? 'an administrator')}</strong>.
      The registrar will apply it shortly.
    </p>
    ${summaryTable(req)}
    ${
      req.decision_note
        ? `<p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;"><strong>Note:</strong> ${escapeHtml(req.decision_note)}</p>`
        : ''
    }
  `;
  const html = renderEmailFrame({
    headline: 'Grade change request approved',
    bodyHtml,
    ctas: [{ label: 'View approved request', href: changeRequestUrl(req.id) }],
  });
  return sendAll(t.resend, t.from, recipients, subject, html);
}

// Fired on: PATCH reject
// Recipients: the teacher who filed it.
export async function notifyRequestRejected(
  req: RequestSummary,
  teacherEmail: string,
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t || !teacherEmail) return { sent: 0, failed: 0 };

  const subject = `Grade change request declined — ${req.student_label ?? 'student'}`;
  const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      Your grade change request was declined by
      <strong>${escapeHtml(req.reviewed_by_email ?? 'an administrator')}</strong>.
    </p>
    ${summaryTable(req)}
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      <strong>Reason given:</strong><br/>
      <span style="color:#475569;">${escapeHtml(req.decision_note ?? '(no reason provided)')}</span>
    </p>
  `;
  const html = renderEmailFrame({
    headline: 'Grade change request declined',
    bodyHtml,
    ctas: [{ label: 'View declined request', href: changeRequestUrl(req.id) }],
  });
  return sendAll(t.resend, t.from, [teacherEmail], subject, html);
}

// Fired on: PATCH entries (Path A) with change_request_id.
// Recipients: the teacher + any approver emails provided.
export async function notifyRequestApplied(
  req: RequestSummary,
  teacherEmail: string,
  approverEmails: string[],
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0 };

  const recipients = Array.from(new Set([teacherEmail, ...approverEmails])).filter(Boolean);
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const subject = `Grade change applied — ${req.student_label ?? 'student'}`;
  const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      An approved grade change has been applied to the locked sheet.
    </p>
    ${summaryTable(req)}
  `;
  const html = renderEmailFrame({
    headline: 'Grade change applied',
    bodyHtml,
    ctas: [{ label: 'View applied change', href: changeRequestUrl(req.id) }],
  });
  return sendAll(t.resend, t.from, recipients, subject, html);
}
