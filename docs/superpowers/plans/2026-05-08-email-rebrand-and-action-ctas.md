# Email Rebrand + Action-CTA Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the 3 transactional email modules to the HFSE corporate brand (logo + system fonts + `#004aad` navy), add action-specific deep-link CTAs (parent-portal upload page for p-file reminders, SIS deep-link with `?req&action=approve|reject` for change-requests), and add Approve/Reject buttons to the approver email that auto-open the existing decision dialog.

**Architecture:** Extract a single `lib/notifications/email-frame.ts` primitive that owns the HFSE-corporate visual shell (table layout, logo, system fonts, `#004aad` button styles, school address footer + PEI registration). The 3 existing email modules become content producers — they pass `{ headline, bodyHtml, ctas[] }` into the frame. SIS-side change-requests page reads `?req=<id>&action=approve|reject` URL params and programmatically opens the matching row's decision dialog via a new `controlledOpen` prop on `ChangeRequestDecisionButtons`.

**Tech Stack:** TypeScript / Next.js 16 App Router (Turbopack, async `searchParams`) / Resend (transactional email, best-effort per KD #16) / `react-router`'s `useRouter` from `next/navigation` / no new external deps.

**Spec reference:** `docs/superpowers/specs/2026-05-08-email-rebrand-and-action-ctas-design.md`

**Test approach (per spec):** No new automated tests. Each task ends with `npx next build` (clean type-check + compile) as the verification gate. End-to-end visual + functional verification happens via the sample-send script in Task 8 (sends every template to `ace.vizserve@gmail.com` via the dev-redirect path per KD #29).

**Files touched:**

| File                                                                     | Change                 | Owner of                                                                                                               |
| ------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.env.local.example`                                                     | Modify                 | New `NEXT_PUBLIC_SIS_URL` block                                                                                        |
| `lib/notifications/email-frame.ts`                                       | **Create**             | Shared HFSE-branded frame (logo, fonts, button variants, footer) + `escapeHtml` re-export                              |
| `lib/notifications/email-parents-publication.ts`                         | Modify                 | Drop inline shell, use frame, action-specific CTA copy                                                                 |
| `lib/notifications/email-pfile-reminder.ts`                              | Modify                 | Drop inline shell, use frame, extend `ReminderContext` with `enroleeNumber` + `ayCode`, build parent-portal upload URL |
| `lib/p-files/notify-helpers.ts`                                          | Modify                 | Pass `enroleeNumber` + `ayCode` into `sendReminder`'s context                                                          |
| `lib/notifications/email-change-request.ts`                              | Modify                 | Drop inline shell, use frame, add CTAs (3-CTA approver template + 1-CTA the rest), build absolute SIS URLs             |
| `app/(markbook)/markbook/change-requests/decision-buttons.tsx`           | Modify                 | Add `controlledOpen` + `onControlledOpenConsumed` props                                                                |
| `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx` | Modify                 | Read `req` + `action` URL params, find row, open dialog, scroll into view, clear params                                |
| `app/(markbook)/markbook/change-requests/page.tsx`                       | Modify                 | Extend `searchParams` shape with `req` + `action`                                                                      |
| `scripts/send-email-samples.ts`                                          | **Create** (deletable) | One-off Resend driver that exercises every template                                                                    |

**Sequencing rule:** every task's last step is a clean `npx next build` + a single git commit. No branches inside tasks. The plan executes top-to-bottom; each task can be reviewed in isolation.

---

## Task 1: Document `NEXT_PUBLIC_SIS_URL` env var

**Files:**

- Modify: `.env.local.example`

**Why first:** the change-request CTAs (Task 5) need this env var. Documenting it first means the rest of the plan can reference it without scope leak.

- [ ] **Step 1: Append the new block to `.env.local.example`**

Open `.env.local.example`. Append (preserving final newline) directly after the existing `PARENT_HANDOFF_SECRET=` line at the bottom of the file:

```
# SIS application URL — absolute origin used to build email CTAs that
# deep-link recipients to specific SIS pages (e.g. change-request emails
# include Approve / Reject buttons that point at /markbook/change-requests).
# Email clients can't resolve relative paths, so we need the full origin.
#
# Per-environment values (set in Vercel → Settings → Environment Variables,
# one per environment — do NOT hardcode one here and ship it to production):
#
#   Production : https://sis.hfse.edu.sg
#   Preview    : https://hfse-markbook-staging.vercel.app
#   Development: http://localhost:3000
#
# Best-effort: when unset, change-request emails fall back to relative URLs
# (the buttons render but won't navigate from most email clients) and a
# console.warn is emitted at render time. Same pattern as RESEND_API_KEY
# per KD #16. The value below is for local dev only.
NEXT_PUBLIC_SIS_URL=http://localhost:3000
```

- [ ] **Step 2: Verify build still passes**

Run: `npx next build`
Expected: Clean compile, no errors. (No code change yet — sanity check that the working tree starts green.)

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "docs(env): add NEXT_PUBLIC_SIS_URL for absolute email deep-links"
```

---

## Task 2: Create the shared email frame primitive

**Files:**

- Create: `lib/notifications/email-frame.ts`

**Goal:** one function `renderEmailFrame({ headline, bodyHtml, ctas, reviewLinkHtml? })` that emits the full HFSE-corporate-branded `<html>` shell. Plus a re-exported `escapeHtml` so consumers don't each redefine it.

The frame mirrors the parent-portal account-confirmation template shared during brainstorming (table layout, 160px logo, system fonts, `#004aad` primary buttons, `#dc2626` destructive variant, `<hr>` divider, school address + PEI registration footer).

- [ ] **Step 1: Create the file with full contents**

Create `lib/notifications/email-frame.ts` with:

```ts
import 'server-only';

// HFSE corporate-branded email frame. Used by every transactional email
// template in lib/notifications/. Mirrors the parent-portal account-
// confirmation template (same logo URL, system-font stack, #004aad navy
// button, school address + PEI registration footer) so SIS emails read
// as part of the same brand family.
//
// Emails MUST stay table-based and inline-CSS — most email clients (Outlook
// in particular) ignore <link>, <style>, flexbox, gap, and CSS variables.
// Don't refactor toward semantic HTML / Tailwind / CSS-in-JS here.

const LOGO_URL =
  'https://vnhklhppftebbcuupfjw.supabase.co/storage/v1/object/public/parent-portal//hfse-logo.png';

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

const COLOR_INK = '#1d1c1d';
const COLOR_PRIMARY = '#004aad';
const COLOR_DESTRUCTIVE = '#dc2626';
const COLOR_FOOTER = '#6b6b6b';
const COLOR_HAIRLINE = '#eaeaea';

export type EmailCta = {
  label: string;
  href: string;
  variant?: 'primary' | 'destructive' | 'secondary-text';
};

export type EmailFrameInput = {
  /** The big serif-style headline shown above the body. */
  headline: string;
  /** Inline HTML for the body. Caller is responsible for escaping any
   *  user-controlled values via escapeHtml() before composing this string. */
  bodyHtml: string;
  /** Zero or more CTAs. Buttons render side-by-side; secondary-text renders
   *  as a centered text link below the buttons. */
  ctas?: EmailCta[];
  /** Optional "if the button doesn't work, copy this link" paragraph below
   *  the CTAs. Caller passes the already-rendered HTML. */
  reviewLinkHtml?: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderButton(cta: EmailCta): string {
  const bg = cta.variant === 'destructive' ? COLOR_DESTRUCTIVE : COLOR_PRIMARY;
  return `
    <a href="${cta.href}" style="background:${bg};color:white;padding:14px 24px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:600;display:inline-block;">
      ${escapeHtml(cta.label)}
    </a>
  `;
}

function renderCtas(ctas: EmailCta[]): string {
  if (ctas.length === 0) return '';

  const buttons = ctas.filter((c) => c.variant !== 'secondary-text');
  const textLinks = ctas.filter((c) => c.variant === 'secondary-text');

  let buttonRow = '';
  if (buttons.length === 1) {
    buttonRow = `
      <table align="center" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
        <tr>
          <td align="center">${renderButton(buttons[0])}</td>
        </tr>
      </table>
    `;
  } else if (buttons.length >= 2) {
    // Side-by-side via a 2-cell inner table (email-safe; no flex).
    buttonRow = `
      <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 24px;">
        <tr>
          ${buttons
            .map(
              (b) =>
                `<td align="center" style="padding:0 6px;">${renderButton(b)}</td>`
            )
            .join('')}
        </tr>
      </table>
    `;
  }

  const textLinkRow = textLinks
    .map(
      (t) => `
        <p style="text-align:center;font-size:14px;line-height:24px;margin:0 0 16px;">
          <a href="${t.href}" style="color:${COLOR_PRIMARY};text-decoration:underline;">
            ${escapeHtml(t.label)}
          </a>
        </p>
      `
    )
    .join('');

  return buttonRow + textLinkRow;
}

export function renderEmailFrame(input: EmailFrameInput): string {
  const ctasHtml = renderCtas(input.ctas ?? []);
  const reviewHtml = input.reviewLinkHtml ?? '';
  const year = new Date().getFullYear();

  return `<html dir="ltr" lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.headline)}</title>
  </head>
  <body style="background-color:#ffffff;margin:0 auto;font-family:${FONT_STACK};">
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:37.5em;margin:0 auto;padding:0 20px;">
      <tbody>
        <tr style="width:100%">
          <td>

            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:32px;">
              <tbody>
                <tr>
                  <td>
                    <img alt="HFSE International School" height="auto" src="${LOGO_URL}" style="display:block;outline:none;border:none;text-decoration:none" width="160" />
                  </td>
                </tr>
              </tbody>
            </table>

            <h1 style="color:${COLOR_INK};font-size:28px;font-weight:700;margin:30px 0 16px;padding:0;line-height:36px;">
              ${escapeHtml(input.headline)}
            </h1>

            ${input.bodyHtml}

            ${ctasHtml}

            ${reviewHtml}

            <hr style="margin:32px 0;border:none;border-top:1px solid ${COLOR_HAIRLINE};" />

            <p style="font-size:12px;line-height:20px;color:${COLOR_FOOTER};text-align:left;margin-bottom:4px;">
              +65 6451 0080<br />
              223 Mountbatten Road, #01-08, Singapore 398008
            </p>

            <p style="font-size:12px;line-height:20px;color:${COLOR_FOOTER};text-align:left;margin-bottom:4px;">
              PEI Registration No.: 201541283N<br />
              Valid: 26 March 2025 – 25 March 2029
            </p>

            <p style="font-size:12px;line-height:20px;color:${COLOR_FOOTER};text-align:left;">
              © ${year} HFSE International School. All rights reserved.
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Clean compile. The new file has no callers yet but must type-check on its own.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/email-frame.ts
git commit -m "feat(notifications): add HFSE-branded email-frame primitive"
```

---

## Task 3: Refactor `email-parents-publication.ts` to use the frame

**Files:**

- Modify: `lib/notifications/email-parents-publication.ts`

**Goal:** drop the inline `<div style="font-family: Arial...">` shell, render via `renderEmailFrame()`, swap the generic "Open parent portal" button for action-specific copy ("View {term} report card") that still points at `${NEXT_PUBLIC_PARENT_PORTAL_URL}` per the spec's parent-side decision (no portal-side deep-link route exists for report cards).

- [ ] **Step 1: Replace the inline HTML block with a frame call**

Open `lib/notifications/email-parents-publication.ts`. Replace the block from `const subject = ...` through the closing `};` of the `html` constant (currently lines 69–103) with:

```ts
const subject = `Report card available — ${sectionLabel} · ${termLabel}`;
const windowLine = `${new Date(args.publishFrom).toLocaleString('en-SG')} → ${new Date(
  args.publishUntil
).toLocaleString('en-SG')}`;

const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      Dear Parent,
    </p>
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      The ${escapeHtml(termLabel)} report card for <strong>${escapeHtml(sectionLabel)}</strong> is now
      available to view on the HFSE parent portal.
    </p>
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 24px;">
      <strong>Viewing window:</strong><br/>
      <span style="font-family:monospace;color:#475569;">${escapeHtml(windowLine)}</span>
    </p>
  `;

const html = renderEmailFrame({
  headline: "Your child's report card is available",
  bodyHtml,
  ctas: [
    {
      label: `View ${termLabel} report card`,
      href: portalUrl,
    },
  ],
  reviewLinkHtml: `
      <p style="font-size:14px;line-height:24px;color:#1d1c1d;margin:0 0 16px;">
        Sign in at the parent portal with the same email and password you use
        for enrolment. If you have trouble signing in, please contact the
        school registrar.
      </p>
    `,
});
```

- [ ] **Step 2: Update imports**

At the top of `lib/notifications/email-parents-publication.ts`, change the imports block to:

```ts
import { Resend } from 'resend';
import { getParentEmailsForSection } from '@/lib/supabase/admissions';
import { requireCurrentAyCode } from '@/lib/academic-year';
import { createServiceClient } from '@/lib/supabase/service';
import { escapeHtml, renderEmailFrame } from '@/lib/notifications/email-frame';
```

- [ ] **Step 3: Rename the local `portalUrl` reference**

The existing code reads `NEXT_PUBLIC_PARENT_PORTAL_URL` early and aborts when missing. Confirm that block is preserved verbatim. The variable `portalUrl` is consumed inside the new `renderEmailFrame` call as the CTA's `href` — no other change.

- [ ] **Step 4: Verify build passes**

Run: `npx next build`
Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/email-parents-publication.ts
git commit -m "feat(notifications): rebrand parent publication email to HFSE corporate frame"
```

---

## Task 4: Refactor `email-pfile-reminder.ts` and update `runNotify`

**Files:**

- Modify: `lib/notifications/email-pfile-reminder.ts`
- Modify: `lib/p-files/notify-helpers.ts`

**Goal:** extend `ReminderContext` with required `enroleeNumber` + `ayCode` fields, render via `renderEmailFrame()`, build the parent-portal upload deep-link URL. Updating `runNotify` in the same task because the type change otherwise breaks the build between commits.

- [ ] **Step 1: Extend `ReminderContext` and add the URL builder**

Open `lib/notifications/email-pfile-reminder.ts`. Update the imports at the top:

```ts
import { Resend } from 'resend';

import { escapeHtml, renderEmailFrame } from '@/lib/notifications/email-frame';
```

Update `ReminderContext` (around line 20) to:

```ts
export type ReminderContext = {
  studentName: string;
  level: string | null;
  section: string | null;
  slotKey: string;
  slotLabel: string;
  statusKind: SlotStatusKind;
  expiryDateIso: string | null; // for expired / expiringSoon
  kind?: ReminderKind; // default 'renewal' for back-compat
  /** Enrolee number for the AY whose docs slot is being chased. Used to
   *  build the parent-portal upload deep-link. */
  enroleeNumber: string;
  /** AY code in canonical uppercase form (e.g. 'AY2026'). Lower-cased to
   *  the `ay{YYYY}` URL slug per KD #53 when constructing the deep-link. */
  ayCode: string;
};
```

Add a new helper above `renderReminder`:

```ts
function parentPortalUploadUrl(
  portalUrl: string,
  enroleeNumber: string,
  ayCode: string
): string {
  // Lowercased 4-digit AY slug per KD #53.
  const ayCodeLower = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
  return `${portalUrl}/admission/enrolments/application/${encodeURIComponent(enroleeNumber)}?academicYear=${ayCodeLower}`;
}
```

- [ ] **Step 2: Replace the body of `renderReminder`**

Replace the entire `export function renderReminder(ctx: ReminderContext): RenderedReminder { ... }` block (currently lines 93–183) with:

```ts
export function renderReminder(ctx: ReminderContext): RenderedReminder {
  const portalUrl =
    process.env.NEXT_PUBLIC_PARENT_PORTAL_URL ?? 'https://enrol.hfse.edu.sg';
  const descriptor = statusDescriptor(ctx);
  const kind: ReminderKind = ctx.kind ?? 'renewal';

  // Subject branching matches the existing kind split.
  const subject =
    kind === 'initial-chase'
      ? `Document follow-up needed: ${ctx.slotLabel} for ${ctx.studentName}`
      : `Document renewal needed: ${ctx.slotLabel} for ${ctx.studentName} (${descriptor})`;

  const sectionLabel =
    ctx.level && ctx.section
      ? `${ctx.level} ${ctx.section}`
      : (ctx.level ?? ctx.section ?? '');

  const headline =
    kind === 'initial-chase'
      ? `${ctx.slotLabel} required to complete application`
      : `${ctx.slotLabel} ${descriptor}`;

  const ctaLabel =
    kind === 'initial-chase'
      ? `Upload ${ctx.slotLabel} for ${ctx.studentName}`
      : `Re-upload ${ctx.slotLabel} for ${ctx.studentName}`;

  const ctaHref = parentPortalUploadUrl(
    portalUrl,
    ctx.enroleeNumber,
    ctx.ayCode
  );

  const expiryLine = ctx.expiryDateIso
    ? `<p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 12px;">
         <strong>Document expiry:</strong>
         <span style="font-family:monospace;color:#475569;">${escapeHtml(
           new Date(ctx.expiryDateIso).toLocaleDateString('en-SG', {
             year: 'numeric',
             month: 'long',
             day: 'numeric',
           })
         )}</span>
       </p>`
    : '';

  const bodyParagraph =
    kind === 'initial-chase'
      ? `Please upload the <strong>${escapeHtml(ctx.slotLabel)}</strong> for
         <strong>${escapeHtml(ctx.studentName)}</strong>${
           sectionLabel ? ` (${escapeHtml(sectionLabel)})` : ''
         }
         to continue the application. Our records show this document ${escapeHtml(descriptor)}.`
      : `Please re-upload the <strong>${escapeHtml(ctx.slotLabel)}</strong> for
         <strong>${escapeHtml(ctx.studentName)}</strong>${
           sectionLabel ? ` (${escapeHtml(sectionLabel)})` : ''
         }.
         Our records show this document ${escapeHtml(descriptor)}.`;

  const footerParagraph =
    kind === 'initial-chase'
      ? `Sign in at the parent portal with the same email and password you use
         for enrolment, then upload the document under your enrolment
         details page. If you have already submitted this document, please
         contact the school admissions office to confirm receipt.`
      : `Sign in at the parent portal with the same email and password you use
         for enrolment, then re-upload the document under your enrolment
         details page. If you have already submitted this document, please
         contact the school registrar to confirm receipt.`;

  const bodyHtml = `
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      Dear Parent / Guardian,
    </p>
    <p style="font-size:16px;line-height:26px;color:#1d1c1d;margin:0 0 16px;">
      ${bodyParagraph}
    </p>
    ${expiryLine}
  `;

  const html = renderEmailFrame({
    headline,
    bodyHtml,
    ctas: [{ label: ctaLabel, href: ctaHref }],
    reviewLinkHtml: `
      <p style="font-size:14px;line-height:24px;color:#1d1c1d;margin:0 0 16px;">
        ${footerParagraph}
      </p>
    `,
  });

  return { subject, html };
}
```

- [ ] **Step 3: Update `runNotify` in `notify-helpers.ts` to pass the new fields**

Open `lib/p-files/notify-helpers.ts`. In the `sendReminder({ ... }, recipients)` call (currently around lines 167–178), add the two new fields:

```ts
const result = await sendReminder(
  {
    studentName: fullName(app),
    level: (statusRow.classLevel as string | null) ?? null,
    section: (statusRow.classSection as string | null) ?? null,
    slotKey: ctx.slotKey,
    slotLabel: slot.label,
    statusKind,
    expiryDateIso: slotExpiry,
    kind: ctx.kind ?? 'renewal',
    enroleeNumber: ctx.enroleeNumber,
    ayCode: ctx.ayCode,
  },
  recipients
);
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build`
Expected: Clean compile. The new required fields on `ReminderContext` are now satisfied at the only call site (`runNotify`).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/email-pfile-reminder.ts lib/p-files/notify-helpers.ts
git commit -m "feat(notifications): rebrand pfile-reminder email + add parent-portal upload deep-link"
```

---

## Task 5: Refactor `email-change-request.ts` with action CTAs

**Files:**

- Modify: `lib/notifications/email-change-request.ts`

**Goal:** drop `baseFrame()`, render the 4 templates via `renderEmailFrame()`, add CTAs per the spec's matrix:

- `notifyRequestFiled` → 2 buttons (`Approve` primary navy + `Reject` destructive red) + 1 secondary text link "To review the request, click here".
- `notifyRequestApproved` → 1 button "View approved request".
- `notifyRequestRejected` → 1 button "View declined request".
- `notifyRequestApplied` → 1 button "View applied change".

All change-request CTAs deep-link to `/markbook/change-requests?req=<id>` (with `&action=approve|reject` for the two action buttons), built as absolute URLs via `NEXT_PUBLIC_SIS_URL`.

- [ ] **Step 1: Replace the file's helpers with frame-aware ones**

Open `lib/notifications/email-change-request.ts`. Replace the import block and the `baseFrame` / `escapeHtml` helpers (currently lines 1–112) with:

```ts
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

function changeRequestUrl(
  requestId: string,
  action?: 'approve' | 'reject'
): string {
  const base = process.env.NEXT_PUBLIC_SIS_URL;
  if (!base) {
    console.warn(
      '[notify] NEXT_PUBLIC_SIS_URL unset — change-request email CTAs will use relative URLs and may not navigate from email clients'
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
    console.warn(
      '[notify] skipping change-request email: RESEND_API_KEY unset'
    );
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
  html: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const devTo =
    process.env.NODE_ENV !== 'production' ? 'ace.vizserve@gmail.com' : null;
  for (const to of recipients) {
    try {
      const res = await resend.emails.send({
        from,
        to: devTo ?? to,
        subject,
        html,
      });
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
        </tr>`
        )
        .join('')}
    </table>
  `;
}
```

- [ ] **Step 2: Replace `notifyRequestFiled` with the 3-CTA variant**

Replace the `export async function notifyRequestFiled(...)` block (currently lines 116–138) with:

```ts
// Fired on: POST /api/change-requests (teacher files a request)
// Recipients: the request's primary + secondary approvers (per KD #41).
// Has 2 primary buttons (Approve navy, Reject red) + 1 secondary text link.
export async function notifyRequestFiled(
  req: RequestSummary,
  approverEmails: string[]
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
      {
        label: 'Approve',
        href: changeRequestUrl(req.id, 'approve'),
        variant: 'primary',
      },
      {
        label: 'Reject',
        href: changeRequestUrl(req.id, 'reject'),
        variant: 'destructive',
      },
      {
        label: 'To review the request, click here',
        href: changeRequestUrl(req.id),
        variant: 'secondary-text',
      },
    ],
  });

  return sendAll(t.resend, t.from, approverEmails, subject, html);
}
```

- [ ] **Step 3: Replace the remaining 3 templates with 1-CTA variants**

Replace `notifyRequestApproved`, `notifyRequestRejected`, `notifyRequestApplied` (currently lines 142–225) with:

```ts
// Fired on: PATCH approve
// Recipients: the teacher who filed it + all registrar users.
export async function notifyRequestApproved(
  req: RequestSummary,
  teacherEmail: string,
  applierEmails: string[]
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0 };

  const recipients = Array.from(
    new Set([teacherEmail, ...applierEmails])
  ).filter(Boolean);
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
  teacherEmail: string
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
  approverEmails: string[]
): Promise<{ sent: number; failed: number }> {
  const t = getTransport();
  if (!t) return { sent: 0, failed: 0 };

  const recipients = Array.from(
    new Set([teacherEmail, ...approverEmails])
  ).filter(Boolean);
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
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build`
Expected: Clean compile.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/email-change-request.ts
git commit -m "feat(notifications): rebrand change-request emails + add Approve/Reject CTAs"
```

---

## Task 6: Add `controlledOpen` API to `ChangeRequestDecisionButtons`

**Files:**

- Modify: `app/(markbook)/markbook/change-requests/decision-buttons.tsx`

**Goal:** add an optional `controlledOpen?: { action: 'approve' | 'reject'; nonce: string } | null` prop and an `onControlledOpenConsumed?: () => void` callback. When `controlledOpen` flips from null → non-null, the dialog opens with the corresponding action and auto-focuses per these rules:

- `action === 'approve'` → focus the dialog's primary Confirm button (decision-note is optional).
- `action === 'reject'` → focus the decision-note textarea (the existing component disables Confirm until a note is typed; auto-focusing Confirm would land on a disabled control).

The `nonce` field is a tracking token — the parent passes a fresh nonce each time it wants to (re-)open the dialog, so the effect can detect "open requested again" even when action is unchanged. The component clears `controlledOpen` to null via the callback after consuming.

- [ ] **Step 1: Update component signature + add controlled-open effect**

Open `app/(markbook)/markbook/change-requests/decision-buttons.tsx`. Replace the existing component declaration (the `export function ChangeRequestDecisionButtons(...)` block, currently lines 22–129) with:

```tsx
export type ControlledOpenRequest = {
  action: Action;
  nonce: string;
};

export function ChangeRequestDecisionButtons({
  requestId,
  controlledOpen,
  onControlledOpenConsumed,
}: {
  requestId: string;
  controlledOpen?: ControlledOpenRequest | null;
  onControlledOpenConsumed?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>('approve');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const lastNonceRef = useRef<string | null>(null);

  function openDialog(next: Action) {
    setAction(next);
    setNote('');
    setOpen(true);
  }

  // Controlled-open: when the parent sets controlledOpen with a fresh
  // nonce, open the dialog and auto-focus per action. Reject focuses the
  // textarea because rejectNeedsNote disables the Confirm button until a
  // note is typed; auto-focusing Confirm would land on a disabled button.
  useEffect(() => {
    if (!controlledOpen) return;
    if (lastNonceRef.current === controlledOpen.nonce) return;
    lastNonceRef.current = controlledOpen.nonce;
    openDialog(controlledOpen.action);
    onControlledOpenConsumed?.();
  }, [controlledOpen, onControlledOpenConsumed]);

  // After the dialog opens, focus the appropriate control on the next
  // tick (DialogContent mounts asynchronously inside a portal).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (action === 'reject') {
        noteRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, action]);

  const rejectNeedsNote = action === 'reject' && note.trim().length === 0;

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          decision_note: note.trim() ? note.trim() : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      toast.success(
        action === 'approve' ? 'Request approved' : 'Request declined'
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => openDialog('reject')}
        >
          <X className="size-3" />
          Decline
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => openDialog('approve')}
        >
          <Check className="size-3" />
          Approve
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve'
                ? 'Approve this request?'
                : 'Decline this request?'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve'
                ? 'The registrar will be notified and can apply the change on the locked sheet. The teacher is also notified.'
                : 'The teacher will be notified with the reason you provide below. This decision is terminal — the teacher will need to file a new request.'}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decision-note">
              Decision note{' '}
              <span className="text-muted-foreground">
                ({action === 'reject' ? 'required' : 'optional'})
              </span>
            </FieldLabel>
            <Textarea
              id="decision-note"
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === 'reject'
                  ? 'Explain why this request is being declined.'
                  : 'Optional note to the teacher and registrar.'
              }
              rows={4}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              onClick={() => void submit()}
              disabled={busy || rejectNeedsNote}
              className={
                action === 'reject'
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : ''
              }
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action === 'approve' ? 'Approve' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Update the imports**

Update the import block at the top of `decision-buttons.tsx` to add `useEffect` and `useRef`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build`
Expected: Clean compile. The `Textarea` and `Button` components from shadcn already forward refs (`Textarea` is a `forwardRef<HTMLTextAreaElement>`, `Button` likewise). If the build errors on the `ref` props, double-check the component definitions in `components/ui/` are forwardRef-based (they should be in this codebase per shadcn defaults).

- [ ] **Step 4: Commit**

```bash
git add app/\(markbook\)/markbook/change-requests/decision-buttons.tsx
git commit -m "feat(change-requests): add controlled-open API to decision-buttons"
```

---

## Task 7: Wire URL-param-driven dialog open into the data table

**Files:**

- Modify: `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx`
- Modify: `app/(markbook)/markbook/change-requests/page.tsx`

**Goal:** the page accepts `?req=<id>&action=approve|reject`. The data table reads them on mount, scrolls the row into view, sets the matching row's `controlledOpen` prop, clears the URL params via `router.replace`, and toasts on edge cases (row not in the current filter / view, request already decided, malformed action).

- [ ] **Step 1: Extend `searchParams` shape on the page**

Open `app/(markbook)/markbook/change-requests/page.tsx`. Update the `searchParams` type and destructuring (currently lines 11–22) to:

```tsx
}: {
  searchParams: Promise<{ sheet_id?: string; req?: string; action?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  const { role } = sessionUser;
  if (!role || (role !== 'school_admin' && role !== 'superadmin' && role !== 'registrar')) {
    redirect('/');
  }
  const canDecide = role === 'school_admin' || role === 'superadmin';

  const { sheet_id, req: reqParam, action: actionParam } = await searchParams;
```

Update the `<ChangeRequestsDataTable ... />` call near the bottom (currently lines 102–106) to pass the new params:

```tsx
<ChangeRequestsDataTable
  rows={rows}
  canDecide={canDecide}
  initialSheetIdFilter={sheet_id}
  initialRequestId={reqParam ?? null}
  initialAction={
    actionParam === 'approve' || actionParam === 'reject' ? actionParam : null
  }
/>
```

- [ ] **Step 2: Extend the data-table component to accept the new props + run the open effect**

Open `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx`. Update the props block (currently lines 61–69) to:

```tsx
export function ChangeRequestsDataTable({
  rows,
  canDecide,
  initialSheetIdFilter,
  initialRequestId,
  initialAction,
}: {
  rows: AdminRequestRow[];
  canDecide: boolean;
  initialSheetIdFilter?: string;
  initialRequestId?: string | null;
  initialAction?: 'approve' | 'reject' | null;
}) {
```

- [ ] **Step 3: Add the URL-param-driven open effect**

Inside the same component, after the existing `useState` block (around line 73), add the controlled-open state + the effect that processes the URL params on mount:

```tsx
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();

// Map of requestId → the controlledOpen request handed to the matching
// ChangeRequestDecisionButtons row. Setting an entry causes that row's
// dialog to open (with auto-focus per action). Cleared once consumed.
const [controlledByRow, setControlledByRow] = React.useState<
  Record<string, { action: 'approve' | 'reject'; nonce: string }>
>({});

// Run once on mount. If `?req=<id>` is present, find the row and either
// open the action dialog (if action is set + status is pending + user
// can decide) or just scroll + toast otherwise. Always clear the URL
// params after handling so a refresh doesn't re-trigger.
React.useEffect(() => {
  if (!initialRequestId) return;

  const row = rows.find((r) => r.id === initialRequestId);

  if (!row) {
    toast.error("This request isn't visible in the current view.");
    clearReqParams();
    return;
  }

  // Scroll into view on the next tick so the table has rendered.
  window.setTimeout(() => {
    const el = document.getElementById(`change-request-row-${row.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);

  if (!initialAction) {
    // Just a review link — no dialog to open. Highlight only.
    clearReqParams();
    return;
  }

  if (row.status !== 'pending') {
    toast.info(`This request was already ${row.status}.`);
    clearReqParams();
    return;
  }

  if (!canDecide) {
    toast.error('You do not have permission to decide this request.');
    clearReqParams();
    return;
  }

  setControlledByRow((prev) => ({
    ...prev,
    [row.id]: { action: initialAction, nonce: `${row.id}:${Date.now()}` },
  }));
  clearReqParams();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

function clearReqParams() {
  const next = new URLSearchParams(searchParams?.toString() ?? '');
  next.delete('req');
  next.delete('action');
  const queryString = next.toString();
  router.replace(queryString ? `${pathname}?${queryString}` : pathname);
}

function consumeControlledFor(requestId: string) {
  setControlledByRow((prev) => {
    if (!(requestId in prev)) return prev;
    const next = { ...prev };
    delete next[requestId];
    return next;
  });
}
```

Update the existing `useState` declarations to use `React.useState` for consistency with the new code, OR keep the existing `useState`-direct calls and just import `React` once at the top. Since the file already does `import * as React from "react";`, both forms work; the existing `useState` calls don't need changing.

- [ ] **Step 4: Add row id + thread the controlled-open prop**

Locate the `<TableRow key={r.id}>` line (currently around line 213). Add an HTML id and update the `<ChangeRequestDecisionButtons>` invocation:

```tsx
                <TableRow id={`change-request-row-${r.id}`} key={r.id}>
                  ...
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/markbook/grading/${r.grading_sheet_id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary">
                        Sheet
                        <ArrowUpRight className="size-3" />
                      </Link>
                      {canDecide && r.status === "pending" && (
                        <ChangeRequestDecisionButtons
                          requestId={r.id}
                          controlledOpen={controlledByRow[r.id] ?? null}
                          onControlledOpenConsumed={() => consumeControlledFor(r.id)}
                        />
                      )}
                    </div>
                  </TableCell>
```

- [ ] **Step 5: Update imports**

At the top of `change-requests-data-table.tsx`, add `usePathname`, `useRouter`, `useSearchParams` from `next/navigation` and `toast` from `sonner`. Final import block:

```tsx
'use client';

import { ArrowUpRight, CalendarIcon, Filter, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CHANGE_REQUEST_STATUS_CONFIG,
  type ChangeRequestStatus,
} from '@/lib/markbook/change-request-status';
import { cn } from '@/lib/utils';
import { ChangeRequestDecisionButtons } from './decision-buttons';
```

- [ ] **Step 6: Verify build passes**

Run: `npx next build`
Expected: Clean compile.

- [ ] **Step 7: Commit**

```bash
git add app/\(markbook\)/markbook/change-requests/change-requests-data-table.tsx app/\(markbook\)/markbook/change-requests/page.tsx
git commit -m "feat(change-requests): handle ?req&action URL params on the list page"
```

---

## Task 8: Sample-send script + inbox verification

**Files:**

- Create: `scripts/send-email-samples.ts`

**Goal:** a deletable Node script that constructs realistic fixture data, calls every email renderer, and sends the result via Resend with the dev-redirect forced on. Running it lands every variant in `ace.vizserve@gmail.com` so the user can spot-check rendering across Gmail/Outlook + click the deep-links.

The script bypasses route handlers — it imports the renderers directly and feeds them fixture data. It does NOT touch the DB or any audit-log path. After verification, the user can `git rm scripts/send-email-samples.ts`.

- [ ] **Step 1: Create the script**

Create `scripts/send-email-samples.ts` with:

```ts
/**
 * One-off email sample sender for the rebrand verification step.
 *
 * Sends one rendered HTML of every transactional template via Resend to
 * ace.vizserve@gmail.com (forced; ignores NODE_ENV). Run with:
 *
 *   npx tsx scripts/send-email-samples.ts
 *
 * Prerequisites:
 *   - .env.local has RESEND_API_KEY set
 *   - .env.local has NEXT_PUBLIC_PARENT_PORTAL_URL set (any value works for visual)
 *   - .env.local has NEXT_PUBLIC_SIS_URL set (any value works for visual)
 *
 * Delete this file after verification — it's not part of the runtime app.
 */

import { config } from 'dotenv';
import { Resend } from 'resend';

import { renderReminder } from '@/lib/notifications/email-pfile-reminder';
import {
  notifyRequestApplied,
  notifyRequestApproved,
  notifyRequestFiled,
  notifyRequestRejected,
} from '@/lib/notifications/email-change-request';

config({ path: '.env.local' });

const TO = 'ace.vizserve@gmail.com';

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY missing — set it in .env.local');
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL ?? 'HFSE SIS <noreply@hfse.edu.sg>';

  // ---- Parent publication ---- //
  // Renderer doesn't expose a pure render function; reproduce its output
  // shape inline by importing renderEmailFrame and constructing the body.
  const { renderEmailFrame, escapeHtml } =
    await import('@/lib/notifications/email-frame');
  {
    const sectionLabel = 'P5 Acacia';
    const termLabel = 'Term 2';
    const portalUrl =
      process.env.NEXT_PUBLIC_PARENT_PORTAL_URL ?? 'https://enrol.hfse.edu.sg';
    const windowLine = `${new Date().toLocaleString('en-SG')} → ${new Date(Date.now() + 7 * 86_400_000).toLocaleString('en-SG')}`;
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
    await send(
      resend,
      from,
      `Report card available — ${sectionLabel} · ${termLabel}`,
      html
    );
  }

  // ---- P-File reminder: renewal / expired ---- //
  {
    const { subject, html } = renderReminder({
      studentName: 'Aarav Khanna',
      level: 'P5',
      section: 'Acacia',
      slotKey: 'passport',
      slotLabel: 'Passport',
      statusKind: 'expired',
      expiryDateIso: new Date(Date.now() - 12 * 86_400_000).toISOString(),
      kind: 'renewal',
      enroleeNumber: 'E2026-0042',
      ayCode: 'AY2026',
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: renewal / expiring soon ---- //
  {
    const { subject, html } = renderReminder({
      studentName: 'Maya Tan',
      level: 'S2',
      section: 'Lotus',
      slotKey: 'motherPassport',
      slotLabel: "Mother's Passport",
      statusKind: 'expiringSoon',
      expiryDateIso: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      kind: 'renewal',
      enroleeNumber: 'E2026-0107',
      ayCode: 'AY2026',
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: initial-chase / missing ---- //
  {
    const { subject, html } = renderReminder({
      studentName: 'Noah Lim',
      level: 'P3',
      section: null,
      slotKey: 'birthCert',
      slotLabel: 'Birth Certificate',
      statusKind: 'missing',
      expiryDateIso: null,
      kind: 'initial-chase',
      enroleeNumber: 'E2027-0009',
      ayCode: 'AY2027',
    });
    await send(resend, from, subject, html);
  }

  // ---- P-File reminder: initial-chase / rejected ---- //
  {
    const { subject, html } = renderReminder({
      studentName: 'Saanvi Iyer',
      level: 'P1',
      section: null,
      slotKey: 'idPicture',
      slotLabel: 'ID Picture',
      statusKind: 'rejected',
      expiryDateIso: null,
      kind: 'initial-chase',
      enroleeNumber: 'E2027-0034',
      ayCode: 'AY2027',
    });
    await send(resend, from, subject, html);
  }

  // ---- Change request: filed (3-CTA approver email) ---- //
  const sampleReq = {
    id: '00000000-0000-0000-0000-0000000000aa',
    grading_sheet_id: '11111111-1111-1111-1111-111111111111',
    field_changed: 'ww_scores',
    current_value: '16',
    proposed_value: '18',
    reason_category: 'scoring_correction',
    justification:
      'Re-marked W2 after a paper review with the lead teacher. Original mark was a transcription error.',
    requested_by_email: 'teacher.subject@hfse.test',
    requested_at: new Date().toISOString(),
    student_label: 'Aarav Khanna · P5 Acacia',
    sheet_label: 'Math · P5 · T2',
  };
  await notifyRequestFiled(sampleReq, [TO]);

  // ---- Change request: approved ---- //
  await notifyRequestApproved(
    {
      ...sampleReq,
      reviewed_by_email: 'school.admin@hfse.test',
      decision_note: 'Confirmed by lead teacher.',
    },
    TO,
    [TO]
  );

  // ---- Change request: rejected ---- //
  await notifyRequestRejected(
    {
      ...sampleReq,
      reviewed_by_email: 'school.admin@hfse.test',
      decision_note: 'Cannot adjust without a re-mark form on file.',
    },
    TO
  );

  // ---- Change request: applied ---- //
  await notifyRequestApplied(sampleReq, TO, [TO]);

  console.log('Done. Check ace.vizserve@gmail.com');
}

async function send(
  resend: Resend,
  from: string,
  subject: string,
  html: string
) {
  const r = await resend.emails.send({ from, to: TO, subject, html });
  if (r.error) {
    console.error('send failed:', subject, r.error);
  } else {
    console.log('sent:', subject);
  }
}

void main();
```

- [ ] **Step 2: Run the script**

Run: `npx tsx scripts/send-email-samples.ts`
Expected: 9 lines of `sent: ...` output (1 publication + 4 reminders + 4 change-request templates), one final `Done.` line. No `send failed:` lines.

If `npx tsx` is not installed, run `npm i -D tsx` first.

- [ ] **Step 3: Manual inbox verification**

Open `ace.vizserve@gmail.com` (Gmail web). Verify:

1. **Visual** — every email shows the HFSE logo at the top, system-font headlines, navy buttons, school address + PEI registration footer.
2. **Approve / Reject buttons** on the "New grade change request" email render side-by-side with different colors (navy + red).
3. **CTAs deep-link correctly** — clicking the parent-publication "View Term 2 report card" lands on the parent portal home; clicking the p-file reminder "Re-upload Passport for Aarav" lands on `https://.../admission/enrolments/application/E2026-0042?academicYear=ay2026`; clicking the change-request "Approve" lands on `${NEXT_PUBLIC_SIS_URL}/markbook/change-requests?req=00000000-...&action=approve` (which will toast "isn't visible in the current view" because the fixture id doesn't exist in the DB — expected).
4. **Quick check on Outlook web** for table rendering (the side-by-side button table is the most fragile bit).

- [ ] **Step 4: Commit (script + plan completion)**

```bash
git add scripts/send-email-samples.ts
git commit -m "chore(scripts): add deletable email-sample sender for rebrand verification"
```

After verification, the user may delete the script:

```bash
git rm scripts/send-email-samples.ts
git commit -m "chore(scripts): remove email-sample sender (verification complete)"
```

---

## Self-review

**1. Spec coverage:** every spec section maps to a task.

- Visual rebrand → Tasks 2 + 3 + 4 + 5
- Action-specific CTAs (parent emails) → Tasks 3 + 4
- Approver Approve/Reject + secondary review link → Tasks 5 + 6 + 7
- Auth-required deep-link flow → Tasks 6 + 7
- New env var → Task 1
- Sample-send verification → Task 8

**2. Placeholder scan:** no TBDs, every code step shows complete code, every shell step shows the exact command + expected output.

**3. Type consistency:** `EmailFrameInput`, `EmailCta`, `ReminderContext`, `ControlledOpenRequest` introduced once and re-used verbatim. `controlledOpen?: ControlledOpenRequest | null` matches the data-table consumer's typing.

**4. Spec ↔ plan alignment notes:**

- The spec's "any admissions-side initial-chase callers identified during the implementation pass" reduces to _zero_ additional callers — `runNotify` is the single funnel through which both p-files and admissions chase emails flow (per KD #70). Task 4 is the only place the new fields plumb through.
- `escapeHtml` is now exported from `email-frame.ts` and used consistently across all 3 modules — closes a latent escape gap on `email-pfile-reminder.ts` (the original code interpolated `studentName` and `slotLabel` unescaped).
