---
name: project-layout
description: Directory tree for routes, libs, components, migrations. Read when creating new files, moving code between modules, or deciding where a new route or lib lives.
load: on-demand
---

<!-- Stable rule. NOT auto-loaded. Read via the Read tool when relevant. Edit only with explicit user approval. -->

## Project layout

Single deployable at the repo root. App Router lives in `app/`; there is no wrapper subdirectory.

```
proxy.ts                         auth + role gate
app/(auth)/login/
app/(dashboard)/                 neutral shell: /, /account, redirect stubs
app/(markbook)/markbook/         grading, report-cards, sections, change-requests, audit-log
app/(attendance)/attendance/     dashboard (analytics) + sections/ (picker, KD #55) + [sectionId] (daily writer, KD #47)
app/(evaluation)/evaluation/     form-class-adviser writeups (KD #49)
app/(admissions)/admissions/     pre-enrolment funnel (KD #51)
app/(parent)/parent/             SSO landing + report card view
app/(p-files)/p-files/           documents repository
app/(records)/records/           enrolled students (cross-year via studentNumber) + dashboard + audit
app/(sis)/sis/                   admin hub: ay-setup, calendar, sections, sync-students, admin/{approvers,discount-codes,evaluation-checklists,school-config,settings,subjects,users}
app/api/                         one folder per resource
lib/                             auth, compute, audit, schemas, <module>/{queries,mutations,dashboard,drill}.ts; lib/sis/{environment,seeder}/* for the test-AY flow (KD #52); lib/dashboard/* shared dashboard primitives — range.ts (preset resolution + delta math), windows.ts (term/AY windows, uses service client per KD #54), insights.ts (per-module narrative engines); lib/<module>/drill.ts owns DrillRow shape(s) + buildDrillRows + applyTargetFilter + defaultColumnsForTarget per KD #56
components/                      ui (shadcn) + per-module folders + <module>-sidebar.tsx + module-switcher.tsx; components/dashboard/* shared dashboard UI — DashboardHero, ComparisonToolbar, MetricCard (with `drillSheet` slot), InsightsPanel, ActionList, DrillDownSheet (universal toolkit), charts/{trend,comparison-bar,donut,sparkline}-chart.tsx; components/<module>/drills/{<module>-drill-sheet,chart-drill-cards}.tsx for drill wrappers
supabase/migrations/             001 → 026_ay_slug_4digit
docs/superpowers/                specs/ + plans/ — brainstorming spec docs and implementation plans produced by superpowers skills (not binding; living design artefacts)
```
