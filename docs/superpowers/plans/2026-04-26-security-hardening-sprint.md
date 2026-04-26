# Security hardening sprint (planned — not yet started)

> **Status:** scoped, not started. Picked up the day after the 32nd-pass polish + branch merge (`feat/dashboard-drilldowns` → `main`).
> **Author:** dictated by the user as the next-sprint candidate after asking "what's best in the long run?" for security work.

## Context

The codebase has matured through Sprints 22–25 (drill-down framework, perf hardening, dashboards, task-oriented layouts, polish pass). Feature work has plateaued; the right next investment is security.

**Current security posture (surveyed 2026-04-26):**

- 66 API routes; 63 of them call `requireRole` / `getSessionUser` — auth coverage is ~95% complete (3 routes don't — verify intentional).
- 121 service-role uses across those routes (~2 per route) — **RLS is not the load-bearing wall**. Migration `025_ay_tables_rls.sql` literally says: *"in practice the SIS uses service-role everywhere so it didn't matter."*
- Only 3 RLS migrations ever shipped (`004_tighten_rls`, `005_rls_teacher_scoping`, `025_ay_tables_rls`) — RLS is defense-in-depth, not the primary gate.
- **Auth model:** route-level role gates (`requireRole`) + `audit_log` (Hard Rule #6) are the load-bearing security walls.

**Threat model assumed:** single school (HFSE), internal staff, ~1 registrar + ~5 admin users, plus parents (null-role users via SSO handoff). Not productized for multiple schools, no regulatory scrutiny beyond PDPA Singapore.

If the threat model changes (multi-tenant productization, FERPA-equivalent compliance), revisit Option C below.

---

## Three sprint framings considered

| Sprint shape | Effort | Coverage | Verdict |
|---|---|---|---|
| **A. Quick wins triage** | 2-3 days | `npm audit`; verify the 3 unauth'd routes; grep for `SUPABASE_SERVICE_KEY` client leaks; cookie SameSite/Secure flags; env-var review | Too shallow for student PII + grades; will need to be redone every 6-12 months |
| **B. Targeted hardening pass** ✅ Recommended | 1-2 weeks | A + per-route authz audit + drill API row-scoping audit + CSV export role gates + audit-log coverage check | Fixes the real exposure surface for the current trajectory |
| **C. Comprehensive security sprint** | 3-4 weeks | B + full RLS rebuild (cookie-scoped client + RLS becomes primary gate; service-role only at trust boundaries) + Storage bucket policies + parent SSO token hardening + rate limiting + OWASP Top 10 pass | Trades one bug class for another (forgotten `requireRole` → wrong RLS policy); RLS bugs fail silently as "no rows" instead of 403s, harder to debug. Worth it only if multi-tenant or under regulatory scrutiny. |

**Decision: B + a small mechanical follow-up to make the gate impossible to forget.**

The architectural choice (service-role + route gates) was made deliberately and is internally consistent. Switching to RLS-as-primary is a multi-week refactor that introduces a new bug class without eliminating the underlying need for vigilance. Better long-run move: harden what we have + add tooling so future PRs can't skip the gate.

---

## Sprint scope (B + lint follow-up)

### Bite 1 — Quick wins (1 day)

- `npm audit` baseline; resolve any `high`/`critical`
- Verify the 3 routes without `requireRole` / `getSessionUser` are intentionally public (likely candidates: `/api/parent/enter` SSO handoff, `/api/health`-style probes if any). Document why each is unauth'd in an inline comment.
- Grep for `SUPABASE_SERVICE_KEY` and any `process.env.SUPABASE_SERVICE_KEY` reference in client-bundled code. Confirm the key never crosses into a `'use client'` file or a `NEXT_PUBLIC_*` env var.
- Cookie audit: confirm Supabase auth cookies have `SameSite=Lax` (or `Strict` where viable) + `Secure` in production. Confirm no auth state leaks via URL.
- Vercel env-var review: confirm `SUPABASE_SERVICE_KEY` + `RESEND_API_KEY` are server-only (no `NEXT_PUBLIC_` prefix anywhere).

### Bite 2 — Per-route authz correctness audit (3-4 days)

Walk every API route and verify:
1. `requireRole(...)` allows only roles that *should* mutate that resource — not just "is logged in"
2. The `requireRole` allowlist matches what's documented in `lib/auth/roles.ts::ROUTE_ACCESS` for the same path prefix
3. For routes that operate on a resource (`/api/grading-sheets/[id]/...`), the role check is followed by a *resource ownership check* where applicable (e.g. teacher can only mutate sheets for their assigned section + subject pairs)

Report drift in a checklist; fix in commits batched by module.

### Bite 3 — Drill API row-scoping audit (2 days)

Drill APIs are the highest-risk read surface — they expose underlying rows en masse. Verify:
- Teacher drill APIs (Markbook, Evaluation) filter to assigned sections only — no cross-teacher leak
- Admin drill APIs respect AY scope — no cross-AY leak (e.g. an admin querying AY2025 drill data while AY2026 is current)
- CSV exports use the same row scope as JSON drill responses (no "JSON filtered, CSV unfiltered" gap)
- All drill loaders reject `target` values not in their allowlist (no SQL injection / path traversal via target param)

### Bite 4 — Audit-log coverage check (1 day)

Hard Rule #6 says "Grade entries and audit logs are append-only." Verify:
- Every mutating API route writes to `audit_log` (or its specialized `grade_audit_log` for grade changes)
- The `actor_id` field is correctly populated from the authenticated session (not `null`, not a service-role placeholder)
- Soft-deletes (status flips, e.g. `'withdrawn'`) write audit rows, not just the row mutation

### Bite 5 — Storage bucket policy verification (½ day)

P-Files uploads write to the `parent-portal` Supabase Storage bucket. Verify:
- Bucket is private (no public read)
- Read access is gated via signed URLs only, generated server-side after `requireRole` check
- No client-side direct upload paths bypass the route-level role gate

### Bite 6 — ESLint custom rule: every API route must gate (1 day)

Add a custom ESLint rule (or simpler: a `npm run lint:authz` grep script in `package.json`) that:
- Walks every `app/api/**/route.ts`
- Fails CI if the file doesn't import either `requireRole` from `@/lib/auth/require-role` or `getSessionUser` from `@/lib/supabase/server`
- Allowlist file at `.eslintrc-authz-allowlist.txt` for the 3 known-public routes (with reasons)

This is the "follow-up to make the gate impossible to forget." Once shipped, the `requireRole` discipline becomes self-enforcing instead of relying on per-PR vigilance.

### Bite 7 — Documentation + KD (½ day)

- New KD #58: "Route-level authz is the load-bearing security gate; RLS is defense-in-depth. Every API route must call `requireRole` or `getSessionUser` (CI-enforced). Service-role usage is the default but must be preceded by an authn+authz check."
- Update `docs/context/03-workflow-and-roles.md` with the security model section
- CLAUDE.md session-context entry for the sprint

### Bite 8 — Verification (½ day)

- `npx next build` clean
- Browser smoke test as each role: confirm previously-allowed flows still work
- `npm audit` re-baseline (no new criticals)
- New ESLint rule passes against current codebase

---

## Critical files to touch (per bite)

```
# Bite 1
package.json                                         # npm audit
app/api/parent/enter/route.ts                        # verify intentionally public
proxy.ts                                             # cookie audit

# Bite 2
app/api/**/route.ts                                  # all 66 routes
lib/auth/roles.ts                                    # ROUTE_ACCESS reference
lib/auth/require-role.ts                             # gate impl

# Bite 3
app/api/{markbook,evaluation,attendance,admissions,records,p-files,sis-admin}/drill/[target]/route.ts
lib/<module>/drill.ts                                # row-scope helpers

# Bite 4
lib/audit/log-action.ts                              # central audit writer
lib/audit/log-grade-change.ts                        # specialized for grade_audit_log

# Bite 5
(out of code; Supabase dashboard inspection + new migration if policies need tightening)
supabase/migrations/029_storage_policies.sql         # if needed

# Bite 6
.eslintrc-authz-allowlist.txt                        # NEW
package.json                                         # add lint script
.github/workflows/ci.yml                             # NEW (or update) — runs the lint script

# Bite 7
.claude/rules/key-decisions.md                       # new KD #58
docs/context/03-workflow-and-roles.md
CLAUDE.md
docs/sprints/development-plan.md
```

---

## Out of scope (deliberately deferred)

- **Full RLS rebuild** (Option C): explained above — trades bug class for bug class, multi-week refactor, only worth it if threat model expands.
- **Rate limiting**: nothing in the system today is at risk of abuse from the existing user pool. Worth revisiting if parent portal traffic patterns change.
- **OWASP Top 10 pen-test**: useful but exhaustive; defer until pre-productization or pre-external-audit.
- **Secrets rotation playbook**: no current incident driving this; document as a TODO when it arrives.
- **Authz unit tests**: would be valuable but blocked on the test framework setup sprint (separate cross-cutting backlog item).

---

## Success criteria

- All 66 API routes verified to call `requireRole` or `getSessionUser`; allowlist documented for any exceptions
- ESLint / CI rule prevents new unauth'd routes from shipping
- Drill APIs row-scoped per role + AY; CSV exports match JSON scope
- Audit-log coverage verified for every mutation
- Storage bucket private + signed-URL only
- KD #58 documented; security model section added to `03-workflow-and-roles.md`
- `npx next build` clean; `npm audit` no high/critical
