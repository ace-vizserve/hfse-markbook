# Document expiry auto-flip — design spec

**Date:** 2026-04-28
**Branch:** `feat/swap-sonner-sileo`
**Author:** brainstorming session, Amier
**Related KDs:** KD #60 (document status workflow), KD #46 (cache wrapper pattern)
**Predecessor spec:** `2026-04-28-to-follow-document-flag-design.md` (same branch, deferred this work)

## Problem

KD #60 documents the expiring-document contract:

> Expiring (passport, pass, motherPassport, motherPass, fatherPassport, fatherPass, guardianPassport, guardianPass): `null → 'Valid' → 'Expired'` (auto-flip when expiry passes)…

The "auto-flip when expiry passes" half is **unimplemented**. Today, an expiring slot only ends up in the `'Expired'` state if (a) the seeder writes it that way for test data, or (b) someone manually edits the row. A passport whose `passportExpiry` date has passed but whose `passportStatus` was never touched stays `'Valid'` forever.

Consequence: the lifecycle aggregate widget, chase-queue strip, drill rows, per-applicant timeline, and student detail pages all miss these "silently expired" rows. They show the registrar's revalidation queue at lower-than-true count. The pass-expiry cohort view is the only surface that derives correctness from the date column directly — every other surface trusts the status column.

## Goal

Make the `<slot>Status` column flip from `'Valid'` to `'Expired'` automatically whenever `<slot>Expiry < today` (Singapore time), so every surface that reads the column directly sees truth.

The trigger is **page-entry**, not scheduled: each page that displays document status calls a freshen helper at the top of its render. The helper executes the flip SQL synchronously before any data fetches read the column. The next dashboard view after expiry sees the column already flipped.

## Non-goals

- **No nightly scheduler.** Vercel Cron, pg_cron, npm-cron all evaluated and ruled out. Reasons: observability (cron failures are silent unless someone checks the Vercel dashboard), serverless mismatch with npm-cron, and the user's preference for in-codebase logic over scheduled infra.
- **No "expiring soon" proactive signal.** This spec is the reactive expired flip only. The pass-expiry cohort already surfaces "expiring within 365 days" as its own observation surface; promoting that to top-of-fold is future work with its own design call.
- **No backfill migration.** The first time a page calls `freshenAyDocuments` after this ships, any pre-existing `'Valid' + past-expiry` rows in that AY get caught and flipped naturally. No one-off SQL needed.
- **No DB-level triggers.** Postgres triggers fire on row INSERT/UPDATE, not on time passing — they don't solve this problem.
- **No re-validation flow change.** When a parent uploads a new passport with a future expiry, the existing PATCH route flips the status back to `'Valid'`. That path is untouched.

## Decisions that bend an existing convention

- **Adds a write to page render paths.** Pages today are read-only; this introduces an `UPDATE` statement at the top of 7 page RSCs. Justified because the alternative (cron) was rejected for observability, and lazy-write inside individual loaders sprawls to 5+ files with the same logic. Centralizing in one helper called by each page is the cleanest middle ground.

## Design

### 1. The freshen helper

New file: `lib/sis/freshen-document-statuses.ts`

```ts
import 'server-only';

import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction } from '@/lib/audit/log-action';
import { DOCUMENT_SLOTS } from '@/lib/sis/queries';

export type FreshenResult = {
  flippedCount: number;
  flippedBySlot: Record<string, number>;
  enroleeNumbers: string[]; // capped at 50 in the audit context
};

const EXPIRING_SLOTS = DOCUMENT_SLOTS.filter((s) => s.expiryCol);
const CACHE_TTL_SECONDS = 60;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

async function freshenAyDocumentsUncached(ayCode: string): Promise<FreshenResult> {
  const result: FreshenResult = {
    flippedCount: 0,
    flippedBySlot: {},
    enroleeNumbers: [],
  };

  const admissions = createAdmissionsClient();
  const prefix = prefixFor(ayCode);
  const seen = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Run the 8 per-slot UPDATEs in parallel. Single Supabase roundtrip
    // latency dominates (~15ms total) instead of 8x sequential roundtrips
    // (~80ms). Each UPDATE is independent and idempotent — no transactional
    // dependency between them, so parallelism is safe.
    const slotResults = await Promise.all(
      EXPIRING_SLOTS.map(async (slot) => {
        const { data, error } = await admissions
          .from(`${prefix}_enrolment_documents`)
          .update({ [slot.statusCol!]: 'Expired' })
          .eq(slot.statusCol!, 'Valid')
          .lt(slot.expiryCol!, today)
          .not(slot.expiryCol!, 'is', null)
          .select(`enroleeNumber, ${slot.expiryCol!}`);

        if (error) {
          console.warn(
            `[sis/freshen-documents] flip failed for ${slot.key} in ${ayCode}:`,
            error.message,
          );
          return { slotKey: slot.key, flipped: [] as Array<{ enroleeNumber: string | null }> };
        }

        return { slotKey: slot.key, flipped: data ?? [] };
      }),
    );

    for (const { slotKey, flipped } of slotResults) {
      if (flipped.length > 0) {
        result.flippedCount += flipped.length;
        result.flippedBySlot[slotKey] = flipped.length;
        for (const row of flipped) {
          if (row.enroleeNumber) seen.add(row.enroleeNumber);
        }
      }
    }
  } catch (e) {
    // Catch-all: never break a page render because freshen failed.
    console.warn(
      `[sis/freshen-documents] unexpected failure for ${ayCode}:`,
      e instanceof Error ? e.message : String(e),
    );
    return result;
  }

  result.enroleeNumbers = Array.from(seen).slice(0, 50);

  // Audit only when at least one row was actually flipped — most calls in
  // steady state are 0-row no-ops and should add zero audit noise.
  if (result.flippedCount > 0) {
    try {
      await logAction({
        service: createServiceClient(),
        actor: { id: null, email: '(system:freshen)' },
        action: 'sis.documents.auto-expire',
        entityType: 'enrolment_document',
        entityId: null,
        context: {
          ayCode,
          flippedCount: result.flippedCount,
          flippedBySlot: result.flippedBySlot,
          enroleeNumbers: result.enroleeNumbers,
          truncated: seen.size > 50 ? seen.size - 50 : 0,
        },
      });
    } catch (e) {
      console.warn(
        `[sis/freshen-documents] audit log failed for ${ayCode}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return result;
}

// Public entry point — wraps the uncached body in `unstable_cache` with a
// 60-second TTL keyed on the AY code. Per-page-render cost is ~0ms on cache
// hit; cache miss runs the parallel UPDATE chain (~15ms). The bounded
// 60-second staleness is functionally invisible for calendar-date expiry
// (passports/passes flip at midnight; nobody perceives a 60-second lag the
// next morning). Tag `sis:${ayCode}` is invalidated by every existing PATCH
// route that already touches this AY's documents (e.g., manual status edits
// in /admissions/applications/[enroleeNumber]) so a fresh edit doesn't see
// a stale freshen result.
export function freshenAyDocuments(ayCode: string): Promise<FreshenResult> {
  return unstable_cache(
    () => freshenAyDocumentsUncached(ayCode),
    ['sis', 'freshen-documents', ayCode],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags: ['sis', `sis:${ayCode}`],
    },
  )();
}
```

Properties:
- **Wrapped in `unstable_cache`** (KD #46 cache-wrapper pattern: hoist the `loadX_Uncached` body, compose `unstable_cache` per call).
- **60-second TTL.** First page render in any 60s window per AY runs the freshen; subsequent renders within that window cost ~0ms (cache hit). Steady-state DB load is bounded to one freshen-per-minute-per-AY at most.
- **Tag-invalidated by `sis:${ayCode}`.** Every existing PATCH route that touches an AY's documents (e.g., `/api/sis/students/[enroleeNumber]/documents` manual edits, the residence-history editor, etc.) already calls `revalidateTag('sis:${ayCode}')` — so an edit naturally invalidates the freshen cache, the next page render runs a fresh freshen.
- **Parallel UPDATEs via `Promise.all`.** 8 slot updates run concurrently; total wall-clock time = single Supabase roundtrip (~15ms), not 8 × 10ms sequential. Each UPDATE is independent and idempotent — concurrent execution is safe.
- **Admissions service-role client** for the documents table (matches `lib/sis/queries.ts` pattern, KD #1, KD #22).
- **Audit-log service client** is the standard service-role client used by every other `logAction` call site.
- **Per-slot error swallow** — if one slot's UPDATE fails (e.g., RLS, network), the others still complete. The page still renders.
- **Top-level `try`/`catch`** — never break the page render. Errors logged via `console.warn` (not `console.error`, to avoid Next 16's dev-overlay full-crash modal).
- **Audit only on flips.** Per-call when `flippedCount > 0`, one batched audit row in `context` listing the affected enrolees (capped at 50, with a `truncated` count if the cap was hit).

### 1a. Required extensions to `lib/audit/log-action.ts`

Two small changes alongside the new helper:

**(a) Add the new action to the `AuditAction` enum:**

```ts
export type AuditAction =
  | ...
  | 'sis.documents.auto-expire';   // NEW — system-triggered Valid → Expired flip
```

**(b) Allow a null actor for system actions.**

The `audit_log` schema (migration 006) already permits `actor_id` to be null with the inline comment *"null for system actions"*. The `logAction` TypeScript signature is currently `actor: { id: string; email: string | null }`, which forbids null. Widen it:

```ts
type LogActionParams = {
  service: SupabaseClient;
  actor: { id: string | null; email: string | null };  // CHANGED — id may be null for system actions
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  context?: Record<string, unknown>;
};
```

Inside the function, `actor.id` flows directly to the insert — Postgres accepts null for the nullable column. Existing call sites (which pass a real user's `id`) are unaffected. The change is purely additive widening.

The `actor_email` column is `not null`, so `'(system:freshen)'` is the chosen sentinel (parens to make it visually distinct from real email addresses in the audit-log UI).

### 2. Page entry points

Seven pages call `await freshenAyDocuments(selectedAy)` at the top of their RSC, before the existing `Promise.all([...])` data fetches:

| # | Page | RSC file | Why it needs freshen |
|---|------|----------|----------------------|
| 1 | `/admissions` | `app/(admissions)/admissions/page.tsx` | Chase strip + lifecycle widget |
| 2 | `/records` | `app/(records)/records/page.tsx` | Chase strip + lifecycle widget |
| 3 | `/p-files` | `app/(p-files)/p-files/page.tsx` | Chase strip + PriorityPanel |
| 4 | `/admissions/applications/[enroleeNumber]` | `app/(admissions)/admissions/applications/[enroleeNumber]/page.tsx` | Per-applicant timeline + docs tab |
| 5 | `/records/students/[studentNumber]` | `app/(records)/records/students/[studentNumber]/page.tsx` | Records detail by studentNumber |
| 6 | `/records/students/by-enrolee/[enroleeNumber]` | `app/(records)/records/students/by-enrolee/[enroleeNumber]/page.tsx` | Records detail by enroleeNumber |
| 7 | `/p-files/[enroleeNumber]` | `app/(p-files)/p-files/[enroleeNumber]/page.tsx` | P-File student detail |

Each page edit is one line:

```ts
const selectedAy = ...;  // existing AY resolution
await freshenAyDocuments(selectedAy);  // <-- new line
const [ ... ] = await Promise.all([ ... ]);  // existing data fetches
```

Cohort views (`/admissions/cohorts/{stp,medical,pass-expiry}`, `/records/cohorts/*`) **do not** call freshen. They derive expired status from the `<slot>Expiry` date column directly via `lib/sis/cohorts.ts`, so they're correct without needing the column flipped.

### 3. Scope: which AYs get freshened?

Each page call freshens **exactly the AY the page is displaying**, scoped via the `selectedAy` URL param. Implications:

- Current AY: freshened on every visit to any of the 7 pages.
- Historical AY: freshened only when someone explicitly navigates to it (via the AY switcher).
- Future AY (e.g., AY9999 test environment, or the next AY being seeded pre-rollover): freshened when visited.

This matches the user's "all AYs" intent in practice — every AY that anyone opens gets freshened. Historical AYs that nobody opens stay untouched, which is acceptable since stale data on an unviewed surface affects no one.

### 4. SQL semantics

Per slot, per AY, per call:

```sql
UPDATE ay{YY}_enrolment_documents
SET <slotStatus> = 'Expired'
WHERE <slotStatus> = 'Valid'
  AND <slotExpiry> IS NOT NULL
  AND <slotExpiry> < CURRENT_DATE
RETURNING enroleeNumber, <slotExpiry>;
```

(In the Supabase JS client, the equivalent chain uses `.update().eq().lt().not(...is null).select(...)`.)

**Idempotent.** Re-running on already-flipped rows is a no-op — they no longer match `<slotStatus> = 'Valid'`. Safe under concurrent calls (e.g., two registrars opening the same dashboard within seconds): the second UPDATE just affects 0 rows.

**Index expectations.** The query benefits from a composite index on `(<slotStatus>, <slotExpiry>)`. None exists today; first calls might do a sequential scan over an AY's documents table. At HFSE scale (~500 students per AY × 8 expiring slots = ~4,000 rows max per AY), seq scans are still <50ms. If this becomes a bottleneck, add the indexes in a follow-up migration; not required for ship.

### 5. Audit log shape

One batched row per flip event (per call when `flippedCount > 0`), not per row:

```
audit_log
  action:       'sis.documents.auto-expire'
  actor_id:     'system:freshen'    (no real user)
  target:       `${ayCode}:auto-expire-${YYYY-MM-DD}`
  metadata:     {
    ayCode:        'AY2026',
    flippedCount:  4,
    flippedBySlot: { passport: 3, motherPassport: 1 },
    enroleeNumbers: ['HFSE-2026-001', 'HFSE-2026-014', ...],
    truncated:     0   // count of additional enrolees beyond the 50-cap, 0 in normal cases
  }
  created_at:   <now>
```

This avoids the audit-table explosion of "one row per flip × N flips × M AYs" without losing trace data — anyone investigating a specific student's status flip can join via `metadata.enroleeNumbers`.

### 6. Error handling

- **Per-slot failure** → log warning, skip that slot, continue with the rest. Other slots in the same AY still get processed.
- **Top-level failure** (unexpected error, e.g., service-role client init) → log warning, return zero result, page render proceeds. The page shows whatever the column currently says — possibly stale, but never broken.
- **Audit log failure** → log warning, return result. The flip itself succeeded; the audit is best-effort (matches KD #16's "Email via Resend is best-effort" precedent for non-critical side effects).

### 7. Verification

Manual happy-path on AY9999 (test mode, KD #52):

1. Connect to Supabase studio (or run a SQL update locally) to set a seeded student's `passportStatus = 'Valid'`, `passportExpiry = '2024-01-01'` (clearly in the past).
2. Open `/admissions?ay=AY9999`. The freshen helper runs (cache miss on first call). Confirm:
   - The "Awaiting revalidation" chip on the chase strip increments.
   - Click into the drill — the student appears with their passport flagged as Expired.
   - The audit log surface shows one new `sis.documents.auto-expire` entry with the student's enroleeNumber in `context.enroleeNumbers`.
3. Refresh the page within 60s. Cache hit — freshen does NOT re-run (visible by the absence of a new audit entry). Chip count remains correct (column was already flipped). This is the intended behavior: the cache holds for 60s after a flip; refreshes within that window read the already-correct column.
4. Wait >60s and refresh. Cache miss — freshen runs again, but the SQL is a 0-row no-op (status is already `Expired`), so no new audit entry. Chip count unchanged.
5. Set up a second pre-existing stale student via SQL, then navigate directly to `/admissions/applications/<that-second-enrolee>` (without opening any dashboard first). The applicant detail page runs freshen for AY9999 — confirms the direct-link case is covered.
6. Manually edit the second student's `passportStatus` back to `'Valid'` and `passportExpiry` to a future date via the existing PATCH route. The PATCH calls `revalidateTag('sis:AY9999')` (existing behavior), invalidating the freshen cache. Next page load runs freshen — SQL is a 0-row no-op (the row no longer matches the WHERE clause), no audit entry, the chip stays correct.
7. `npx next build` clean.

### 8. Files touched

- **Create:** `lib/sis/freshen-document-statuses.ts`
- **Modify:** `lib/audit/log-action.ts` — add `'sis.documents.auto-expire'` to the `AuditAction` enum and widen `actor.id` to `string | null`.
- **Modify:** 7 page RSCs (one-line `await freshenAyDocuments(selectedAy)` each).

No DB migration. No new dependency. No new env var. No new API route.

### 9. KD update

KD #60 today reads:

> Expiring (passport, pass, ...): `null → 'Valid' → 'Expired'` (auto-flip when expiry passes); the expiry date IS the validation evidence, no `'Uploaded'` intermediate.

The auto-flip half is now implemented. KD #60 stays as-is — the contract is what it always was; the implementation now matches.

A new entry in `.claude/rules/key-decisions.md` is **not** required for this work — it's filling in a contract KD #60 already documented. The new file `lib/sis/freshen-document-statuses.ts` should reference KD #60 in its header comment so the next dev knows where the contract is documented.

## Open questions

None at design time. The "expiring soon" proactive signal is explicitly deferred per § Non-goals.
