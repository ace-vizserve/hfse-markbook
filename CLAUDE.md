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

**Current state (2026-05-20):** Sprint 40 — SOW builder + attribution. Migration 058 shipped: `sow_master_templates`, `sow_published_versions`, `sow_class_instances` tables + `sections.curriculum_track`; SOW builder at `/sis/admin/sow` (school_admin+); grading sheets display `SOW v{N}` attribution chip when a class instance exists; evaluation `TopicManagerPanel` header shows `SOW v{N}` when topics are SOW-sourced; subject weights dialog shows amber slot-reduction warning when a SOW exists for that subject; SIS Admin audit log allowlist extended with SOW actions + school calendar actions (KD #108). **Dev DB state**: migrations through 058 applied. TypeScript clean; build blocked by Google Fonts network (CI unaffected).

**Future work:** Honors tiers; Sec 4 Economics card; T4 GA row render verification; self-serve invite flow (KD #87 with `/auth/setup`); per-row overflow menus; attendance audit-log server-side pagination; cron auto-sync trigger (KD #90); VL bulk import parser (KD #94 follow-up); Joann legend confirmation for non-examinable letter values (UG/INC/CO/E). **Pending Chandana/Wynne clarifications**: (1) can teachers adjust evaluation topics per section or is Chandana's list strictly locked? (2) who encodes PTC comments — teacher or registrar? (3) grade proration formula for missing terms (Wynne). **Evaluation backlog (partially unblocked):** migration to revert `evaluation_checklist_items.section_id → level_id + curriculum_track` (KD #108 plan documented — pending Chandana sign-off); PTC comment encoding surface (pending confirmation of #2 above).

**Recent sprints** (full history in `docs/sprints/development-plan.md`; per-pass detail in `git log`):
- Sprint 40 (2026-05-20): SOW Definition/Version/Instance model migration 058 (KD #108) + SOW version attribution on grading sheets + evaluation topics + subject weights slot-reduction warning + SIS Admin audit log coverage (SOW + calendar actions).
- Sprint 39 (2026-05-20): slot metadata migration 057 (KD #105) + evaluation subject-teacher nav fix (KD #106) + evaluation topic ownership design discovery (KD #107, Chandana confirmed admin-prescribed).
- Sprint 38+ (2026-05-15 → 19): post-demo refinement — migrations 050–056 + admissions feedback + audit-log coverage + letterhead config + HBL overlay + annual letter + PTC feedback + non-examinable score entry + publish checklist hardening (KDs #98–104).
- Sprint 38 (2026-05-13 → 14): workflow hardening + chronic-gap recovery + leave-quota + Masterfile (KDs #88–95; migrations 044–049). Eight themed deliveries.
- Sprint 37 (2026-05-12): demo-readiness — unified data-tables (KD #84) + StatusBadge + gradient sweep + re-alphabetize RPC + direct-create user (KDs #85, #87).
- Sprint 36 (2026-05-07): drill-perf hardening + drill data correctness + `/records/movements` (KDs #80–83).
- Sprints 28–35 (2026-04-29 → 2026-05-06): see development-plan.md. Highlights: KDs #63–79 + migrations 030–043.


## Cross-reference note

Cross-references elsewhere in the repo such as "CLAUDE.md Hard Rule #N" or "CLAUDE.md KD #N" now resolve to `.claude/rules/hard-rules.md` and `.claude/rules/key-decisions.md` respectively. Numbering is preserved across all moves. KDs were split into per-topic files under `.claude/rules/key-decisions/` (the root file is the index + KD-to-topic map); existing "KD #N" cites still resolve via the index, and global numbering is unchanged.
