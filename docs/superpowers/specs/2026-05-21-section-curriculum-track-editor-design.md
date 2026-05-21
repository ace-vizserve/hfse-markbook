# Section Curriculum Track Editor

**Date:** 2026-05-21
**Status:** Approved

## Problem

`sections.curriculum_track` is set at creation time (auto-assigned `cambridge` for CS1/CS2 levels, `singapore_inspired` for everything else) with no UI to change it afterward. Since `curriculum_track` is what the SOW builder uses to look up the right template for a section, a wrong or default track silently causes the wrong SOW to be applied. Registrars need to be able to correct this.

## Solution

Extend the existing Rename dialog on the section detail page (`/sis/sections/[id]`) to include a `curriculum_track` selector alongside the section name field. One dialog, two editable fields, one save action.

## Scope

- `lib/schemas/section.ts` — extend `SectionUpdateSchema`
- `app/api/sections/[id]/route.ts` — handle `curriculum_track` in PATCH + audit
- `app/(sis)/sis/sections/[id]/page.tsx` — fetch + pass `curriculum_track` to dialog
- Rename dialog component (inline on the page or `components/sis/`) — add `<Select>` field
- SIS Admin audit log allowlist — add `section.curriculum_track.update`

## Schema

`SectionUpdateSchema` gains an optional field:

```typescript
curriculum_track: z.enum(['cambridge', 'o_level', 'singapore_inspired']).optional()
```

Both `name` and `curriculum_track` remain optional so a name-only or track-only save are both valid.

## API (`PATCH /api/sections/[id]`)

1. Validate body against updated `SectionUpdateSchema`
2. Fetch current section row to compare values
3. If `name` present and changed → UPDATE name + `logAction('section.rename', ...)`
4. If `curriculum_track` present and changed → UPDATE curriculum_track + `logAction('section.curriculum_track.update', { from, to })`
5. Only the changed fields are updated; only the relevant audit actions fire
6. Return `{ ok: true, id, name, curriculum_track }`

## UI

The rename dialog (RHF + zod, shadcn `Form`) gains a second field:

- Label: **Curriculum track**
- Control: shadcn `<Select>` with three options:
  - `singapore_inspired` → "Singapore-Inspired"
  - `cambridge` → "Cambridge"
  - `o_level` → "O-Level"
- Pre-populated with the current section value
- No locking — all three options always available regardless of level

The page query adds `curriculum_track` to the sections select. The current value is passed as a prop to the dialog.

## Audit

- New audit action: `section.curriculum_track.update`
- Context: `{ from: string, to: string }`
- Added to the SIS Admin audit log allowlist alongside existing `section.*` actions

## Out of Scope

- Bulk track assignment across multiple sections
- Automatic re-sync of SOW when track changes (re-sync happens at bulk-create time; the track change is a prerequisite step, not a trigger)
