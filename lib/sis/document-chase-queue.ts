import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';
import { DOCUMENT_SLOTS } from '@/lib/sis/queries';
import {
  EXPIRING_SOON_THRESHOLD_DAYS,
  scanDocStatusForActionFlags,
} from '@/lib/sis/process';

// ──────────────────────────────────────────────────────────────────────────
// Document chase queue — top-of-fold counts for /p-files + /admissions
// dashboards. Counts students (not slots) with at least one slot in the
// per-module action states. Per-module split:
//
//   admissions  → Pre-enrolment chase (KD #51). Populates promised
//                 (To follow), validation (Uploaded), revalidation
//                 (Rejected only — Expired belongs to P-Files renewal
//                 lifecycle). expiringSoon zeroed — admissions doesn't
//                 chase renewals.
//   p-files     → Post-enrolment renewal lifecycle (KD #31 + KD #64).
//                 Populates revalidation (Expired only — Rejected belongs
//                 to admissions) + expiringSoon. promised + validation
//                 zeroed — those buckets are admissions-side.
//
// Filtering by enrollment status keeps the two surfaces non-overlapping:
//   admissions  → applicationStatus IN ('Submitted', 'Ongoing Verification', 'Processing')
//   p-files     → applicationStatus IN ('Enrolled', 'Enrolled (Conditional)') AND classSection IS NOT NULL
//
// Cached per-(AY, module) with the existing `sis:${ayCode}` tag (KD #46),
// so any existing write that already invalidates that tag (PATCH on
// /api/sis/students/[enroleeNumber]/documents, residence-history editor,
// etc.) automatically refreshes these counts.
// ──────────────────────────────────────────────────────────────────────────

export type ChaseQueueModule = 'admissions' | 'p-files';

export type DocumentChaseQueueCounts = {
  promised: number;     // any slot at 'To follow' (admissions only — zero for p-files)
  validation: number;   // any slot at 'Uploaded' (admissions only — zero for p-files)
  revalidation: number; // 'Rejected' for admissions; 'Expired' for p-files
  expiringSoon: number; // any Valid slot expiring within 30 days (p-files only — zero for admissions)
};

const CACHE_TTL_SECONDS = 60;

const ADMISSIONS_FUNNEL_STATUSES = [
  'Submitted',
  'Ongoing Verification',
  'Processing',
] as const;

const ENROLLED_STATUSES = ['Enrolled', 'Enrolled (Conditional)'] as const;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

async function loadChaseQueueUncached(
  ayCode: string,
  moduleKey: ChaseQueueModule,
): Promise<DocumentChaseQueueCounts> {
  const prefix = prefixFor(ayCode);
  const supabase = createAdmissionsClient();

  // Pull the matching enrolee scope first from the status table — gives
  // us the enrolee numbers for the docs filter + lets us enforce the
  // p-files classSection requirement (KD #31).
  const statusSelect = ['enroleeNumber', 'applicationStatus', 'classSection'].join(', ');
  let statusQuery = supabase.from(`${prefix}_enrolment_status`).select(statusSelect);
  if (moduleKey === 'admissions') {
    statusQuery = statusQuery.in('applicationStatus', [...ADMISSIONS_FUNNEL_STATUSES]);
  } else {
    statusQuery = statusQuery
      .in('applicationStatus', [...ENROLLED_STATUSES])
      .not('classSection', 'is', null);
  }
  const statusRes = await statusQuery;
  if (statusRes.error) {
    console.warn(
      '[sis/document-chase-queue] status fetch failed:',
      statusRes.error.message,
    );
    return { promised: 0, validation: 0, revalidation: 0, expiringSoon: 0 };
  }
  type StatusRow = { enroleeNumber: string | null; applicationStatus: string | null; classSection: string | null };
  const statusRows = ((statusRes.data ?? []) as unknown as StatusRow[]).filter((r) => !!r.enroleeNumber);
  // p-files extra defensive filter — `.not('classSection', 'is', null)`
  // handles NULL but blank strings ('') would slip through. Strip them.
  const enroleeSet = new Set(
    moduleKey === 'p-files'
      ? statusRows
          .filter((r) => (r.classSection ?? '').toString().trim().length > 0)
          .map((r) => r.enroleeNumber!)
      : statusRows.map((r) => r.enroleeNumber!),
  );
  if (enroleeSet.size === 0) {
    return { promised: 0, validation: 0, revalidation: 0, expiringSoon: 0 };
  }

  // Include both status columns and expiry columns so scanDocStatusForActionFlags
  // can evaluate hasExpiringSoon. Expiring-soon detection requires dates.
  const docColumns = [
    'enroleeNumber',
    ...DOCUMENT_SLOTS.map((s) => s.statusCol),
    ...DOCUMENT_SLOTS.filter((s) => s.expiryCol).map((s) => s.expiryCol!),
  ];

  const docsRes = await supabase
    .from(`${prefix}_enrolment_documents`)
    .select(docColumns.join(', '))
    .in('enroleeNumber', Array.from(enroleeSet));

  if (docsRes.error) {
    console.warn(
      '[sis/document-chase-queue] docs fetch failed:',
      docsRes.error.message,
    );
    return { promised: 0, validation: 0, revalidation: 0, expiringSoon: 0 };
  }

  let promised = 0;
  let validation = 0;
  let revalidation = 0;
  let expiringSoon = 0;

  type DocRow = Record<string, string | null>;
  const rows = (docsRes.data ?? []) as unknown as DocRow[];

  // Per-module revalidation discriminator — admissions cares about
  // Rejected (parent uploaded but registrar bounced); p-files cares
  // about Expired (renewal lifecycle).
  const revalidationKind: 'rejected' | 'expired' =
    moduleKey === 'admissions' ? 'rejected' : 'expired';

  for (const row of rows) {
    const flags = scanDocStatusForActionFlags(row, {
      expiringSoonThresholdDays: EXPIRING_SOON_THRESHOLD_DAYS,
      kindFilter: { revalidation: revalidationKind },
    });
    if (flags.hasPromised) promised += 1;
    if (flags.hasValidation) validation += 1;
    if (flags.hasRevalidation) revalidation += 1;
    if (flags.hasExpiringSoon) expiringSoon += 1;
  }

  // Zero-out per-module buckets that aren't relevant to this surface.
  if (moduleKey === 'admissions') {
    expiringSoon = 0;
  } else {
    promised = 0;
    validation = 0;
  }

  return { promised, validation, revalidation, expiringSoon };
}

export async function getDocumentChaseQueueCounts(
  ayCode: string,
  moduleKey: ChaseQueueModule = 'admissions',
): Promise<DocumentChaseQueueCounts> {
  return unstable_cache(
    () => loadChaseQueueUncached(ayCode, moduleKey),
    ['sis', 'document-chase-queue', ayCode, moduleKey],
    {
      revalidate: CACHE_TTL_SECONDS,
      tags: ['sis', `sis:${ayCode}`],
    },
  )();
}
