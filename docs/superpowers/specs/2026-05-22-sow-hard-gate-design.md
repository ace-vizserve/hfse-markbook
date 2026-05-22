# SOW Hard Gate — Design Spec

**Date:** 2026-05-22
**Status:** Approved
**KD reference:** KD #108 (SOW Definition/Version/Instance model)

---

## Context

Ms. Chandana confirmed that SOW is always prepared before the start of the academic year or term. Subject teachers finalise it; the subject coordinator checks it informally (offline). Changes mid-term are rare. The system only needs to capture what it consumes: WW/PT slot labels (with page# and date) and evaluation topics. school_admin / superadmin authors and publishes; teachers are consumers, not authors.

**Rule:** No approved SOW = no Markbook/Evaluation activation for that subject-section-term. Approved SOW = downstream modules unlock.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Gate style | Skip scopes without SOW at bulk-create | Don't create sheets that can't be used |
| Unlock trigger | SOW apply auto-triggers sheet creation | Collapses apply + generate into one admin action |
| Evaluation Checklists | Subject visible in picker; locked empty state when no SOW | Teachers see what's coming, not surprised by disappearing subjects |
| Existing sheets | Gate on new creation only; test env reset handles migration | Non-disruptive for production |
| Implementation | New selective RPC + modified SOW apply route | Surgical, no delete side effects, clean by construction |

---

## Section 1 — Data Layer (Migration 059)

### New Postgres function: `create_grading_sheets_for_scopes(p_scopes jsonb)`

Takes an array of `{section_id, subject_id, term_id}` objects. For each scope:

1. Looks up the matching `subject_configs` row for that section's level × AY × subject to get `ww_max_slots`, `pt_max_slots`, `qa_max`, `slot_labels`
2. Inserts a `grading_sheets` row — `ON CONFLICT (section_id, subject_id, term_id) DO NOTHING` (idempotent)
3. If newly inserted: seeds `grade_entries` for all active `section_students` in that section × term (same seeding logic as existing `create_grading_sheets_for_section` RPC)
4. Returns `{ inserted: number }`

### Schema addition on `sow_class_instances`

```sql
ALTER TABLE sow_class_instances
  ADD COLUMN has_partial_rebaseline boolean NOT NULL DEFAULT false;
```

Set to `true` when apply used merge mode; `false` on clean apply or first apply. Reset to `false` if a subsequent clean apply fully overwrites.

### No other schema changes

`grading_sheets`, `evaluation_checklist_items`, and `evaluation_checklist_responses` are unchanged.

---

## Section 2 — Bulk-create Route Restructure

**File:** `app/api/grading-sheets/bulk-create/route.ts`

### New flow

1. Get target sections (by AY or single section) with `level_id` + `curriculum_track`
2. Get all `subject_configs` for those levels × AY — the full (subject × term) matrix the AY expects
3. Build scope tuples `(section_id, subject_id, term_id, level_id, curriculum_track)` — same grouping as current `applySowForSheets`, moved earlier
4. For each unique `(term_id, subject_id, level_id, curriculum_track)`, call `getLatestPublished` (existing in `lib/sis/sow/queries.ts`)
5. Split: **allowed** (published SOW exists) vs **blocked** (no SOW)
6. Call `create_grading_sheets_for_scopes` with allowed tuples only
7. Apply SOW labels + evaluation topics for allowed scopes (existing logic, unchanged)
8. Return `{ inserted, sow_scopes_applied, sow_scopes_blocked, blocked_subjects: string[] }`

`blocked_subjects` is a human-readable list (e.g. `["Mathematics · T2", "Science · T3"]`) for the toast.

### Refactor

The existing `applySowForSheets` function is **renamed** to `gateAndActivateScopes`. It now owns both the SOW pre-check and selective sheet creation, replacing the current "create all, then apply" pattern.

### UI feedback

If `sow_scopes_blocked > 0`, `BulkCreateSheetsButton` and `GenerateSheetsDialog` show an amber `toast.warning` listing the blocked subjects.

---

## Section 3 — SOW Apply Route (Auto-trigger + Merge Strategy)

**File:** `app/api/sis/admin/sow/apply/route.ts` (or equivalent)

### New flow

1. Look up `published_version_id` → `sow_published_versions` → `sow_master_templates` → get `(term_id, subject_id, level_id, curriculum_track)`
2. Find all sections in the AY matching `(level_id, curriculum_track)`
3. Run **impact detection** per scope (see below)
4. Create/update `sow_class_instances` for each section; set `has_partial_rebaseline` based on impact mode
5. **NEW:** Call `create_grading_sheets_for_scopes` for all target sections × subject × term
6. Sync slot labels (conditional on impact mode — see below)
7. Upsert evaluation topics (conditional on impact mode — see below)
8. Return `{ class_instances_applied, sheets_created, mode, preserved_slots, preserved_topics }`

### Impact detection

New helper `detectSowChangeImpact(scope)` returns:
- `hasGradingScores: boolean` — any `ww_scores` or `pt_scores` element non-null across sheets in the scope
- `hasEvaluationResponses: boolean` — any `evaluation_checklist_responses.rating` non-null for items in this scope

### Grading sheet slot sync — two paths

| State | Action |
|---|---|
| `!hasGradingScores` (clean) | Full replacement — existing `sync_grading_sheets_from_sow` behavior |
| `hasGradingScores` (has scores) | **Merge:** iterate slots by position index. Scored positions → update label only, preserve scores. Unscored positions → replace from new SOW. New SOW slots beyond existing count → append (up to max 5). Never renumber. |

New helper: `mergeGradingSheetSlots(service, sheetId, newWw, newPt)` in `lib/sis/sow/mutations.ts`

> Note: merge mode only mutates `slot_labels` (the label/date/page metadata). `ww_totals`/`pt_totals` (max scores, config-driven) and `grade_entries.ww_scores`/`pt_scores` are never touched by SOW apply in either mode.

### Evaluation topic sync — two paths

| State | Action |
|---|---|
| `!hasEvaluationResponses` (clean) | Full replacement — delete all items for scope, re-insert from new SOW |
| `hasEvaluationResponses` (has responses) | **Merge:** items with ≥1 non-null rating → keep. Items with no ratings → delete. New topics from updated SOW → insert. |

New helper: `mergeEvaluationTopics(service, scope, newTopics)` in `lib/sis/sow/mutations.ts`

### Audit trail

`sow.instance.apply` audit row `context` gains:

```json
{
  "mode": "clean | partial-rebaseline",
  "from_version_number": 1,
  "to_version_number": 2,
  "preserved_slots": 2,
  "preserved_topics": 3,
  "rebaseline_reason": "WW: 2 slots preserved (scores exist); Topics: 3 items preserved (ratings exist)"
}
```

### UX signal

- `mode: 'partial-rebaseline'` → amber `toast.warning`: *"Some slots/topics were preserved because scores already exist. Review the grading sheet to confirm."*
- The "SOW v{N}" attribution chip on grading sheets shows **amber variant** when `sow_class_instances.has_partial_rebaseline = true`, with tooltip: *"SOW updated mid-year. Some slots or topics were preserved because scores already existed."*
- Chip reverts to default tint on a subsequent clean apply.

### Net result for admins

> Build draft → Publish → Apply → ✅ sheets live + labels pre-filled + evaluation topics ready

Bulk-create remains as a catch-up tool (e.g. new sections added mid-year after SOW was applied).

---

## Section 4 — AY Readiness Pill

**Files:** `lib/sis/readiness.ts`, `components/sis/ay-readiness-pill.tsx`

### New readiness step: `"sow"`

Inserted between `"sections"` and `"grading-sheets"`. Step order becomes:

```
["ay-setup", "calendar", "sections", "sow", "grading-sheets"]
```

### Readiness query

New helper `loadSowReadiness(ayId)` in `lib/sis/readiness.ts`:

1. Derive needed scopes: cross-join `subject_configs` (level × subject) × `terms` × distinct `(level_id, curriculum_track)` from `sections` for the AY
2. For each scope, check if a `sow_published_versions` row exists via the `sow_master_templates` chain
3. Returns `{ complete: number, total: number }`

### Step shape

```
ReadinessStepId: "sow"
icon: ScrollText  (lucide-react)
label: "Scheme of Work"
description (incomplete): "N of M subject-term scopes missing approved SOW"
cta link: /sis/admin/sow
```

### Grading-sheets step dependency copy

When the "sow" step is incomplete, the "grading-sheets" step description reads: *"Approve SOW first — grading sheets will be generated automatically on apply."*

### Type changes

- `ReadinessStepId` union gains `"sow"`
- `STEP_ICONS` gains `"sow": ScrollText`
- `AyReadiness` total count increases by 1

---

## Section 5 — Evaluation Checklists Locked State

**File:** `app/(evaluation)/evaluation/sections/[sectionId]/page.tsx`

No DB changes. `sowExistsForSection` already runs on the page.

### Three states for Checklists tab subject view

| Condition | Display |
|---|---|
| `sowCheck.exists && items.length > 0` | Normal checklist view (unchanged) |
| `sowCheck.exists && items.length === 0` | Existing empty state: "No topics defined in the SOW for this subject" |
| `!sowCheck.exists` | New locked empty state (below) |

### Locked empty state component

- `Lock` icon in an amber gradient tile (§9.3 warning recipe)
- Serif title: *"SOW not yet approved"*
- Body: *"Topics for [Subject Name] · [Term Label] will appear here once the administrator publishes and applies the Scheme of Work."*
- No action button for teachers; registrar+ sees `ArrowUpRight` link to `/sis/admin/sow`

### Write-ups tab

Unaffected — FCA comments are adviser × section × term, not subject-scoped.

### Subject picker

Subjects without SOW remain visible in the picker (teachers see what's coming). Locked state renders on selection rather than hiding the subject.

---

## Files Touched

| File | Change |
|---|---|
| `supabase/migrations/059_*.sql` | New `create_grading_sheets_for_scopes` RPC + `sow_class_instances.has_partial_rebaseline` column |
| `app/api/grading-sheets/bulk-create/route.ts` | Restructure to pre-check SOW, call selective RPC, report blocked scopes |
| `app/api/sis/admin/sow/apply/route.ts` | Auto-trigger sheet creation + impact detection + merge strategy |
| `lib/sis/sow/queries.ts` | Add `detectSowChangeImpact`, `hasGradingScores`, `hasEvaluationResponses` |
| `lib/sis/sow/mutations.ts` | Update `applyInstanceToSection` to accept `impactMode`; add `mergeGradingSheetSlots`, `mergeEvaluationTopics` |
| `lib/sis/readiness.ts` | Add `"sow"` step + `loadSowReadiness` |
| `components/sis/ay-readiness-pill.tsx` | Add `"sow"` step icon + dependency copy on grading-sheets step |
| `app/(evaluation)/evaluation/sections/[sectionId]/page.tsx` | Add locked empty state when `!sowCheck.exists` |
| `components/markbook/bulk-create-sheets-button.tsx` | Handle `sow_scopes_blocked` in toast |
| `components/sis/generate-sheets-dialog.tsx` | Handle `sow_scopes_blocked` in toast |
| `components/markbook/score-entry-grid.tsx` (or chip component) | Amber SOW chip variant when `has_partial_rebaseline` |
