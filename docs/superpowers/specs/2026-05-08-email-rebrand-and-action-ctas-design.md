# Email rebrand + action-CTA navigation — design

**Date:** 2026-05-08
**Status:** Spec, awaiting approval before implementation plan
**Scope:** All 3 transactional email modules in `lib/notifications/` + a small enhancement to `/markbook/change-requests` for URL-param-driven action dialogs.

## Problem

Three email modules ship today (`email-parents-publication.ts`, `email-pfile-reminder.ts`, `email-change-request.ts`). They share a copy-pasted inline-CSS frame (uppercase eyebrow → headline → body → button → footer) but each file inlines its own `<div style="...">` shell. The result has two shortcomings:

1. **Visual identity drift from the corporate brand.** HFSE has a real corporate email template (used by the parent portal for account-confirmation flows) with the HFSE logo, system-font stack, `#004aad` navy primary button, school address + PEI registration footer. The SIS emails use a generic Aurora Vault indigo (`#4F46E5`) frame instead. Recipients open an SIS email and don't immediately recognise it as "from the same school" as the parent-portal mails.
2. **No deep-link CTAs.** Parent emails ship a generic "Open parent portal" button that goes to portal home; recipients hunt through the portal to find the specific report card or document slot they need. The change-request emails ship **no button at all** — body copy says "Please review it in the SIS" and Chandana / approvers manually navigate. Approver emails specifically lack any in-email Approve / Reject path.

## Goals

- Align all 3 email modules to the HFSE corporate template (logo, system fonts, `#004aad` navy, school footer).
- Replace generic "Open parent portal" with action-specific CTAs ("View Term 2 report card", "Re-upload passport for Aarav").
- Deep-link p-file reminder emails to the parent-portal application page so parents land on the exact upload slot.
- Add **Approve** + **Reject** buttons + a "review the request" secondary link to the approver email, with auth-gated single-confirm semantics in the SIS.

## Non-goals

- Parent-portal coordination beyond URL construction. We don't add or change routes in the parent portal codebase. Deep-link routes that already exist (the document-upload path) are used; new ones are deferred.
- Magic-link / signed-token one-click Approve. The action requires a logged-in approver session; the email click is a deep-link, not an authenticated mutation. This avoids token-replay, email-forwarding, and link-preview-bot risks.
- New email templates beyond the 3 existing modules. Future templates (e.g. attendance digest) will inherit the new shared frame for free, but designing them is out of scope.
- Sender address (`RESEND_FROM_EMAIL`) changes — DMARC/SPF tied to current value; leave as-is.

A new env var IS introduced for the absolute URL the change-request CTAs link to. See "New env var" below.
- Plain-text email fallback. Not produced by current code; not adding.

## Decisions made during brainstorming

1. **Scope = all 3 modules, unified rebrand.** Implies extracting a shared frame primitive.
2. **Visual reference = the parent-portal HFSE corporate template** (logo + system fonts + `#004aad` navy + school address footer + PEI registration line + copyright). NOT a wordmark eyebrow + serif headline + signature-block direction.
3. **CTAs are action-specific deep links.** Generic "Open parent portal" replaced with task-named copy.
4. **Parent-side deep-link bridge = upload page only.** P-file reminder emails deep-link to `${PARENT_PORTAL_URL}/admission/enrolments/application/${enroleeNumber}?academicYear=${ayCodeLower}`. Publication (report card) emails stay at portal home with action-specific copy because no equivalent parent-portal route was provided; parent navigates one step via the portal's home "Report cards" button.
5. **Approver email = 2 primary buttons + 1 secondary text link.** Approve and Reject use different colors: Approve = HFSE navy `#004aad`, Reject = destructive red `#dc2626`. The secondary "to review the request, click here" text link mirrors the reference template's "if the button doesn't work" placement.
6. **Approve/Reject behaviour = auth-required deep link with one-click confirm in SIS.** Click → `/markbook/change-requests?req=<id>&action=approve|reject` → page reads params on mount, scrolls to that row, opens the existing decision-buttons dialog auto-focused on the corresponding Confirm button. Approver clicks one Confirm → existing PATCH workflow runs unchanged. No new mutation surface, no signed tokens.

## Architecture

### Shared email frame

New module: `lib/notifications/email-frame.ts`. Exports one function:

```ts
export type EmailCta = {
  label: string;
  href: string;
  variant?: 'primary' | 'destructive' | 'secondary-text'; // default 'primary'
};

export type EmailFrameInput = {
  headline: string;
  bodyHtml: string; // inner content between headline and CTAs (already escaped by caller)
  ctas: EmailCta[]; // 0..N. Multiple `primary`/`destructive` render side-by-side; `secondary-text` is a centered text link below.
  reviewLinkHtml?: string; // optional small "if the button doesn't work, copy this link..." fallback paragraph
};

export function renderEmailFrame(input: EmailFrameInput): string;
```

Frame structure (matches the reference template the user provided):

- Outer `<table align="center" width="100%" max-width:37.5em padding:0 20px>` — email-client safe.
- HFSE logo `<img>` 160px wide, served from the existing parent-portal Supabase storage public bucket. The URL is hoisted to a single constant in `email-frame.ts` so future asset rotation is one edit.
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif`.
- Title `<h1>`: 28px / line-height 36px / weight 700 / color `#1d1c1d` / margin 30px 0 16px.
- Body paragraph(s): 16px / line-height 26px / color `#1d1c1d` (inherits via `<body>`).
- CTA row: an inner `<table>` so 1 button centers and 2 buttons sit side-by-side reliably across Outlook/Gmail/Apple Mail.
- Buttons: `padding:14px 24px; border-radius:6px; text-decoration:none; font-size:16px; font-weight:600; color:white; display:inline-block;` plus per-variant background:
  - `primary` → `background:#004aad`
  - `destructive` → `background:#dc2626`
  - `secondary-text` → not a button; rendered as a centered text link `color:#004aad`, no fill.
- Optional `reviewLinkHtml` paragraph below the CTAs (12-14px, grey, with a copy-pasteable URL).
- `<hr style="margin:32px 0; border:none; border-top:1px solid #eaeaea">` divider.
- Footer block: phone (`+65 6451 0080`) + address (`223 Mountbatten Road, #01-08, Singapore 398008`) + PEI line (`PEI Registration No.: 201541283N` / `Valid: 26 March 2025 – 25 March 2029`) + copyright (`© {currentYear} HFSE International School. All rights reserved.`). All 12px / line-height 20px / color `#6b6b6b`. Year is dynamic via `new Date().getFullYear()`.

### Content-producer modules

The 3 existing modules become content producers — they render only `headline` + `bodyHtml` strings + a `ctas` array, then call `renderEmailFrame()`. The hand-written `<div style="font-family: Arial...">` shells in each file are deleted.

#### `email-parents-publication.ts`

- Headline: `"Your child's report card is available"` (unchanged).
- Body: keeps the existing greeting + window line.
- CTAs: 1 primary, label `"View Term {termNumber} report card"`, href `${NEXT_PUBLIC_PARENT_PORTAL_URL}` (portal home — by decision #4).

#### `email-pfile-reminder.ts`

- `ReminderContext` extended with two required fields: `enroleeNumber: string` + `ayCode: string`.
- Headline branches on `kind` per existing code (`"{slot} {descriptor}"` for renewal, `"{slot} required to complete application"` for initial-chase).
- Body keeps the existing copy.
- CTA URL: `${NEXT_PUBLIC_PARENT_PORTAL_URL}/admission/enrolments/application/${enroleeNumber}?academicYear=${ayCodeLower}` where `ayCodeLower = 'ay' + ayCode.replace(/^AY/i, '').toLowerCase()` per KD #53.
- CTA label: `"Re-upload {slotLabel} for {studentName}"` (renewal) or `"Upload {slotLabel} for {studentName}"` (initial-chase).
- 1 primary CTA per email.

#### `email-change-request.ts`

`baseFrame()` deleted; each `notifyRequest*` builds via `renderEmailFrame`.

- `notifyRequestFiled` — headline `"New grade change request"`. Body keeps the existing summary table + justification paragraph. CTAs:
  - 1 `primary` label `"Approve"` href `${SIS_BASE_URL}/markbook/change-requests?req=<id>&action=approve` (absolute via the new `NEXT_PUBLIC_SIS_URL` env var — see "New env var" below).
  - 1 `destructive` label `"Reject"` href `${SIS_BASE_URL}/markbook/change-requests?req=<id>&action=reject`.
  - 1 `secondary-text` label `"To review the request, click here"` href `/markbook/change-requests?req=<id>` (no action param — opens read-only view).
- `notifyRequestApproved` — headline unchanged. 1 `primary` CTA `"View approved request"` → `?req=<id>`.
- `notifyRequestRejected` — headline unchanged. 1 `primary` CTA `"View declined request"` → `?req=<id>`.
- `notifyRequestApplied` — headline unchanged. 1 `primary` CTA `"View applied change"` → `?req=<id>`.

### Action-pre-loaded change-requests page

`/markbook/change-requests` (the existing list page at `app/(markbook)/markbook/change-requests/page.tsx` + its client wrapper) reads two new search params on mount:

- `req` = change-request UUID
- `action` = `'approve' | 'reject'` (optional)

A small client effect runs once on the data-table client:

1. If `req` is present, find the matching row in the loaded request list. Scroll it into view + apply a transient highlight (`<DataTable>` already has row-id support; reuse).
2. If the request is found AND status is still pending AND `action` is set AND the current user is on the request's `approver_assignments` (KD #41), open `<ChangeRequestDecisionButtons>` for that row programmatically. Auto-focus differs by action:
   - `action=approve` — focus the dialog's primary Confirm button (decision-note is optional per the existing component).
   - `action=reject` — focus the decision-note textarea (the existing component disables Confirm until a note is typed via `rejectNeedsNote`; auto-focusing Confirm would land on a disabled control).
3. After opening, clear the `req` and `action` URL params via `router.replace` so a refresh doesn't re-trigger.

**Edge cases handled inline:**

- `req` not in the loaded list (or filter view excludes it) → call `toast.error("This request isn't visible in the current filter")`, clear params, no dialog.
- Request already decided → skip the action dialog, scroll + highlight only, `toast.info("This request was already approved/rejected/applied")`.
- Approver not assigned (KD #41 enforces — no row leaks visually anyway, since the loader already filters by assignment) → no-op (the row won't be in the list).
- Malformed `action` value → ignore the action, just open the read-only row.

The page does NOT need a per-request route (`/markbook/change-requests/[id]`). Existing list + dialog UI handles every case.

## Data flow

```
Approver email
  Click "Approve"
    └─> /markbook/change-requests?req=<uuid>&action=approve
          proxy.ts (middleware) checks session
            ├─ no session → redirect to /login?next=<original URL>
            └─ session ok →
                page RSC loads list (existing behavior)
                  client mounts, reads searchParams,
                    finds row, opens <DecisionButtons> approve dialog,
                    auto-focuses the Confirm button.
                  approver reviews summary in dialog,
                    optionally adds decision-note,
                    clicks Confirm → existing PATCH /api/change-requests/[id] (unchanged)
                  → audit row written via existing log-action.ts
                  → URL params cleared
                  → list updates via revalidation
```

```
P-file reminder email (renewal)
  ReminderContext = { ..., enroleeNumber: 'E2026-0042', ayCode: 'AY2026', ... }
  renderReminder()
    ayCodeLower = 'ay2026'
    href = `${PARENT_PORTAL_URL}/admission/enrolments/application/E2026-0042?academicYear=ay2026`
    button label = `Re-upload Passport for Aarav K.`
  sendReminder() → Resend API (best-effort per KD #16)
```

## Files

**New:**
- `lib/notifications/email-frame.ts` — shared HFSE-corporate-branded frame primitive.

**Modified:**
- `lib/notifications/email-parents-publication.ts` — drop inline shell, call `renderEmailFrame`. Update CTA copy.
- `lib/notifications/email-pfile-reminder.ts` — drop inline shell, call `renderEmailFrame`. Extend `ReminderContext` with `enroleeNumber` + `ayCode`. Build deep-link URL.
- `lib/notifications/email-change-request.ts` — drop `baseFrame`, call `renderEmailFrame` from each `notifyRequest*`. Add CTAs per matrix above.
- `app/api/p-files/[enroleeNumber]/notify/route.ts` — pass `enroleeNumber` + `ayCode` into `ReminderContext`.
- `app/api/p-files/notify/bulk/route.ts` — same.
- `lib/p-files/notify-helpers.ts` — internal helper used by both notify routes; pass-through plumbing only. Per KD #70 these same routes serve the admissions initial-chase via `module: 'p-files' | 'admissions'`, so no separate admissions email caller exists.
- `app/(markbook)/markbook/change-requests/decision-buttons.tsx` — extend the `ChangeRequestDecisionButtons` component with a controlled-open API: add an optional `controlledOpen?: { action: 'approve' | 'reject'; nonce: string } | null` prop and a `onControlledOpenConsumed?: () => void` callback. When `controlledOpen` flips from null → non-null, the component opens its dialog with the given action and auto-focuses per the rules above; the callback fires once so the parent can clear URL params. The existing in-row Approve / Decline buttons keep working unchanged. (Alternative considered: ref imperative `openFor(action)` API — rejected because controlled-open via prop is more idiomatic React + plays well with the data-table renderer.)
- `app/(markbook)/markbook/change-requests/change-requests-data-table.tsx` — read `req` + `action` URL params on mount, find the matching row, set its `controlledOpen` prop, scroll the row into view, clear the URL params via `router.replace` after the component reports consumed.

**No changes:**
- `proxy.ts` — existing session check already handles the `?next=` redirect for unauthed deep-links.
- `lib/audit/log-action.ts`, `app/api/change-requests/*` — change-request mutation surface unchanged.
- `RESEND_FROM_EMAIL` env var.

### New env var

`NEXT_PUBLIC_SIS_URL` — the absolute origin of the SIS deployment, used to build absolute URLs for the change-request CTAs (email clients can't resolve relative paths). Same per-environment shape as `NEXT_PUBLIC_PARENT_PORTAL_URL`:

- Production: `https://sis.hfse.edu.sg` (or the actual SIS production origin).
- Preview: `https://hfse-markbook-staging.vercel.app` (or the actual preview origin).
- Development: `http://localhost:3000`.

When unset, change-request emails fall back to relative URLs (`/markbook/change-requests?...`) — the buttons would be inert in most clients but the email would still send. Logged via `console.warn` like the other "best-effort" env-var degradations (KD #16 pattern).

`.env.local.example` gets a new block matching the existing `NEXT_PUBLIC_PARENT_PORTAL_URL` documentation style.

## Error handling + edge cases

- **`RESEND_API_KEY` unset** — every module already no-ops with a console warning per KD #16. Frame doesn't change that.
- **Logo image fails to load** — every email client renders the alt text `HFSE International School`. No fallback work needed.
- **Parent portal URL missing** — `email-parents-publication.ts` already early-returns when `NEXT_PUBLIC_PARENT_PORTAL_URL` is unset. The p-file reminder will need the same guard around the deep-link construction (today's code uses an inline default; with a deep-link URL the missing-env case should fall back to portal home or skip the send).
- **Change-request URL params from email click on a stale link** (request long-since decided / deleted / out of approver's filter) — handled inline in the data-table client per the edge-case list above.
- **Approver clicks Approve, then the dialog opens, then they Cancel** — no mutation. Same as today's in-app flow. URL params already cleared on dialog open so refresh doesn't re-prompt.
- **Approver opens the email link on a phone where they aren't logged in** — proxy redirects to `/login?next=...`, after auth they land back on the change-requests page with the action dialog open. Standard.

## Testing strategy

- **Visual sample run** — at the end of implementation, ship a small one-off script (`scripts/send-email-samples.ts`, deletable after) that calls each renderer with realistic fixture data and sends one of every template via Resend. The script forces the dev-redirect (KD #29) so all sends land at `ace.vizserve@gmail.com` regardless of `NODE_ENV`. Verify the rendered HTML in Gmail desktop + Gmail iOS + Outlook desktop. Templates to send: parents-publication; pfile-reminder × 4 statusKinds × 2 kinds = 8 variants (or pick 4 representative ones — expired/renewal, expiringSoon/renewal, missing/initial-chase, rejected/initial-chase); change-request × 4 (filed / approved / rejected / applied).
- **Functional (deep-link)** — manual: from the sample run above, click the Approve button in the dev-redirected `notifyRequestFiled` email, verify the change-requests page opens with the action dialog focused. Repeat for Reject (verify textarea is focused, not Confirm). Repeat with a stale `req=<deleted>` to verify the toast + clean-params path. Click a parent-portal upload deep-link from the sample p-file reminder, verify it lands on the right enrolee + AY page.
- **Type safety** — `ReminderContext` extension is a breaking type change inside this repo; `npx next build` will fail at every call site that doesn't pass the two new fields. Build = test.
- No new automated tests proposed — the existing email modules don't have unit tests; not net-new test infra in this scope.

## Migration / rollout

- **Code-only change.** No DB migrations, no env-var changes, no parent-portal coordination.
- **Backward compatibility:** None required. The frame change is invisible to recipients beyond the visual rebrand. The CTA URL changes are forward-compatible — old emails still in inboxes still link to portal home or to the existing change-requests page (both of which keep working).
- **Roll forward strategy:** ship behind no flag; the next time any of the 3 modules fires, recipients see the new template.

## Risks

- **Email-client rendering quirks.** Outlook desktop renders `<table>`-based layouts most reliably; we follow the reference template's `<table>`-first structure and avoid CSS that Outlook ignores (no flexbox, no gap, no CSS variables in inline styles).
- **Logo URL stability.** The Supabase public-storage URL is the same one already in production use by the parent portal, so a regression there would break this too — shared fate is acceptable.
- **Action-dialog auto-open relies on the data-table loading the row.** If the loader's filter excludes the targeted request (e.g. approver scrolled past it or filtered to "Approved"), the auto-open silently degrades to a toast. Acceptable per edge-case rule.
- **`?action=approve` in a forwarded email is not a security risk** because the SIS still requires the recipient's session and approver assignment — but a recipient who opens the URL on a shared device while someone else is signed in could see the dialog pre-opened against the wrong identity. Mitigated by the existing approver-assignment gate; mentioned for transparency.

## Open questions

None. All design questions resolved during brainstorming.

## Out of scope (deferred)

- Parent-portal deep-link bridge for the publication email (external dependency on a parent-portal route that doesn't exist yet).
- One-click magic-link Approve (security trade-offs deemed not worth the convenience for HFSE's volume).
- Plain-text MIME fallback.
- Email preview tooling (Storybook-for-emails / `react-email`-style preview routes).
- Attendance / Records / Admissions digest emails (not currently sent; future templates inherit the frame for free).
