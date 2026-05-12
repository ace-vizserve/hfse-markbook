# HFSE SIS — Claude Instructions

A Student Information System for HFSE International School, Singapore. Modules — Markbook, Attendance, P-Files, Records, SIS Admin — are surfaces of one student record, not sibling apps. The module switcher moves between them; `studentNumber` is the backbone.

## Stable rules — auto-loaded (every session)

These two are `@`-imported so they're always in context. Do not edit without explicit user approval.

@.claude/rules/always-do-first.md
@.claude/rules/hard-rules.md

## Stable rules — on-demand (read with the Read tool when relevant)

Not `@`-imported. Each file carries YAML frontmatter (`description`, `load: on-demand`) explaining its trigger. Read before acting when any of the "Read when..." conditions apply.

| Rule | Read when... |
| --- | --- |
| `.claude/rules/tech-stack.md` | Touching code, installing/upgrading a dep, debugging a framework behavior, or a Next.js 16 gotcha |
| `.claude/rules/project-layout.md` | Creating new files, moving code between modules, or deciding where a new route or lib lives |
| `.claude/rules/env-vars.md` | Touching `.env.local`, Supabase/auth plumbing, or Resend emails |
| `.claude/rules/key-decisions.md` | A "KD #N" reference appears in code or docs; cross-cutting architectural choices; doubt about module boundaries, roles, or conventions. The file is a thin index — open it to find the topic file under `.claude/rules/key-decisions/` that holds the KD you need, then Read that. |
| `.claude/rules/design-system.md` | Before any UI / frontend code; when choosing a shadcn primitive, token, color, or layout |
| `.claude/rules/workflow.md` | Finishing work — before reporting a task done, or at session wrap-up |

## Reference docs

| Doc | Read when... |
| --- | --- |
| `docs/sprints/development-plan.md` | Starting any task — status snapshot + current sprint |
| `docs/context/01-project-overview.md` | Onboarding |
| `docs/context/02-grading-system.md` | Grade computation / formula |
| `docs/context/03-workflow-and-roles.md` | Permissions, locking, workflow |
| `docs/context/04-database-schema.md` | DB tables / queries |
| `docs/context/05-report-card.md` | Report card UI / PDF |
| `docs/context/06-admissions-integration.md` | Admissions sync |
| `docs/context/07-api-routes.md` | API contracts |
| `docs/context/08-admission-dashboard.md` | Admissions analytics |
| `docs/context/09-design-system.md` | UI tokens, hard rules, page→component matrix, pre-delivery checklist |
| `docs/context/09a-design-patterns.md` | Craft standard, canonical patterns, semantic color discipline |
| `docs/context/10-parent-portal.md` | Parent identity, linkage, SSO handoff |
| `docs/context/10a-parent-portal-ddl.md` | Frozen admissions DDL (AY-prefixed tables) |
| `docs/context/11-performance-patterns.md` | Any new page — auth/cache/parallel/loading checklist |
| `docs/context/12-p-files-module.md` | P-Files module — document types, statuses, architecture |
| `docs/context/13-sis-module.md` | Records module |
| `docs/context/14-modules-overview.md` | Cross-module architecture, shared identity, navigation |
| `docs/context/15-markbook-module.md` | Markbook module scope |
| `docs/context/16-attendance-module.md` | Attendance module (Phase 1 + 1.1 shipped) |
| `docs/context/17-process-flow.md` | Cross-module lifecycle + soft gates |
| `docs/context/18-ay-setup.md` | Superadmin AY-rollover wizard |
| `docs/context/19-evaluation-module.md` | Student Evaluation module — FCA writeups + virtue theme (KD #49) |
| `docs/context/20-dashboards.md` | Any dashboard work — before touching a module's landing page or `lib/<module>/dashboard.ts` |
| `docs/context/21-stp-application.md` | Singapore ICA Student Pass workflow (HFSE Edutrust Certified) — `stpApplicationType` gating + STP-conditional doc slots (KD #61) |

## Session context

<!--
Scratch surface for session-learned context, temporary caveats, in-flight
investigations. Safe to edit; pruned periodically. Stable rules do NOT go
here — they live in `.claude/rules/*.md`. Sprint-by-sprint history lives in
`docs/sprints/development-plan.md` + `git log`.
-->

**Current state (2026-05-07):** Sprint 36 — drill-perf hardening + drill data correctness + UX polish + new `/records/movements` page. Headline KDs added: **#80** drill cache invalidation contract (`lib/cache/invalidate-drill-tags.ts` + `Cache-Control` on drill JSON + chart `next/dynamic` split + `<MetricCard>.drillSheet` render prop); **#81** drill primary-identifier linkification (every drill row's name links to canonical detail surface); **#82** drill scope-anchor by target (chart + drill share the same date column); **#83** enrolment movements page (audit-log-derived feed at `/records/movements` with discriminated `MovementEvent` union in `lib/sis/movements.ts`; seeded via `lib/sis/seeder/movements.ts`; new `<Switch>` shadcn primitive). KD #56 updated: in-drill scope toggle removed everywhere — page-level `<DateRangePicker>` is single source of truth. KD #79 updated: picker custom-mode no longer auto-commits on second-date pick. **Seeder data variety pass**: EX-row reasons (mc/school_activity/compassionate), assessment grades on funnel rows, `personaUpdatedDate` + apps `created_at` spread for `daysToEnroll` variance, grade_entries.created_at spread across terms, `seedPopulated` ends with `invalidateAllOperationalDrills`. P-Files seeder uses real Supabase storage URLs (image for photo slots, PDF elsewhere) + `enrolled-realistic` per-slot fill profile + KD #60 expiry dates. Misc UX: Top-active sibling tab on `/attendance`; vertical bar charts tilt -30° labels; drill titles rewritten plain English; "Mark today's attendance" quicklink. Drill-on-revisit regression fixed via callback-ref + `useState` on the virtualizer's scrollElement. **Deferred**: `seedChangeRequests` (~50 lines) and `late_reason`/`absent_reason` schema columns. **Dev DB state**: AY9999 + AY9998 sibling fixture per KD #78. Build clean.

**Future work (post-demo):**
- **Late / absent reason columns** — schema migration adding `late_reason` + `absent_reason` to `attendance_daily`, writer + drill loader + UI. Out of scope this sprint.
- **`seedChangeRequests` new function** — `grade_change_requests` table currently empty in seed; the change-requests KPI tile + drill have nothing to display until seeded. ~50 lines in `lib/sis/seeder/populated.ts`.
- Net-new charts/KPIs from purpose-alignment audit: Records "Stage not moved in ≥30d", Markbook "Teachers with incomplete sheets", Evaluation "Advisers with zero writeups", Attendance "Chronic absentees ≥10% of school days", Admissions "Conversion rate by referral source." Each = new helper + chart.
- Two-view split refactor (KD #57): extract Markbook + Evaluation page-level role conditionals into `<module>-{teacher,registrar}-view.tsx` when either page passes ~800 lines.

**Recent sprints** (full history in `docs/sprints/development-plan.md`; per-pass detail in `git log`):
- Sprint 35 (2026-05-06): compare-mode + picker rework + seeder Option C + drill perf Phase C (KDs #78–79; `AY9998` sibling fixture; virtualization + `useDeferredValue` + `React.memo` on charts).
- Sprint 34 (2026-05-06): drill-empty + dashboard correctness. PostgREST 1000-row cap → `lib/supabase/paginate.ts::fetchAllPages`; scope downgrades; Records/P-Files enrolled-only (KD #51 + #71); migrations 040–041.
- Sprint 33 (2026-05-05): RBAC consolidation. `admin` role retired into `school_admin`. Migration 039. `demo-extras.ts` wired into `seedPopulated`.
- Sprints 28–32 (2026-04-29 → 2026-05-04): see development-plan.md. Highlights: opt-in comparison + early-bird AY pipeline (KD #77, migration 038); calendar audience scope (KD #76); role-aware audit + parent sidebar-less + publishing hub (KDs #73–75); mid-year section transfer + P-Files renewal-only (KDs #67–72); parent SSO HMAC + master class templates (KDs #63–66 + migrations 030–034).


## Cross-reference note

Cross-references elsewhere in the repo such as "CLAUDE.md Hard Rule #N" or "CLAUDE.md KD #N" now resolve to `.claude/rules/hard-rules.md` and `.claude/rules/key-decisions.md` respectively. Numbering is preserved across all moves. KDs were split into per-topic files under `.claude/rules/key-decisions/` (the root file is the index + KD-to-topic map); existing "KD #N" cites still resolve via the index, and global numbering is unchanged.
