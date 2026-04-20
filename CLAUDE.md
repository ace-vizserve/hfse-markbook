# HFSE SIS — Claude Instructions

A Student Information System for HFSE International School, Singapore. It centralizes enrollment, grades, documents, and student records in one place, all tied to a single student profile. The app is organized into modules — Markbook (grades / report cards), P-Files (documents), Admissions (applicant pipeline), SIS (profiles / family / discount codes / document validation) — that are surfaces of one system, not sibling apps. The module switcher moves between them; the shared student record is the backbone. This file is the contract for everything that ships. Read it first.

## Always Do First

- **Invoke the 'ui-ux-pro-max@ui-ux-pro-max-skill' skill** before writing frontend code, every session, no exceptions.

## Reference docs

| Doc                                         | Read when...                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| `docs/sprints/development-plan.md`          | Starting any task — has status snapshot + current sprint |
| `docs/context/01-project-overview.md`       | Onboarding                                               |
| `docs/context/02-grading-system.md`         | Anything touching grade computation or formula           |
| `docs/context/03-workflow-and-roles.md`     | Permissions, locking, workflow                           |
| `docs/context/04-database-schema.md`        | DB tables / queries                                      |
| `docs/context/05-report-card.md`            | Report card UI / PDF                                     |
| `docs/context/06-admissions-integration.md` | Admissions sync                                          |
| `docs/context/07-api-routes.md`             | API contracts                                            |
| `docs/context/09-design-system.md`          | Any UI work — tokens, components, what NOT to build      |
| `docs/context/10-parent-portal.md`          | Parent portal handoff, admissions DDL, parent flow       |
| `docs/context/11-performance-patterns.md`   | Any new page — auth/cache/parallel/loading checklist     |
| `docs/context/12-p-files-module.md`         | P-Files module — document types, statuses, architecture  |
| `docs/context/13-sis-module.md`             | Records module — Phases 1–3 shipped; replacing Directus      |
| `docs/context/14-modules-overview.md`       | Cross-module work — architecture, shared identity, data contract, navigation |
| `docs/context/15-markbook-module.md`        | Grading / report-card / attendance work — module scope doc |
| `docs/context/16-attendance-module.md`      | Attendance module — agreed frame (hybrid placement, daily-only Phase 1); schema pending HFSE Excel |
| `docs/context/17-process-flow.md`           | Cross-module lifecycle + soft gates + auto-completions — design sketch, no schema changes for v1 |
| `docs/context/18-ay-setup.md`               | Superadmin AY-rollover wizard — design sketch; copy-forward + parent-portal coordination |

## Hard rules — never violate

These are non-negotiable. Code that breaks any of them does not ship.

### 1. Formula must return 93 on the canonical test case

Input: `WW=[10,10]/max=[10,10]`, `PT=[6,10,10]/max=[10,10,10]`, `QA=22/30`, weights `40/40/20`. Expected `quarterly_grade=93`. Verified by `lib/compute/quarterly.ts` self-test on module load — if it throws at build time, stop and fix before anything else.

### 2. All grade computation is server-side

Clients send raw scores and receive computed PS / Initial / Quarterly. Never compute in the browser. Single source of truth: `lib/compute/quarterly.ts`.

### 3. Blank ≠ Zero

`null` = "did not take the assessment", excluded from both numerator and denominator. `0` = "took it, scored zero", included in both. `ScoreInput` preserves this through string-level local state — empty string → `null`, `"0"` → `0`.

### 4. `studentNumber` is the only stable student ID

Never use `enroleeNumber` — it resets each AY. Cross-year linking always goes through `studentNumber` from the admissions tables.

### 5. Post-lock edits require `approval_reference`

Any PATCH to a locked sheet must include a non-empty `approval_reference` in the body. Server returns 400 if missing. Each changed field appends one row to `grade_audit_log`.

### 6. Grade entries and audit logs are append-only

Removing a score sets it to `null` with an audit entry. Withdrawn students stay in `section_students` with `enrollment_status='withdrawn'`. Audit log is never updated or deleted; unlocking does not purge it.

### 7. Design system is binding; `app/globals.css` is the only source for tokens

All UI must conform to `docs/context/09-design-system.md`. Colors, fonts, radius, and shadows are defined exactly once in `app/globals.css` and consumed through shadcn semantic Tailwind classes (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`, `bg-chart-1…5`, `bg-sidebar*`, etc.). **Never** hardcode `#rrggbb`, `oklch(...)`, or use `slate-*` / `zinc-*` / `gray-*` Tailwind utilities in `app/` or `components/`. **Never** redefine tokens in component code or in a `tailwind.config.*` file — Tailwind v4 has no JS config in this project. To change a color, edit `globals.css`.

## Tech stack

- **Next.js 16** (App Router, Turbopack, TypeScript) — single deployable at the repo root
- **Supabase** (Postgres + Auth, `@supabase/ssr`) — single shared project also hosting admissions tables
- **Tailwind CSS v4** via `@tailwindcss/postcss` (no `tailwind.config.js`)
- **`tw-animate-css`** — Tailwind v4 animation utilities (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`). Imported in `app/globals.css`; `.animate-in` / `.animate-out` are overridden with longhand `animation-*` properties there because the package's minified shorthand doesn't parse.
- **`react-hook-form` + `zod` + `@hookform/resolvers`** + shadcn `Form` primitive (`components/ui/form.tsx`) — canonical stack for any submit-based form. Schemas live in `lib/schemas/`.
- **`sonner`** via shadcn `components/ui/sonner.tsx` — canonical toast system. `<Toaster />` mounted once in `app/layout.tsx` (light theme, top-right, richColors). All action feedback flows through `toast.success` / `toast.error`, not inline `<Alert>` blocks.
- **`@tanstack/react-table`** + **`recharts`** — canonical data-table and charting engines for dashboards
- **`pdf-merger-js`** — server-only PDF merger for P-Files upload pipeline. When staff select multiple PDFs in the upload dialog, the API route merges them into a single `.pdf` before writing to Storage. Marked in `next.config.ts::serverExternalPackages` so the `pdf-lib` transitive doesn't trip the bundler.
- **Vercel** — deployment target (Root Directory: repo root / blank)
- **PDF generation deferred** — browser Print / Save as PDF covers current volume. If automation is needed later, prefer Puppeteer-in-Next.js over the original Python/WeasyPrint plan.

### Next.js 16 gotchas

These differ from Next 15 and from typical training data. Authoritative reference: `node_modules/next/dist/docs/`.

- **`middleware.ts` is renamed to `proxy.ts`**. The exported function must be named `proxy`. See `proxy.ts` at the repo root.
- `cookies()`, `headers()`, `params`, `searchParams` are async — always `await`.
- Use `@supabase/ssr`, never the deprecated `@supabase/auth-helpers-nextjs`.
- Use `next/navigation` for redirects in server components, never `next/router`.

## Project layout

Single deployable at the repo root. The Next.js project lives directly in the repo root — there is no `app/` wrapper subdirectory. The `app/` directory below is the Next.js **App Router**, not a subproject.

```
hfse-markbook/
├── proxy.ts                  ← auth + role gate (renamed from middleware.ts)
├── app/                      ← App Router
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── page.tsx          ← root `/` — single dashboard; admin content inlined, role-gated
│   │   ├── account/          ← /account: self-serve password change (all roles)
│   │   ├── grading/          ← teacher path: list, [id] grid, advisory comments, requests (my change requests)
│   │   ├── admin/            ← /admin redirects to /; nested routes live here (admissions, sections, sync, audit-log, change-requests)
│   │   │   └── admissions/   ← Sprint 7 Part A full dashboard (pipeline, funnel, outdated, etc)
│   │   └── report-cards/     ← HTML preview + browser print + publication window
│   ├── (parent)/parent/      ← parent portal SSO landing + report card view
│   │   ├── enter/            ← token-fragment handoff from enrol.hfse.edu.sg
│   │   └── report-cards/     ← parent-scoped report card view
│   ├── (p-files)/p-files/    ← P-Files module: dashboard, [enroleeNumber] student detail, audit-log (module-scoped)
│   ├── (records)/records/    ← Records module: dashboard, students list + detail (4 tabs), discount-codes, audit-log
│   ├── (sis)/sis/            ← SIS Admin hub: /sis (landing), /sis/ay-setup (wizard), /sis/admin/approvers (superadmin)
│   └── api/                  ← all routes (one folder per resource; incl. api/admissions/export, api/p-files/[enroleeNumber]/{upload,revisions}, api/sis/{search,students/[enroleeNumber]/{profile,family/[parent],stage/[stageKey]},ay-setup,admin/approvers}, api/users/approvers)
├── lib/
│   ├── supabase/             ← client / server / service / middleware / admissions helpers
│   ├── auth/                 ← roles, require-role, teacher-assignments
│   ├── compute/              ← quarterly.ts + annual.ts (both with self-tests)
│   ├── audit/                ← log-action.ts (generic) + log-grade-change.ts (legacy)
│   ├── notifications/        ← email-parents-publication.ts + email-change-request.ts (Resend)
│   ├── report-card/          ← build-report-card.ts (shared staff+parent fetch)
│   ├── admissions/           ← dashboard.ts — cached read-only query helpers for /admin/admissions
│   ├── p-files/              ← document-config.ts + queries.ts + mutations.ts — P-Files module data layer
│   ├── sis/                  ← queries.ts (Records reads) + ay-setup/{queries,admissions-ddl}.ts (wizard helpers) + approvers/queries.ts (per-flow approver lookup)
│   ├── change-requests/      ← sidebar-counts.ts — per-role pending-count badge query
│   ├── schemas/              ← zod schemas shared by RHF forms (and by API routes once server validation is adopted)
│   ├── academic-year.ts      ← getCurrentAcademicYear / requireCurrentAyCode
│   ├── csv.ts                ← toCsvValue + buildCsv — shared RFC-4180 escape used by every /api/**/export route
│   └── sync/                 ← students planner, snapshot loader, normalizers
├── components/grading/       ← score-entry-grid, lock-toggle, totals-editor, use-approval-reference (shadcn Dialog hook replacing window.prompt), ...
├── components/admin/         ← teacher-assignments-panel, publish-window-panel, publication-status
├── components/admissions/    ← pipeline-cards, funnel/by-level/assessment/referral charts, outdated table, ay-switcher
├── components/report-card/   ← report-card-document (shared render, print CSS)
├── components/ui/            ← shadcn primitives (button/card/table/field/form/select/tabs/dropdown-menu/sheet/dialog/alert-dialog/sonner/popover/calendar/...) + DateTimePicker wrapper + PageShell layout wrapper
├── components/p-files/        ← summary-cards, completeness-table, document-card, upload-dialog (drag+drop, multi-PDF merge), history-dialog (revision viewer)
├── components/sis/            ← Records UI (student-data-table, cross-ay-search, status-badge, field-grid, enrollment-history-chips, edit-{stage,profile,family}-{dialog,sheet}) + SIS Admin UI (ay-setup-wizard, ay-switch-active-dialog, ay-delete-dialog, approver-assign-dialog, approver-revoke-button)
├── components/{app,parent,p-files,records,sis}-sidebar.tsx
├── components/module-switcher.tsx ← school_admin+admin+superadmin header dropdown: Markbook ↔ P-Files ↔ Records ↔ SIS Admin
├── supabase/
│   ├── migrations/           ← 001_initial_schema → 013_approver_assignments
│   └── seed.sql              ← AY2026 + levels + subjects + sections + terms + configs
├── docs/                     ← context docs (incl. 08-admission-dashboard.md, 10-parent-portal.md) + sprint plan
└── types/index.ts
```

## Environment variables

```bash
# .env.local (at repo root)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=              # server-only, bypasses RLS
PDF_SERVICE_URL=                   # reserved, currently unused
NEXT_PUBLIC_PARENT_PORTAL_URL=     # parent-portal dashboard, per-environment (see docs/context/10-parent-portal.md)
RESEND_API_KEY=                    # server-only, parent report-card notifications via Resend
RESEND_FROM_EMAIL=                 # optional, defaults to "HFSE SIS <noreply@hfse.edu.sg>"
```

Original plan had separate `ADMISSIONS_SUPABASE_*` vars; dropped because admissions and grading share one Supabase project. `lib/supabase/admissions.ts` reuses `createServiceClient()`.

## Key decisions

1. **Single Supabase project** for grading + admissions tables.
2. **Roles in `app_metadata.role`** (`teacher | registrar | school_admin | admin | superadmin | p-file`). No `user_roles` table. `p-file` is module-scoped to `/p-files/*`; `school_admin`, `admin`, and `superadmin` see all modules via the module switcher. Within P-Files, `school_admin` and `admin` are read-only (browse, view files, see history) — only `p-file` officers and `superadmin` can upload / replace. The `admin` vs `school_admin` split is intentional: see KD #39 (academic approvals vs operations).
3. **Teacher assignments** in `teacher_assignments` table: `(user × section × subject × role)` where role is `form_adviser` (one per section) or `subject_teacher` (one per section × subject). Gates `/api/grading-sheets` list and `PUT /api/sections/[id]/comments`.
4. **Weights per `(subject × level × AY)`** in `subject_configs`. Primary 40/40/20, Secondary 30/50/20. Never hardcoded.
5. **Max 5 WW + 5 PT slots per sheet** (`subject_configs.ww_max_slots / pt_max_slots`).
6. **Max 50 students per section.**
7. **Overall annual grade** = `T1×0.20 + T2×0.20 + T3×0.20 + T4×0.40`, rounded 2dp. See `lib/compute/annual.ts`.
8. **PDF generation deferred** — browser print covers current volume.
9. **RLS tightened** via `supabase/migrations/004_tighten_rls.sql` (JWT role gate + deny-writes on authenticated role + grade_audit_log registrar-only) and `005_rls_teacher_scoping.sql` (per-teacher row scoping on grade/student tables). Apply both before production UAT.
10. **Comprehensive audit log** in `006_audit_log.sql` (`public.audit_log` — generic `{actor, action, entity_type, entity_id, context}` rows) written from every mutating API route via `lib/audit/log-action.ts`. Historical `grade_audit_log` kept intact. **Audit log is split by module**: `/admin/audit-log` excludes rows with `action LIKE 'pfile.%'`; `/p-files/audit-log` includes *only* those rows. Both pages render via the same `AuditLogDataTable` component. Hard Rule #6 still applies.
11. **Report card publication windows** in `007_report_card_publications.sql` — per-section, per-term `(publish_from, publish_until)` gates the parent view. Registrar publishes via `/report-cards` list page. See `docs/context/10-parent-portal.md`.
12. **Parents are null-role Supabase Auth users** in the shared project. `getUserRole()` returns `null` for them; `proxy.ts` routes null-role users to `/parent/*` only. Parent↔student linkage lives in admissions `ay{YY}_enrolment_applications` (`motherEmail`/`fatherEmail`) — resolved via `getStudentsByParentEmail()` in `lib/supabase/admissions.ts`.
13. **Parent portal SSO handoff** via URL fragment at `/parent/enter`. Parents sign in once at `https://enrol.hfse.edu.sg`, click "View report card" there, arrive at the markbook with `#access_token=&refresh_token=&next=` in the URL; client-side `supabase.auth.setSession()` establishes the markbook session without a second login. See `docs/context/10-parent-portal.md` for the integration snippet.
14. **Dynamic academic year** via `lib/academic-year.ts::getCurrentAcademicYear()` — reads `academic_years WHERE is_current=true`. Never hardcode `'AY2026'` in runtime code; admissions table prefixes (`ay{YY}_enrolment_*`) are derived from the current AY code so rolling to AY2027 is a DB flag flip, not a code change.
15. **Aurora Vault palette** — core shadcn semantic tokens in `app/globals.css` `:root` are remapped to the Aurora Vault hex palette (navy `#0B1120`, indigo `#4F46E5`, ink ramp `#0F172A`→`#94A3B8`, hairline `#E2E8F0`). Raw values use the `--av-*` prefix to avoid self-reference cycles with `@theme inline`. All shadcn semantic utilities (`bg-primary`, `text-foreground`, `border-border`, `bg-card`) and explicit Aurora Vault utilities (`bg-brand-indigo`, `text-ink`, `border-hairline`) render identically — use either. Full token table and page→component matrix in `docs/context/09-design-system.md`.
16. **`@tanstack/react-table` is the canonical data-table engine** for filterable/sortable/paginated lists. Reference implementation: `app/(dashboard)/grading/grading-data-table.tsx` (dashboard-01 toolbar pattern with global search, faceted level filter, column visibility, status tabs, pagination). New data tables start from there, not from a bare `<Table>` wrapper.
17. **Parent notifications via Resend** — `lib/notifications/email-parents-publication.ts` is called from `POST /api/report-card-publications` and is idempotent via the `report_card_publications.notified_at` column (`008_publication_notified_at.sql`). Best-effort: failures log but never fail the publication. Silently no-ops when `RESEND_API_KEY` / `NEXT_PUBLIC_PARENT_PORTAL_URL` are unset, so local dev works without the dep.
18. **Admissions dashboard is read-only** — Sprint 7 Part A. All queries live in `lib/admissions/dashboard.ts`, wrapped in `unstable_cache` (10-min TTL, tag `admissions-dashboard:${ayCode}`), hitting `ay{YY}_enrolment_applications` × `ay{YY}_enrolment_status` via the service-role client. Hero lives at `/admin/admissions`; the high-signal widgets (pipeline cards + outdated table) are also inlined on the root `/` dashboard for privileged roles so there's one landing page. Outdated-row staleness uses `applicationUpdatedDate ?? created_at` as a fallback because the admissions team never stamps `*UpdatedDate` columns in practice. Superadmin-only CSV export at `/api/admissions/export`. Part B (SharePoint inquiries) remains blocked on HFSE credentials.
19. **Single dashboard for everyone** — `/admin` index redirects to `/`. Teachers see school stats + grading/report-card quick links; registrar/admin/superadmin additionally see the admissions pipeline snapshot, stale-applications table, and inline admin tools grid. Nested admin routes (`/admin/admissions`, `/admin/sections`, `/admin/sync-students`, `/admin/audit-log`) are unaffected.
20. **Forms: RHF + zod + shadcn `Form`** — every submit-based form (`login`, `change-password`, `manual-add-student`, `new-sheet`) uses `useForm` with `zodResolver`, a schema from `lib/schemas/`, and `<FormField>`/`<FormMessage>` for per-field errors. Autosave grids (`score-entry-grid`, `letter-grade-grid`, `comments-grid`, `attendance-grid`), the slot-array editor (`totals-editor`), the inline-edit publish panel, and select-only admin panels stay on raw state — RHF's submit lifecycle is a bad fit for per-cell autosave. Schemas live outside `app/` and `components/` so API routes can import them later.
21. **Feedback: toasts + dialogs, never `window.*` and never inline error alerts** — all action feedback goes through `toast.success`/`toast.error` (sonner). Destructive confirmations use shadcn `AlertDialog`; locked-sheet approval-reference prompts use shadcn `Dialog` via the shared `components/grading/use-approval-reference.tsx` hook (returns a promise-based `requireApproval()` + the dialog JSX to mount). The only remaining inline `<Alert>` is the empty-state notice in `teacher-assignments-panel.tsx` (persistent informational content, not transient feedback). Native `window.alert` / `window.confirm` / `window.prompt` are banned.
22. **Three Supabase clients, strict separation.** `createClient()` from `lib/supabase/server.ts` is the default for server components and API route reads — cookie-scoped, RLS-enforced. `createServiceClient()` from `lib/supabase/service.ts` bypasses RLS and is reserved for (a) mutating API routes that write past row-level scoping, (b) school-wide read aggregations where RLS would leak per-user shapes (dashboard stats, admissions analytics), and (c) server-only helpers like `lib/notifications/email-parents-publication.ts`. `createClient()` from `lib/supabase/client.ts` (browser) is rarely used — the only current legitimate caller is `/parent/enter` for the SSO session handoff. Client components should go through API routes, not talk to Supabase directly.
23. **API route request validation is mixed: manual for simple shapes, zod `safeParse` for complex ones.** Simple mutating routes (grading, attendance, publications, etc.) still use the manual pattern: `const body = await request.json().catch(() => null)` → inline null/required/shape checks → `NextResponse.json({ error }, { status: 400 })`. Complex routes — notably every SIS PATCH (`/api/sis/students/[enroleeNumber]/{profile,family/[parent],stage/[stageKey]}`) — import a schema from `lib/schemas/` and call `schema.safeParse(body)` → return `{ error, details: parsed.error.flatten() }` on failure. Both patterns coexist; pick based on field count. Don't migrate existing routes just to align.
24. **Client mutations: raw `fetch` + `toast.error`, no React Query.** Client components mutate via `fetch(url, { method, body })` → `if (!res.ok) throw` → `catch(e) { toast.error(e.message) }`. Reference: `components/grading/totals-editor.tsx`. The one reserved candidate for `@tanstack/react-query` is the grading grid autosave — see `docs/context/11-performance-patterns.md` §4. Everywhere else, follow the raw-`fetch` pattern and do not introduce React Query as a general dependency.
25. **Locked-sheet edits go through a structured change-request workflow, not free-text approval strings.** Sprint 9, migration `009_change_requests.sql`. Teachers file a `grade_change_requests` row (RHF form in `app/(dashboard)/grading/[id]/request-edit-button.tsx`) with target field + proposed value + reason category + justification ≥20 chars. Admin+ approve/reject at `/admin/change-requests`. Registrar applies the approved request (Path A) or logs a structured data-entry correction (Path B) via a branched dialog in `components/grading/use-approval-reference.tsx`. The entry PATCH route now rejects any `approval_reference` in the body and instead requires `change_request_id` or `correction_reason`; the server re-validates the typed value against the approved proposal and derives the `approval_reference` string itself. Hard Rule #5 still holds (every post-lock mutation writes an `approval_reference` to `grade_audit_log`) — only the client contract changed. Notification emails flow through `lib/notifications/email-change-request.ts` (Resend, best-effort).
27. **Report card has two templates: interim (T1–T3) and final (T4).** `ReportCardDocument` takes a `viewingTermNumber` prop. Interim shows terms 1–3 side by side with no Final Grade. Final shows all four terms + Final Grade column (`computeAnnualGrade`) + General Average footer (`computeGeneralAverage`) + cumulative Attendance % (`computeAttendancePercentage`). Non-examinable subjects show "Passed" in the Final Grade column. Staff view at `/report-cards/[id]?term=N` has a two-tab switcher (Interim / Final). Parent view derives the template from active publication windows. All three compute functions live in `lib/compute/annual.ts` with self-tests.
28. **Pre-publish readiness checklist** — `publish-window-panel.tsx` calls `GET /api/sections/[id]/publish-readiness?term_id=` before publishing. Checks: (a) all grading sheets locked, (b) adviser comments written, (c) attendance records entered, (d) T4-only: all four terms locked, (e) T4-only: all quarterly grades present for Final Grade. Shows a soft-warning AlertDialog with per-item pass/fail; registrar can proceed with "Publish anyway". Never hard-blocks.
29. **Dev email redirect** — in non-production (`NODE_ENV !== 'production'`), all Resend emails are redirected to a static dev address. Both `email-parents-publication.ts` and `email-change-request.ts` override the `to` field.
31. **P-Files module is a separate route group `/(p-files)/`** sharing the same app. Three-tier access: `p-file` officers and `superadmin` have full write access (upload / replace); `admin` has read-only access (browse, view, history) via the module switcher; all other roles are blocked at `proxy.ts` / layout. Reads `ay{YY}_enrolment_documents` (already populated by parent uploads via admissions portal). Dashboard at `/p-files` with per-student completeness matrix, student detail at `/p-files/[enroleeNumber]` with upload-on-behalf + revision history, module-scoped audit log at `/p-files/audit-log`. **P-Files is a repository, not a review queue** — document validation (approve/reject) is deferred to the future Records module. P-Files only writes URLs + metadata + archives prior versions on replace; it never sets `Rejected` status. Upload-on-behalf uses the `parent-portal` Storage bucket matching the admissions portal convention; multiple PDFs merge into one via `pdf-merger-js`; staff uploads auto-status to `'Valid'`. Documents grouped into non-expiring (ID picture, birth cert, educ cert, medical), student-expiring (passport, pass), and parent/guardian (conditional on parent email). Expiring slots collect structured metadata (passport number *or* pass type + expiry date) and write both `ay{YY}_enrolment_documents` and `ay{YY}_enrolment_applications` in one request. See `docs/context/12-p-files-module.md`.
32. **Dates: ISO 8601 UTC in storage and transit, display-layer local.** Timestamps flow as UTC ISO strings end-to-end (Postgres `timestamptz`, API JSON, server component props). Display conversion to Singapore local happens at render time via `new Date(iso).toLocaleString('en-SG')`. No `dayjs` / `date-fns` / `moment` is imported anywhere — don't add one (`date-fns` sits in `package.json` as a transitive of `react-day-picker` only). Publication windows (`publish_from` / `publish_until`) and audit timestamps follow the same rule. When adding new timestamp fields, keep them UTC in the DB and let the UI format them.
33. **Module switcher** — `components/module-switcher.tsx` is a shadcn `Select` rendered in all four layouts' sticky header (`app/(dashboard)/layout.tsx` + `app/(p-files)/layout.tsx` + `app/(records)/layout.tsx` + `app/(sis)/layout.tsx`). When `canSwitch` is false it renders a plain icon + label lockup. When the current user is `school_admin`, `admin`, or `superadmin`, it renders a select trigger with a stacked up/down chevron (Vercel-style) that `router.push`es between `/`, `/p-files`, `/records`, and `/sis`. `p-file` users stay locked to P-Files; `registrar` reaches Records via the sidebar nav link but never sees the switcher; teachers never reach any of them.
34. **P-Files upload pipeline (dual-table + merge + archive-on-replace).** `POST /api/p-files/[enroleeNumber]/upload` accepts multipart form data: one or more `file` entries, a `slotKey`, optional `note`, and — for expiring slots — either `passportNumber` (for passport slots) or `passType` (for pass slots), plus `expiryDate`. Behavior: 1 file → upload as-is in original extension; 2+ files → validate all are PDFs, merge via `pdf-merger-js`, store as `.pdf`. Size limits: 10 MB per file, 30 MB per request. **When a file already exists at the canonical path, the route first `move`s it to `<prefix>/<enroleeNumber>/<slotKey>/revisions/<iso>.<ext>` and inserts one row in `p_file_revisions` capturing the pre-replacement snapshot (status / expiry / passport number or pass type / optional note / actor); the new file then overwrites the canonical path.** Writes are split across two tables: the file URL + `Status='Valid'` + expiry land on `ay{YY}_enrolment_documents`; passport number / pass type + expiry are also mirrored to `ay{YY}_enrolment_applications` so the enrolment record stays authoritative. Slot → column map lives in `lib/p-files/document-config.ts::SlotMeta`. Audit action: `pfile.upload` (context flags `replaced: true` when a prior file was archived).
35. **Server-component auth uses `getSessionUser()`**, not `getUser()`. `lib/supabase/server.ts` exports `getSessionUser()` which wraps `supabase.auth.getClaims()` (local JWT verification against cached JWKS — no network round-trip) and returns `{ id, email, role: Role | null }`. All three layouts and every role-gated page use it. API routes still use `requireRole()` (which calls `getUser()` internally); the nav hot path is what matters for latency. Full rationale + migration list in `docs/context/11-performance-patterns.md` §1.
36. **P-Files revision history (`011_p_file_revisions.sql`).** Each replacement writes one `p_file_revisions` row with `{ay_code, enrolee_number, slot_key, archived_url, archived_path, status_snapshot, expiry_snapshot, passport_number_snapshot, pass_type_snapshot, note, replaced_by_user_id, replaced_by_email, replaced_at}`. Service-role only (RLS deny-all on authenticated); client reads go through `GET /api/p-files/[enroleeNumber]/revisions?slotKey=...`. Surfaced in the UI by `components/p-files/history-dialog.tsx`, triggered from each document card when a file is on file. Append-only: Hard Rule #6 applies. P-Files `DocumentStatus` type excludes `'rejected'` — document validation moves to SIS; the `uploaded` state (rendered as "Pending review") remains for parent-self-serve uploads whose raw status hasn't been validated yet.
37. **Records module (Sprint 10 Phases 1–3) is a separate route group `/(sis)/`** replacing Directus as the day-to-day admissions admin UI. Access: `registrar`, `admin`, `superadmin`. Sidebar is flat (Dashboard / Students / Discount Codes / Audit Log) so it stays stable as AYs accumulate; the AY scope is a URL-param dropdown (`?ay=AY2026`) instead of a tree node. Routes: `/sis` dashboard, `/sis/students` list (TanStack table + cross-AY search via `/api/sis/search`), `/sis/students/[enroleeNumber]` detail with 4 tabs (Profile / Family / Enrollment / Documents) + enrollment-history chip strip for returning students (matched by `studentNumber` per Hard Rule #4), `/sis/discount-codes` with create / edit / soft-delete actions, `/sis/audit-log` (module-scoped to `action LIKE 'sis.%'`; `/admin/audit-log` now excludes both `pfile.%` and `sis.%`). Reads use `lib/sis/queries.ts` wrapped in `unstable_cache` with `sis:${ayCode}` tag (600s TTL). Phase 2 writes land at three PATCH routes — `/profile` (demographics on applications row), `/family/[parent]` (father/mother/guardian columns), `/stage/[stageKey]` (one of 9 pipeline stages on status row, auto-stamping `*UpdatedDate` / `*UpdatedBy`). Phase 3 adds `POST /api/sis/discount-codes` + `PATCH /api/sis/discount-codes/[id]?op=expire?` (soft delete = endDate = today; no hard delete) plus `PATCH /api/sis/students/[enroleeNumber]/document/[slotKey]` writing `{slotKey}Status = 'Valid' | 'Rejected'` on `ay{YY}_enrolment_documents`. SIS is now the sole writer of `'Rejected'` per the cross-module contract — P-Files re-renders the state via a restored `'rejected'` case in `DocumentStatus`. Rejection reason lives in audit context only (min 20 chars, matching change-request justification). All writes use zod schemas from `lib/schemas/sis.ts` via `safeParse`, write a per-field diff (`context.changes`) to `audit_log` (actions `sis.profile.update` / `sis.family.update` / `sis.stage.update` / `sis.discount_code.{create,update,expire}` / `sis.document.{approve,reject}`), then call `revalidateTag('sis:${ayCode}', 'max')` so the next render sees fresh data. Stable IDs (`enroleeNumber`, `studentNumber`) are not in any schema — the routes 400 if they're sent. Per-student discount *grants* are not SIS's job — the external enrolment portal writes the `discount1/2/3` slot columns directly; SIS only manages the `ay{YY}_discount_codes` catalogue. P-Files cross-link: SIS Documents tab deep-links `/p-files/[enroleeNumber]#slot-{key}` and the P-Files `DocumentCard` adds `scroll-mt-20 target:` styling. See `docs/context/13-sis-module.md`.
39. **`school_admin` role separates school-operations from academic-admin work.** The `admin` role is narrow: it's the academic-admin / grade-change approval pool (principals, academic head). `school_admin` is everything else a school admin needs — AY Setup, Records day-to-day, discount codes, P-Files read, CSV exports, module switcher. **The only difference from `admin`**: `school_admin` is not eligible as an approver in the `markbook.change_request` flow and cannot approve/reject grade-change requests (`/api/change-requests/[id]` PATCH blocks them); the approver candidates filter (`lib/sis/approvers/queries.ts::listEligibleApproverCandidates`) returns `role === 'admin'` only. Everywhere else admin appears in role allow-lists, school_admin appears too. Superadmin stays reserved for destructive / IT / CEO-level ops (delete AY, manage approver list, user/role management) — superadmin is NOT in the grade-approval pool either (they manage who approves, not the approvals). HFSE mapping: Chandana + Tin = `admin`; office/operations staff = `school_admin`; Joann = `registrar`; Amier + CEO = `superadmin`.
38. **This product is a Student Information System, and modules share one student identity.** Markbook, P-Files, Admissions, and the Records module are surfaces of the same system — they read and write different facets of the same student record, not independent apps. The unifying key across modules is `studentNumber` (Hard Rule #4), not `enroleeNumber` (which resets each AY). Cross-module links (e.g. SIS Documents tab → P-Files, grading sheet → SIS student detail, report card → documents) should resolve through this shared identity. When adding new per-student data — attendance, medical, communications, incidents, etc. — treat it as another facet of the same profile, not a standalone silo. The module switcher reflects this: it moves between surfaces, not between applications.
40. **AY Setup Wizard (migration 012) + DB-driven AY switcher.** `/sis/ay-setup` is a superadmin + admin + school_admin wizard that atomically creates a new AY via `rpc('create_academic_year')`: inserts `academic_years` row + 4 terms + copies sections/subject_configs from the most-recent prior AY + creates the 4 AY-prefixed admissions tables (`ay{YY}_enrolment_*` + `ay{YY}_discount_codes`) in one transaction. `rpc('delete_academic_year')` is superadmin-only and emptiness-guarded across 10+ child tables. Switch-active flips `is_current`. All four stored functions in `012_ay_setup_helpers.sql` are `security definer`, revoke execute from public, grant to `service_role` only. DDL template source of truth: `10-parent-portal.md` §Reference DDL. AY switcher is now DB-driven via `lib/academic-year.ts::listAyCodes(client)` — the old `SUPPORTED_AYS` compile-time constant + `isSupportedAyCode()` guard were removed; adding an AY is a pure runtime operation with no code deploy.
41. **Approver routing (migration 013) — designated-approver model, scoped visibility.** `approver_assignments(user_id, flow)` maps admin users to per-flow approval pools (today: `markbook.change_request`; generalises for future flows like `sis.stage_escalation`, `attendance.correction`). Teacher's request form requires primary + secondary approvers picked from the flow's assigned list (distinct, not-self). `grade_change_requests.primary_approver_id/secondary_approver_id` snapshot the designees at submission. PATCH approve/reject enforces actor-is-designated AND `role === 'admin'` (superadmin is NOT in the grade-approval pool — they manage who approves via `/sis/admin/approvers`). Eligibility filter in `listEligibleApproverCandidates` returns only `role === 'admin'` users; school_admin is deliberately excluded. Email (`notifyRequestFiled`) narrows from broadcast to designated-only. Admin inbox server-side filters to `primary_approver_id = me OR secondary_approver_id = me OR (both NULL for legacy rows)`. Superadmin revokes via `DELETE /api/sis/admin/approvers/[id]` — forward-only (snapshotted designations on in-flight requests stay valid).
42. **Records module routes at `/records/*`; `/sis` is the SIS Admin hub.** Records module (registrar + school_admin + admin + superadmin) lives at `app/(records)/records/*` with its own sidebar (`components/records-sidebar.tsx`) and layout. SIS Admin hub at `app/(sis)/sis/*` hosts `/sis` (landing with 4 admin cards), `/sis/ay-setup`, `/sis/admin/approvers` — access gated to school_admin + admin + superadmin (approvers page tightens to superadmin only). Module switcher carries 4 entries: Markbook / P-Files / Records / SIS Admin. **Superadmin defaults to `/sis`** on navigation to `/` (redirect in `app/(dashboard)/page.tsx`) — their job is structural oversight, not Markbook daily use. Internal identifiers (API paths `/api/sis/*`, cache tag `sis:${ayCode}`, audit prefix `sis.*`, filenames `13-sis-module.md`, `lib/sis/*`, `components/sis/*`) stay unchanged for stability — renaming would invalidate historical audit rows + cache entries. The `Module` union now has four values (`"markbook" | "p-files" | "records" | "sis"`); `"records"` identifies the Records module, `"sis"` identifies the admin hub.

## Workflow

1. Read `docs/sprints/development-plan.md` for current sprint + status snapshot.
2. Build against the sprint's Definition of Done. Don't ship anything that breaks a hard rule above.
3. Verify with `npx next build` (clean compile required) and a manual happy-path test in the browser before marking anything done.
4. After meaningful work, run **`/sync-docs`** to keep this file and the dev plan accurate. The slash command surveys the repo, diffs against both docs, and applies targeted edits.
