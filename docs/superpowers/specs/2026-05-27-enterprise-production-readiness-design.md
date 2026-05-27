# Enterprise Production Readiness — Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Forcing function:** HFSE staff go-live next term

---

## Problem Statement

The HFSE SIS is functionally complete (120 pages, TypeScript-clean, migration 061 applied) but lacks the engineering controls required for a live production system:

1. **No automated tests** — a formula regression or bad migration surfaces only via a staff complaint, not an alert.
2. **No CI/CD gate** — a TypeScript error or broken build can ship to Vercel silently.
3. **No code quality enforcement** — formatting and lint drift accumulates without a pre-commit hook.
4. **No global error boundary** — a page crash shows a blank screen with no recovery path for staff.

The three failure modes that matter before go-live: a grade is wrong and nobody notices; a feature breaks and nobody knows; a bad deploy reaches production.

---

## Scope

### In scope

- GitHub Actions CI pipeline (typecheck + lint + test + build)
- Prettier + husky + lint-staged (pre-commit formatting enforcement)
- Branch protection on `main`
- `app/global-error.tsx` (Next.js App Router global error boundary)
- Vitest test layer for all pure compute functions

### Out of scope (explicitly deferred)

- Sentry or any third-party error tracking service — Vercel function logs cover server-side; small known user base means frontend errors surface via staff reports; global error boundary closes the blank-screen gap
- API route integration tests — require database fixtures and test seeding; post-go-live addition
- React component tests / E2E (Playwright) — post-go-live
- Full RLS audit — separate sprint, requires Supabase CLI access
- Mobile staff-facing pages — separate feature sprint
- Collaborator onboarding docs (CONTRIBUTING.md) — add when second contributor joins

---

## Pillar 1 — CI/CD Gate + Code Quality

### GitHub Actions

File: `.github/workflows/ci.yml`

**Triggers:** `push` on any branch, `pull_request` targeting `main`.

**Jobs (sequential — each depends on the previous):**

```
prettier:check → typecheck → test → build
```

| Job              | Command                  | Purpose                               |
| ---------------- | ------------------------ | ------------------------------------- |
| `prettier:check` | `npx prettier --check .` | Formatting gate — fast, fails early   |
| `typecheck`      | `npx tsc --noEmit`       | TypeScript correctness                |
| `test`           | `npx vitest run`         | Regression guard on compute functions |
| `build`          | `npx next build`         | Full production build gate            |

Sequential ordering is intentional: a formatting violation doesn't waste a 3-minute build job.

### Prettier

**Package:** `prettier`

**Config file:** `.prettierrc`

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 80,
  "semi": true,
  "tabWidth": 2
}
```

**Ignore file:** `.prettierignore`

```
.next/
node_modules/
supabase/
public/
*.md
```

**One-time format commit:** before husky is enforced, run `npx prettier --write .` and commit as `chore: apply Prettier formatting`. This avoids blocking existing code from future commits.

### Husky + lint-staged

**Packages:** `husky`, `lint-staged`

**Pre-commit hook:** runs `lint-staged` — auto-formats only staged files (no full-repo scan on every commit).

**`lint-staged` config** (in `package.json`):

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,json,css,md}": "prettier --write"
  }
}
```

Husky initialised via `npx husky init`; pre-commit script: `npx lint-staged`.

### Branch protection

On `main` in GitHub repository settings:

- Require all CI status checks to pass before merging
- Require branches to be up to date before merging
- Disallow force-push to `main`

---

## Pillar 2 — Global Error Boundary

### `app/global-error.tsx`

Next.js App Router catches RSC render crashes at this boundary. Currently missing from the repo — without it, a page-level error shows a blank screen.

**Behaviour:**

- Catches unhandled errors thrown during RSC rendering
- Renders a minimal recovery UI (error message + "Try again" button that calls `reset()`)
- Does not send errors anywhere (no Sentry) — staff can reload and report via normal channels

**Implementation:** ~20 lines, zero new dependencies. Must be a `'use client'` component; receives `error: Error` + `reset: () => void` props from Next.js.

**Design token compliance:** uses `bg-background`, `text-foreground`, `text-muted-foreground` — no hardcoded colours (Hard Rule #7).

---

## Pillar 3 — Test Layer

### Framework

**Vitest** — ESM-native, TypeScript out of the box, no Babel config required, compatible with Next.js 16 project structure.

**Config file:** `vitest.config.ts` at repo root

- Test environment: `node` (pure compute, no DOM)
- Include pattern: `__tests__/**/*.test.ts`
- TypeScript paths resolved via `vite-tsconfig-paths` plugin (handles `@/` imports)

**Test directory structure:**

```
__tests__/
  compute/
    quarterly.test.ts
    annual.test.ts
    awards.test.ts
    letter-grade.test.ts
  evaluation/
    ptc-resolver.test.ts
```

### Test scope

All tests are **pure unit tests** — deterministic functions, no database, no HTTP, no React. Each test file corresponds to one source file.

#### `lib/compute/quarterly.ts`

The canonical formula — Hard Rule #1. This file already contains a module-load self-test; the Vitest suite is the regression layer.

**Test cases:**

- **Canonical case:** WW=[10,10]/max=[10,10], PT=[6,10,10]/max=[10,10,10], QA=22/30, weights 40/40/20 → **93** (Hard Rule #1 contract)
- **Blank ≠ Zero (Hard Rule #3):** null slot excluded from numerator + denominator; 0 slot included in both — same score entry, different results
- **All null WW/PT:** entire component score is null (late enrollee with no scores yet)
- **All zero scores:** valid entry, score is computed (not null)
- **Primary weights 40/40/20** vs **Secondary weights 30/50/20** — same raw scores, different quarterly grade
- **5 WW + 5 PT slots** (KD #5 max): full slot arrays compute correctly
- **QA max varies** (KD #99): qa_max=30 vs qa_max=50 produces different PS

#### `lib/compute/annual.ts`

Annual grade formula + late-enrollee proration + general average.

**Test cases:**

- **Standard:** T1×0.20 + T2×0.20 + T3×0.20 + T4×0.40, result rounded to 1dp (KD #95)
- **T2 late-enrollee proration:** T1=null → weights redistribute to T2×0.25 + T3×0.25 + T4×0.50
- **T3 late-enrollee proration:** T1=null, T2=null → T3×0.333 + T4×0.667 (rounded)
- **All four terms null:** annual grade is null (not zero)
- **General average:** ROUND(AVERAGE(examinable subject overalls), 1dp) — only examinable subjects included
- **1dp rounding precision:** confirm 2dp drift is not re-introduced (regression for KD #95 fix)

**Proration rule (confirmed 2026-05-27):** same semantics as Hard Rule #3 — null term = not enrolled, excluded from numerator and denominator; weights redistribute proportionally over non-null terms.

#### `lib/compute/awards.ts`

Subject award + overall academic award tier assignment. IFS ladder: <88.5 → NE, ≤91.4 → Bronze, ≤95.4 → Silver, ≤99.4 → Gold (extended past 99.4 so 100 doesn't fall through).

**Test cases (all 9 boundary values):**

| Input | Expected |
| ----- | -------- |
| 88.4  | NE       |
| 88.5  | Bronze   |
| 91.4  | Bronze   |
| 91.5  | Silver   |
| 95.4  | Silver   |
| 95.5  | Gold     |
| 99.4  | Gold     |
| 99.5  | Gold     |
| 100.0 | Gold     |

- **Ineligible — withdrawn:** no award regardless of score
- **Ineligible — incomplete data:** null overall grade → no award

#### `lib/compute/letter-grade.ts`

Non-examinable subject letter derivation (KD #104).

**`numericToLetter` test cases:**

- 90–100 → A
- 85–89 → B
- 80–84 → C
- ≤79 → IP
- Boundary values: 89.9 → B, 90.0 → A, 84.9 → C, 85.0 → B

**`resolveNonExaminableLetter` test cases:**

- Override code present (UG/INC/CO/E) → override takes precedence over derived letter
- `is_na = true` → NA regardless of score or override
- No override, score present → derived letter from `numericToLetter`
- No override, no score → null

#### `lib/evaluation/ptc-resolver.ts`

Pure date math — no database. Derives which writeup term a PTC event "discusses" (KD #103).

**Test cases:**

- Apr PTC (sits in T2) → discusses T1 (most-recently-ended writeup term before PTC start)
- Nov PTC (sits in T4) → discusses T3
- Multiple PTCs resolving to same term → earliest is the deadline driver
- No PTC events → resolver returns null / empty
- PTC before any term ends → no resolved term

---

## Business Rule Resolutions

### Grade proration formula — resolved

Confirmed 2026-05-27: null term = not enrolled, excluded from weight calculation; weights redistribute proportionally over available terms. No implementation change required (matches existing `a58dfae` implementation). Tests can be written immediately.

### T4 General Average row render

Registrar should visually verify the masterfile grid renders the General Average row correctly for a T4 card before go-live. Not a code task — an acceptance test by Joann.

### Non-examinable letter legend (UG/INC/CO/E)

Joann confirmation still needed on whether UG/E are actively used at HFSE. Does not block this sprint — the override path is implemented and tested; the question is whether registrars need UI to enter those values.

---

## Timeline Guidance (2–4 weeks)

| Week    | Work                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| Day 1   | Prettier one-time format commit + husky setup + GitHub Actions CI + `app/global-error.tsx` |
| Day 2–3 | Vitest config + `quarterly.test.ts` + `annual.test.ts`                                     |
| Day 4–5 | `awards.test.ts` + `letter-grade.test.ts` + `ptc-resolver.test.ts`                         |
| Week 2  | CI passes clean, branch protection on `main`, acceptance testing with Joann                |
| Buffer  | Business rule confirmations, any compute edge cases surfaced by test writing               |

---

## Definition of Done

- [ ] `prettier --check` passes on the full codebase
- [ ] `tsc --noEmit` passes clean
- [ ] `vitest run` passes with all test cases above (no `.skip` except documented deferred items)
- [ ] `next build` passes clean in CI
- [ ] Husky pre-commit hook enforces Prettier on staged files
- [ ] Branch protection active on `main`
- [ ] `app/global-error.tsx` renders a recovery UI on RSC crash
- [ ] Hard Rule #1 canonical case asserted in `quarterly.test.ts`
- [ ] Proration test cases passing in `annual.test.ts`
- [ ] All 9 award boundary values asserted in `awards.test.ts`
- [ ] Joann has visually confirmed T4 GA row renders correctly
