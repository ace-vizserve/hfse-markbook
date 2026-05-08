/**
 * One-off email sample sender for the rebrand verification step.
 *
 * Sends one rendered HTML of every transactional template via Resend to
 * ace.vizserve@gmail.com (forced; ignores NODE_ENV). Run with:
 *
 *   npx tsx --conditions react-server scripts/send-email-samples.ts
 *
 * The `--conditions react-server` flag is required because the renderer
 * modules import `server-only`, whose default export throws unless the
 * react-server export condition is active (Next handles this in-bundle).
 *
 * Prerequisites:
 *   - .env.local has RESEND_API_KEY set
 *   - .env.local has NEXT_PUBLIC_PARENT_PORTAL_URL set (any value works for visual)
 *   - .env.local has NEXT_PUBLIC_SIS_URL set (any value works for visual)
 *
 * Delete this file after verification — it's not part of the runtime app.
 */

import { config } from "dotenv";
import { Resend } from "resend";

import { renderReminder } from "@/lib/notifications/email-pfile-reminder";
import {
  notifyRequestApplied,
  notifyRequestApproved,
  notifyRequestFiled,
  notifyRequestRejected,
} from "@/lib/notifications/email-change-request";

config({ path: ".env.local" });

const TO = "ace.vizserve@gmail.com";

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY missing — set it in .env.local");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "HFSE SIS <noreply@hfse.edu.sg>";

  // ---- Parent publication ---- //
  const { renderEmailFrame, escapeHtml } = await import("@/lib/notifications/email-frame");
  {
    const sectionLabel = "P5 Acacia";
    const termLabel = "Term 2";
    const portalUrl = process.env.NEXT_PUBLIC_PARENT_PORTAL_URL ?? "https://enrol.hfse.edu.sg";
    const windowLine = `${new Date().toLocaleString("en-SG")} → ${new Date(Date.now() + 7 * 86_400_000).toLocaleString("en-SG")}`;
    const html = renderEmailFrame({
      headline: "Your child's report card is available",
      bodyHtml: `
        <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">Dear Parent,</p>
        <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
          The ${escapeHtml(termLabel)} report card for <strong>${escapeHtml(sectionLabel)}</strong> is now available.
        </p>
        <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 24px;">
          <strong>Viewing window:</strong><br/>
          <span style="font-family:monospace;color:#475569;">${escapeHtml(windowLine)}</span>
        </p>
      `,
      ctas: [{ label: `View ${termLabel} report card`, href: portalUrl }],
    });
    await send(resend, from, `Report card available — ${sectionLabel} · ${termLabel}`, html);
  }

  // ---- P-File reminder: renewal / expired ---- //
  {
    const { subject, html } = renderReminder({
      studentName: "Aarav Khanna",
      level: "P5",
      section: "Acacia",
      slotKey: "passport",
      slotLabel: "Passport",
      statusKind: "expired",
      expiryDateIso: new Date(Date.now() - 12 * 86_400_000).toISOString(),
      kind: "renewal",
      enroleeNumber: "E2026-0042",
      ayCode: "AY2026",
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: renewal / expiring soon ---- //
  {
    const { subject, html } = renderReminder({
      studentName: "Maya Tan",
      level: "S2",
      section: "Lotus",
      slotKey: "motherPassport",
      slotLabel: "Mother's Passport",
      statusKind: "expiringSoon",
      expiryDateIso: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      kind: "renewal",
      enroleeNumber: "E2026-0107",
      ayCode: "AY2026",
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: initial-chase / missing ---- //
  {
    const { subject, html } = renderReminder({
      studentName: "Noah Lim",
      level: "P3",
      section: null,
      slotKey: "birthCert",
      slotLabel: "Birth Certificate",
      statusKind: "missing",
      expiryDateIso: null,
      kind: "initial-chase",
      enroleeNumber: "E2027-0009",
      ayCode: "AY2027",
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: initial-chase / rejected ---- //
  {
    const { subject, html } = renderReminder({
      studentName: "Saanvi Iyer",
      level: "P1",
      section: null,
      slotKey: "idPicture",
      slotLabel: "ID Picture",
      statusKind: "rejected",
      expiryDateIso: null,
      kind: "initial-chase",
      enroleeNumber: "E2027-0034",
      ayCode: "AY2027",
    });
    await send(resend, from, subject, html);
  }

  // ---- Change request: filed (3-CTA approver email) ---- //
  const sampleReq = {
    id: "00000000-0000-0000-0000-0000000000aa",
    grading_sheet_id: "11111111-1111-1111-1111-111111111111",
    field_changed: "ww_scores",
    current_value: "16",
    proposed_value: "18",
    reason_category: "scoring_correction",
    justification:
      "Re-marked W2 after a paper review with the lead teacher. Original mark was a transcription error.",
    requested_by_email: "teacher.subject@hfse.test",
    requested_at: new Date().toISOString(),
    student_label: "Aarav Khanna · P5 Acacia",
    sheet_label: "Math · P5 · T2",
  };
  await notifyRequestFiled(sampleReq, [TO]);

  // ---- Change request: approved ---- //
  await notifyRequestApproved(
    {
      ...sampleReq,
      reviewed_by_email: "school.admin@hfse.test",
      decision_note: "Confirmed by lead teacher.",
    },
    TO,
    [TO],
  );

  // ---- Change request: rejected ---- //
  await notifyRequestRejected(
    {
      ...sampleReq,
      reviewed_by_email: "school.admin@hfse.test",
      decision_note: "Cannot adjust without a re-mark form on file.",
    },
    TO,
  );

  // ---- Change request: applied ---- //
  await notifyRequestApplied(sampleReq, TO, [TO]);

  console.log("Done. Check ace.vizserve@gmail.com");
}

async function send(resend: Resend, from: string, subject: string, html: string) {
  const r = await resend.emails.send({ from, to: TO, subject, html });
  if (r.error) {
    console.error("send failed:", subject, r.error);
  } else {
    console.log("sent:", subject);
  }
}

void main();
