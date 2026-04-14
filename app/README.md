# HFSE Markbook

Web app that replaces manual Google Sheets grading at **HFSE International School, Singapore**. Teachers enter raw scores; the server computes quarterly grades, enforces locking with audit trail, and produces printable report cards.

One registrar, ~90 students × 4 terms × ~12 subjects. Volume is small; correctness and auditability are not.

## Stack

- **Next.js 16** (App Router, Turbopack, TypeScript)
- **Supabase** (Postgres + Auth) — single shared project, also hosts the admissions tables
- **Tailwind CSS v4** (`@theme inline` in `app/globals.css` — no `tailwind.config.*`)
- **shadcn/ui** primitives + Radix UI (Dialog, Select, Checkbox, Tooltip, Label)
- **Vercel** deployment target
- Report cards use the browser's **Print / Save as PDF**; a Python/WeasyPrint service was planned originally and deferred — see `docs/sprints/development-plan.md` Sprint 6.

## Repository layout

This repo is nested — the Next.js project lives in `app/`, not at the root. Vercel's **Root Directory** must be set to `app`.

```
hfse-markbook/
├── CLAUDE.md                   ← contract: hard rules, stack conventions, gotchas
├── docs/
│   ├── context/                ← project-overview, grading system, schema, API routes, design system
│   └── sprints/development-plan.md
└── app/                        ← the Next.js project (THIS README's directory)
    ├── app/                    ← App Router pages
    │   ├── (auth)/login/
    │   ├── (dashboard)/grading/     ← teacher path
    │   ├── (dashboard)/admin/       ← registrar path
    │   ├── (dashboard)/report-cards/
    │   └── api/                     ← all route handlers
    ├── components/
    │   ├── ui/                 ← shadcn primitives + PageShell / PageHeader / Surface
    │   ├── grading/            ← score-entry-grid, letter-grade-grid, lock-toggle, totals-editor
    │   └── admin/              ← teacher-assignments-panel
    ├── lib/
    │   ├── supabase/           ← client / server / service / middleware clients
    │   ├── auth/               ← role gate, route gate, NAV_BY_ROLE
    │   ├── compute/            ← quarterly.ts + annual.ts (both with self-tests)
    │   ├── audit/              ← grade change diffing
    │   └── sync/               ← admissions → grading sync
    ├── supabase/migrations/    ← 001 schema, 002 numerics, 003 teacher_assignments, 004 RLS v1, 005 RLS teacher scoping
    └── proxy.ts                ← Next 16 middleware — auth + role gate (renamed from middleware.ts)
```

## Hard rules (the short version)

These come from `CLAUDE.md` — read that file before writing code.

1. **Formula must return 93** on the canonical P1 Patience × Math test case. `lib/compute/quarterly.ts` self-tests at module load.
2. **All grade computation is server-side.** Clients send raw scores, never computed values.
3. **Blank ≠ zero.** `null` means "did not take", `0` means "took it, scored zero".
4. **`studentNumber` is the only stable student ID** — `enroleeNumber` resets each AY, never cross-link with it.
5. **Post-lock edits require `approval_reference`** + append one row per changed field to `grade_audit_log`.
6. **Grade entries and audit logs are append-only.** Withdrawn students stay in `section_students` with `enrollment_status='withdrawn'`.
7. **Design system is binding.** All colors/fonts/radii come from `app/globals.css` via shadcn semantic tokens — never hardcode hex/oklch, never use `slate-*`/`zinc-*`/`gray-*`. See `docs/context/09-design-system.md`.

## Roles

Stored in Supabase `app_metadata.role`. One of: `teacher`, `registrar`, `admin`, `superadmin`.

Route-level access is enforced by `proxy.ts`; UI nav is driven by `NAV_BY_ROLE` in `lib/auth/roles.ts`.

Teacher row-level scoping uses the `teacher_assignments` table (`user × section × subject × role`) with two role values: `form_adviser` (one per section) and `subject_teacher` (one per section × subject).

## Getting started

### 1. Install

```bash
cd app
npm install
```

### 2. Environment

Copy the example and fill in your Supabase project values:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=        # server-only, bypasses RLS — never expose to the browser
PDF_SERVICE_URL=             # reserved, leave blank
```

### 3. Database

Apply migrations in order to your Supabase project. Either via CLI:

```bash
supabase db push
```

Or by pasting each file from `supabase/migrations/` into the Supabase SQL editor in order (001 → 002 → 003 → 004 → 005). Then run `supabase/seed.sql` for AY2026 reference data (levels, subjects, sections, terms, subject_configs).

### 4. Create your first user

Supabase dashboard → Authentication → Users → invite by email. After the user sets a password, open their row and set `app_metadata` to:

```json
{ "role": "registrar" }
```

(Or `teacher` / `admin` / `superadmin`.)

### 5. Run

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/login`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build — also runs the `quarterly.ts` self-test at module load; a failing test aborts the build |
| `npm run start` | Serve a production build locally |
| `npm run lint` | ESLint |

## Next.js 16 gotchas

These differ from Next 15 and from typical training data. If something looks wrong, consult `node_modules/next/dist/docs/`.

- **`middleware.ts` is renamed to `proxy.ts`**. The exported function must be named `proxy`. See `app/proxy.ts`.
- `cookies()`, `headers()`, `params`, `searchParams` are **async** — always `await`.
- Use `@supabase/ssr`, never the deprecated `@supabase/auth-helpers-nextjs`.
- Use `next/navigation` for redirects in server components, never `next/router`.

## Deployment

Target is **Vercel**, with **Root Directory set to `app`**. Environment variables required in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (mark as sensitive). After the first deploy, update Supabase → Authentication → URL Configuration to add the Vercel domain as both the Site URL and a redirect URL — otherwise `/api/auth/callback` will reject the login redirect.

Full deploy checklist (git init, Vercel project creation, Supabase redirect URLs, smoke test): see the deployment notes in `docs/sprints/development-plan.md` Sprint 6.

## Reference docs

| Doc | Read when… |
|---|---|
| `CLAUDE.md` | Every task — contract for what ships |
| `docs/sprints/development-plan.md` | Status snapshot + current sprint |
| `docs/context/01-project-overview.md` | Onboarding |
| `docs/context/02-grading-system.md` | Grade computation or formula |
| `docs/context/03-workflow-and-roles.md` | Permissions, locking, workflow |
| `docs/context/04-database-schema.md` | DB tables / queries |
| `docs/context/05-report-card.md` | Report card UI / PDF |
| `docs/context/06-admissions-integration.md` | Admissions sync |
| `docs/context/07-api-routes.md` | API contracts |
| `docs/context/09-design-system.md` | Any UI work — tokens, components, forbidden patterns |
