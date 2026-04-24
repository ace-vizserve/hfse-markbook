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
| `.claude/rules/key-decisions.md` | A "KD #N" reference appears in code or docs; cross-cutting architectural choices; doubt about module boundaries, roles, or conventions |
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

## Session context

<!--
Scratch surface for session-learned context, temporary caveats, in-flight
investigations. Safe to edit; pruned periodically. Stable rules do NOT go
here — they live in `.claude/rules/*.md`.
-->

- **Design-system "non-flat" primitive refresh — fully shipped 2026-04-25 on `feat/dashboard-drilldowns`** (see 26th-pass dev-plan row). Three-tier primitive system codified: **T1 chip/CTA** (Button default+destructive, Badge success+blocked, Tabs default active chip) uses brand gradient + `shadow-button`/`shadow-brand-tile`; **T1 content surface** (Alert w/ 4 variants + AlertIcon slot, DropdownMenu, Popover, Tooltip, Dialog/Sheet/AlertDialog, Sonner toast) uses solid tint + `ring-1 ring-inset` + `shadow-md`/`shadow-lg` (never gradient backgrounds); **T2 fillable** (Input, Textarea, Select trigger, Checkbox) uses hairline + inset `shadow-input` + `ring-2 ring-brand-indigo/20` focus bloom + brand-gradient checked state. New tokens: `shadow-input` flipped from 4% drop → 6% inset; `shadow-brand-tile-mint`/`-destructive`/`-amber` added. New shared primitive `components/dashboard/chart-legend-chip.tsx` (ChartLegendChip + chartLegendContent factory) powers the legend sweep — 8 recharts `<Legend>` migrations (admissions/dashboard/markbook/p-files/sis charts) + 3 hand-rolled legend migrations (wide-grid day-type dots, calendar-admin legend strip, outdated-applications staleness tiers). `StatusLegendItem` in wide-grid intentionally untouched (true grid-cell visual key, not a flat chip). `Select` → full crafted treatment this pass (skipped 25th pass). Alert absorbs §9.4 status-panel pattern; existing hand-rolled panels migrate on touch. §9.3 wash recipes intentionally preserved alongside gradient variants (dual-tier: gradient for pill chips, wash for in-table state-as-metadata). `RadioGroup`/`Switch` NOT added (YAGNI). Spec: `docs/superpowers/specs/2026-04-25-non-flat-primitive-refresh-design.md`; plan: `docs/superpowers/plans/2026-04-25-non-flat-primitive-refresh.md`.

## Cross-reference note

Cross-references elsewhere in the repo such as "CLAUDE.md Hard Rule #N" or "CLAUDE.md KD #N" now resolve to `.claude/rules/hard-rules.md` and `.claude/rules/key-decisions.md` respectively. Numbering is preserved; only the host file moved.
