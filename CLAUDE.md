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

**Current state (2026-05-14):** Sprint 38 — workflow hardening + chronic-gap recovery + leave-quota structure + Masterfile. Eight themed deliveries since the last sync, all on `main`. (1) **Grade change-request hardening** (KD #88, migrations 044+045). (2) **Admissions document validation triage page** (KD #89). (3) **Unsynced enrolled students** (KD #90). (4) **P-Files gate relaxation** (KD #91, extends KD #71). (5) **Eval per-topic 1–5 ratings** (KD #92, migration 046). (6) **Eval teacher-owned topics** (KD #93, migration 047). (7) **Vacation-leave subtype + per-term quotas** (KD #94, migration 048). (8) **Masterfile + Subject/Overall Academic Awards** (KD #95, migration 049) — verified canonical grading spec from user (Quarterly = ROUNDDOWN integer, Subject Overall = 2dp, General Average = **1dp** — fixed 2dp drift in `computeGeneralAverage`); new `/markbook/masterfile` cross-subject grid mirrors the AY2025 Final Report Book Masterfile sheet; `lib/compute/awards.ts` with self-tested boundary cases; configurable thresholds in `school_config` (Bronze 88.5 / Silver 91.5 / Gold 95.5 / Max 100, editable in SIS Admin → School config); fixed `subjects.is_examinable` seed for the 8 letter-graded subjects the original was wrong on (`MUSIC, ARTS, PE, HE, CL, CA, PEH, PMPD`); cross-mount sidebar entries (Markbook + Records "Reports" group). **Dev DB state**: apply migrations 044 + 045 + 046 + 047 + 048 + 049 before deploying. Build clean across 109 routes.

**Future work:** Phase 2 for non-examinable letter entry (4 open Joann questions per KD #95: who enters letters and from where, complete verified letter list, whether UG/E are used, SharePoint Consolidated Form integration); Honors / High Honors / Highest Honors tiers; Sec 4 Economics supplementary card; T4 report card General Average row render verification; late/absent reason columns on `attendance_daily`; self-serve invite flow (KD #87 with `/auth/setup`); per-row overflow menu population in unified data-tables; attendance audit-log server-side pagination; two-view split refactor (KD #57) when Markbook/Evaluation pages cross ~800 lines; cron-driven auto-sync trigger for KD #90's unsynced queue; bulk Excel import → VL subtype parser (KD #94 follow-up).

**Recent sprints** (full history in `docs/sprints/development-plan.md`; per-pass detail in `git log`):
- Sprint 38 (2026-05-13 → 14): workflow hardening + chronic-gap recovery + leave-quota structure + Masterfile (KDs #88–95; migrations 044–049). Eight themed deliveries above.
- Sprint 37 (2026-05-12): demo-readiness — unified data-tables (KD #84) + StatusBadge unification + gradient sweep + drill bug audit + date-picker audit + new seeders + re-alphabetize RPC + direct-create user (KDs #85, #87); KD #52 + #82 + #84 + #7 extended.
- Sprint 36 (2026-05-07): drill-perf hardening + drill data correctness + UX polish + `/records/movements` (KDs #80–83).
- Sprint 35 (2026-05-06): compare-mode + picker rework + seeder Option C + drill perf Phase C (KDs #78–79).
- Sprint 34 (2026-05-06): drill-empty + dashboard correctness. PostgREST 1000-row cap → `fetchAllPages`; Records/P-Files enrolled-only (KD #51 + #71); migrations 040–041.
- Sprint 33 (2026-05-05): RBAC consolidation. `admin` role retired into `school_admin`. Migration 039.
- Sprints 28–32 (2026-04-29 → 2026-05-04): see development-plan.md. Highlights: KDs #63–77 + migrations 030–038.


## Cross-reference note

Cross-references elsewhere in the repo such as "CLAUDE.md Hard Rule #N" or "CLAUDE.md KD #N" now resolve to `.claude/rules/hard-rules.md` and `.claude/rules/key-decisions.md` respectively. Numbering is preserved across all moves. KDs were split into per-topic files under `.claude/rules/key-decisions/` (the root file is the index + KD-to-topic map); existing "KD #N" cites still resolve via the index, and global numbering is unchanged.
