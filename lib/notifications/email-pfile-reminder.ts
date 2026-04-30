import { Resend } from "resend";

// Server-only. Best-effort renewal-reminder email to the parent(s) tied
// to a P-Files document slot. Mirrors the send/dev-redirect pattern of
// `email-parents-publication.ts` per KD #16 + KD #29.

export type SlotStatusKind = "expired" | "expiringSoon" | "rejected" | "missing";

// `kind` selects the email tone:
//   - 'renewal' (default): post-enrolment chase aimed at parents whose
//     valid documents are nearing expiry or already expired. Used by
//     P-Files for enrolled-student renewal lifecycle.
//   - 'initial-chase': pre-enrolment chase aimed at parents who haven't
//     completed an applicant document slot yet (Pending/Rejected/Uploaded
//     awaiting validation). Used by Admissions during the application
//     funnel — copy stresses "completing the application" rather than
//     "renewing existing docs".
export type ReminderKind = "renewal" | "initial-chase";

export type ReminderContext = {
  studentName: string;
  level: string | null;
  section: string | null;
  slotKey: string;
  slotLabel: string;
  statusKind: SlotStatusKind;
  expiryDateIso: string | null; // for expired / expiringSoon
  kind?: ReminderKind; // default 'renewal' for back-compat
};

export type RecipientCandidate = {
  email: string;
  role: "mother" | "father" | "guardian";
};

// Resolve which parent email addresses receive a reminder for a given
// slot. Mother-prefixed slots go to the mother only; father-prefixed to
// the father; guardian-prefixed to the guardian. Student slots (passport,
// pass, idPicture, etc.) go to mother + father, falling back to guardian
// when both parent emails are missing.
export function resolveRecipients(
  slotKey: string,
  emails: { motherEmail: string | null; fatherEmail: string | null; guardianEmail: string | null },
): RecipientCandidate[] {
  const motherEmail = emails.motherEmail?.trim() || null;
  const fatherEmail = emails.fatherEmail?.trim() || null;
  const guardianEmail = emails.guardianEmail?.trim() || null;

  if (slotKey.startsWith("mother")) {
    return motherEmail ? [{ email: motherEmail, role: "mother" }] : [];
  }
  if (slotKey.startsWith("father")) {
    return fatherEmail ? [{ email: fatherEmail, role: "father" }] : [];
  }
  if (slotKey.startsWith("guardian")) {
    return guardianEmail ? [{ email: guardianEmail, role: "guardian" }] : [];
  }

  // Student-owned slot — mother + father, fall back to guardian.
  const out: RecipientCandidate[] = [];
  if (motherEmail) out.push({ email: motherEmail, role: "mother" });
  if (fatherEmail) out.push({ email: fatherEmail, role: "father" });
  if (out.length === 0 && guardianEmail) out.push({ email: guardianEmail, role: "guardian" });
  return out;
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  const ms = a.setHours(0, 0, 0, 0) - b.setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

function statusDescriptor(ctx: ReminderContext): string {
  const today = new Date().toISOString().slice(0, 10);
  if (ctx.statusKind === "expired" && ctx.expiryDateIso) {
    const days = daysBetween(today, ctx.expiryDateIso);
    return days <= 0 ? "expired today" : `expired ${days} days ago`;
  }
  if (ctx.statusKind === "expiringSoon" && ctx.expiryDateIso) {
    const days = daysBetween(ctx.expiryDateIso, today);
    return days <= 0 ? "expires today" : `expires in ${days} days`;
  }
  if (ctx.statusKind === "rejected") return "needs replacement";
  return "is missing";
}

export type RenderedReminder = {
  subject: string;
  html: string;
};

export function renderReminder(ctx: ReminderContext): RenderedReminder {
  const portalUrl = process.env.NEXT_PUBLIC_PARENT_PORTAL_URL ?? "https://enrol.hfse.edu.sg";
  const descriptor = statusDescriptor(ctx);
  const kind: ReminderKind = ctx.kind ?? "renewal";

  // Subject branching:
  //   - 'renewal' (P-Files post-enrolment): emphasises renewal of an
  //     existing valid document, with the descriptor (expired N days ago /
  //     expires in N days / etc).
  //   - 'initial-chase' (Admissions pre-enrolment): emphasises completing
  //     the application — drops the expiry descriptor (rarely meaningful
  //     pre-enrolment) in favour of the slot label alone.
  const subject =
    kind === "initial-chase"
      ? `Document follow-up needed: ${ctx.slotLabel} for ${ctx.studentName}`
      : `Document renewal needed: ${ctx.slotLabel} for ${ctx.studentName} (${descriptor})`;

  const sectionLabel =
    ctx.level && ctx.section ? `${ctx.level} ${ctx.section}` : ctx.level ?? ctx.section ?? "";

  const expiryLine = ctx.expiryDateIso
    ? `<p style="line-height: 1.6; margin: 0 0 12px;">
         <strong>Document expiry:</strong>
         <span style="font-family: monospace; color: #475569;">${new Date(ctx.expiryDateIso).toLocaleDateString("en-SG", {
           year: "numeric",
           month: "long",
           day: "numeric",
         })}</span>
       </p>`
    : "";

  // Headline + body branch on kind.
  //   - renewal: "{slot} {descriptor}" — e.g. "Passport expired 12 days ago".
  //   - initial-chase: "{slot} required to complete application" — neutral,
  //     no expiry framing since these slots rarely carry an expiry date.
  const headline =
    kind === "initial-chase"
      ? `${ctx.slotLabel} required to complete application`
      : `${ctx.slotLabel} ${descriptor}`;

  const bodyParagraph =
    kind === "initial-chase"
      ? `Please upload the <strong>${ctx.slotLabel}</strong> for
         <strong>${ctx.studentName}</strong>${sectionLabel ? ` (${sectionLabel})` : ""}
         to continue the application. Our records show this document ${descriptor}.`
      : `Please re-upload the <strong>${ctx.slotLabel}</strong> for
         <strong>${ctx.studentName}</strong>${sectionLabel ? ` (${sectionLabel})` : ""}.
         Our records show this document ${descriptor}.`;

  const footerParagraph =
    kind === "initial-chase"
      ? `Sign in at the parent portal with the same email and password you use
         for enrolment, then upload the document under your enrolment
         details page. If you have already submitted this document, please
         contact the school admissions office to confirm receipt.`
      : `Sign in at the parent portal with the same email and password you use
         for enrolment, then re-upload the document under your enrolment
         details page. If you have already submitted this document, please
         contact the school registrar to confirm receipt.`;

  const stripLabel =
    kind === "initial-chase" ? "HFSE International School · Admissions" : "HFSE International School · Records";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A;">
      <p style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748B; margin: 0 0 12px;">
        ${stripLabel}
      </p>
      <h1 style="font-size: 22px; margin: 0 0 16px; color: #0F172A;">
        ${headline}
      </h1>
      <p style="line-height: 1.6; margin: 0 0 12px;">
        Dear Parent / Guardian,
      </p>
      <p style="line-height: 1.6; margin: 0 0 12px;">
        ${bodyParagraph}
      </p>
      ${expiryLine}
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Open parent portal
        </a>
      </p>
      <p style="line-height: 1.6; font-size: 13px; color: #64748B; margin: 24px 0 0;">
        ${footerParagraph}
      </p>
    </div>
  `;

  return { subject, html };
}

export type SendOutcome = {
  recipient: RecipientCandidate;
  ok: boolean;
  error?: string;
};

export type SendResult = {
  attempted: number;
  sent: number;
  failed: number;
  outcomes: SendOutcome[];
};

// Best-effort send. Returns per-recipient outcomes so the calling route
// can write one p_file_outreach row per successful send. No DB writes
// happen here.
export async function sendReminder(
  ctx: ReminderContext,
  recipients: RecipientCandidate[],
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || recipients.length === 0) {
    if (!apiKey) {
      console.warn("[notify] skipping pfile reminder: RESEND_API_KEY unset");
    }
    return { attempted: recipients.length, sent: 0, failed: 0, outcomes: [] };
  }

  const resend = new Resend(apiKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "HFSE SIS <noreply@hfse.edu.sg>";
  const devTo = process.env.NODE_ENV !== "production" ? "ace.vizserve@gmail.com" : null;
  const { subject, html } = renderReminder(ctx);

  const outcomes: SendOutcome[] = [];
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const res = await resend.emails.send({
        from: fromAddress,
        to: devTo ?? recipient.email,
        subject,
        html,
      });
      if (res.error) {
        failed += 1;
        outcomes.push({ recipient, ok: false, error: res.error.message });
        console.error("[notify] pfile reminder resend error for", recipient.email, res.error);
      } else {
        sent += 1;
        outcomes.push({ recipient, ok: true });
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      outcomes.push({ recipient, ok: false, error: msg });
      console.error("[notify] pfile reminder resend throw for", recipient.email, e);
    }
  }

  return { attempted: recipients.length, sent, failed, outcomes };
}
