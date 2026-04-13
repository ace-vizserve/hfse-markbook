---
description: Reconcile CLAUDE.md and docs/sprints/development-plan.md with the current state of the codebase. Run after meaningful work.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, TaskList, TaskGet]
---

# Sync project docs to current reality

Two files are the project's source of truth for "what's been built and what's the contract":

- `CLAUDE.md` — instructions, hard rules, tech stack, project layout, key decisions
- `docs/sprints/development-plan.md` — sprint-by-sprint status, task checkboxes, definition-of-done, deferrals backlog

Both **must** stay in sync with the actual codebase. This command is the maintenance routine that keeps them honest. Run it after any sprint, after merging a meaningful PR, or any time you suspect drift.

Optional argument (`$ARGUMENTS`) — a focus hint like `"sprint 4"`, `"env vars"`, `"project layout"`. If empty, do a full sweep.

## Workflow

### 1. Survey the codebase

Use Read / Glob / Grep / Bash (`git log --oneline -20`, `git status`, etc.) to inspect the current state. Specifically:

- **Migrations:** `app/supabase/migrations/*.sql` — what's the highest-numbered one? Any new since the last doc update?
- **API routes:** walk `app/app/api/` and list every `route.ts`. Compare to what `CLAUDE.md` and `development-plan.md` claim exists.
- **Pages:** walk `app/app/(dashboard)/` and `app/app/(auth)/` for new routes.
- **Lib modules:** new files in `app/lib/{compute,auth,sync,audit,supabase}/`.
- **Components:** new files in `app/components/{grading,admin,ui}/`.
- **Env vars:** `app/.env.local.example` — does the list match what `CLAUDE.md` documents?
- **Tech versions:** `app/package.json` — Next.js, React, Tailwind, `@supabase/*` versions still match what `CLAUDE.md` says?
- **Task list:** call `TaskList` and read recently completed / deferred tasks for hints about what shipped or got punted.

### 2. Diff against `CLAUDE.md`

For each section, check accuracy:

- **Reference docs table:** has any `docs/context/*.md` file moved or been renamed? (Rare; usually skip.)
- **Hard rules:** **NEVER edit these.** Only verify they're still enforced in code. Greps to run:
  - `grep -r "quarterly_grade !== 93" app/lib/compute/` — formula self-test still present
  - `grep -r "approval_reference" app/app/api/grading-sheets/` — post-lock gate still wired
  - `grep -r "is_locked" app/app/api/grading-sheets/\[id\]/entries/` — lock check on entry PATCH
  - `grep -rn "computeQuarterly" app/app/api/` — server-side compute (not client-side)
  - If any check comes up empty, **stop and report — a hard rule has regressed.** Do not silently update docs around it.
- **Tech stack:** version pins still match `package.json`?
- **Next.js gotchas:** any new breaking change discovered in `app/node_modules/next/dist/docs/` worth recording? Add it. (Don't proactively go hunting unless you hit one.)
- **Project layout tree:** does the tree in `CLAUDE.md` match the actual directory structure? Add new significant folders, remove stale ones. Keep it brief — leaf detail belongs in the dev plan, not here.
- **Environment variables:** match `app/.env.local.example` exactly (modulo placeholder values).
- **Key decisions:** has a new architectural choice been made? (e.g. "we added an X table", "we dropped Y service".) If yes, append; don't restructure.

**Hard limit: keep `CLAUDE.md` under 250 lines.** It loads into every prompt's context window — every line costs tokens forever. If you're tempted to add detail, ask whether it really belongs here or in `docs/sprints/development-plan.md` / a context doc instead. Prefer pointers over copies.

### 3. Diff against `docs/sprints/development-plan.md`

This file is allowed to grow; it's the long-form record.

- **Status snapshot table at the top:** every sprint's status accurate? Update the "last updated" date.
- **Per-sprint task checkboxes:** for each `[ ]` that's now shipped, flip to `[x]` and append an italic note pointing at the file/feature that delivered it (e.g. `_(via lib/foo.ts)_`).
- **Definition of Done bullets:** same — flip checkboxes, add evidence.
- **Deferred / partial items:** keep the `[ ]` but tag with an italic explanation of why and what would unblock it. Honesty over hiding gaps.
- **Cross-cutting improvements backlog:** add anything new that came up but was deliberately deferred. Remove items that have since been done.
- **Sprint headers:** update the emoji status (✅ Done / 🔶 Mostly done / ⏭️ Deferred / ⏸️ Not started).

### 4. Edit hygiene

- Use targeted `Edit` calls, not full `Write` rewrites — the diff has to be reviewable.
- Exception: rewriting `CLAUDE.md` end-to-end is OK if structural changes are needed and the diff would be a mess otherwise. Justify in the summary.
- Hard rules in `CLAUDE.md` are immutable. The doc references table is also immutable unless a context file actually moved.
- Don't invent features. Only document what you can point at in the codebase.
- Don't delete deferred backlog items just because they're old. Mark them done if they shipped, or leave them as deferred with current reasoning.

### 5. Verify

Run `cd app && npx next build` (with placeholder env vars if `.env.local` is missing — see existing build commands in chat history). It must compile cleanly. If it doesn't, **stop and surface the build failure**; the docs can wait until the code is green.

### 6. Report

Reply with a tight summary:

- **Files changed:** `CLAUDE.md` (lines added/removed), `development-plan.md` (sections touched)
- **What shipped since last sync:** bullet list, one line each, pointing at the file or route
- **What's now marked deferred or partial that wasn't before:** with the reason
- **Hard-rule check results:** all six rules confirmed enforced, OR which one regressed
- **Drift you couldn't reconcile:** anything that needs human input — e.g. "I see a new column on the schema but no doc explains why it was added"
- **Line counts:** `CLAUDE.md = N lines (budget 250)`, build status

Keep the summary under ~30 lines. The user reads this to decide whether to re-run with a focus argument or move on.
