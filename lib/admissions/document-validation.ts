// Loader for the admissions document validation triage page.
//
// Scans every un-enrolled applicant in a given AY, fans across the 16
// document slots in JS, and returns one ValidationQueueRow per slot whose
// status is 'Uploaded' (the awaiting-validation queue per KD #70).
//
// Scope (KD #70 + KD #71): admissions-side only — applicationStatus IN
// ('Submitted', 'Ongoing Verification', 'Processing'). Enrolled +
// post-Enrolled applicants are out of scope (P-Files handles those).
//
// STP-conditional slots (KD #61): icaPhoto / financialSupportDocs /
// vaccinationInformation are skipped when the applicant's
// stpApplicationType is null. Mirrors the existing pattern in
// loadAdmissionsCompletenessForChaseUncached.
//
// No per-slot timestamp is emitted in v1 — the schema lacks one
// (documentUpdatedDate is stage-level, not slot-level). A future
// migration adding ${slot}UploadedAt would unlock days-waiting.
//
// Cache: tagged `sis:${ayCode}` so the existing PATCH at
// /api/sis/students/[enroleeNumber]/document/[slotKey] auto-invalidates
// this loader via its `revalidateTag(\`sis:${ayCode}\`, 'max')` call.

import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';
import {
  DOCUMENT_SLOTS,
  STP_CONDITIONAL_SLOT_KEYS,
} from '@/lib/sis/queries';

export type ValidationQueueCategory = 'general' | 'stp';

export type ValidationQueueRow = {
  enroleeNumber: string;
  studentNumber: string | null;
  fullName: string;
  applicationStatus: string;
  levelApplied: string | null;
  slotKey: string;
  slotLabel: string;
  fileUrl: string;
  isExpirable: boolean;
  // 'general' = the 13 always-applicable slots. 'stp' = the 3 STP-
  // conditional slots (icaPhoto / financialSupportDocs /
  // vaccinationInformation) that only appear when the applicant has
  // stpApplicationType set. Drives the General / STP tab split on the
  // validation page.
  category: ValidationQueueCategory;
};

const PENDING_APP_STATUSES = [
  'Submitted',
  'Ongoing Verification',
  'Processing',
] as const;
type PendingAppStatus = (typeof PENDING_APP_STATUSES)[number];

const STP_CONDITIONAL_SLOT_KEY_SET = new Set<string>(STP_CONDITIONAL_SLOT_KEYS);

async function loadPendingDocValidationUncached(
  ayCode: string,
): Promise<ValidationQueueRow[]> {
  const year = ayCode.replace(/^AY/i, '').toLowerCase();
  const appsTable = `ay${year}_enrolment_applications`;
  const statusTable = `ay${year}_enrolment_status`;
  const docsTable = `ay${year}_enrolment_documents`;

  const admissions = createAdmissionsClient();

  // Fetch all three tables in parallel. Admissions tables have no FK between
  // them so we join in JS by enroleeNumber, mirroring the rest of
  // lib/admissions/dashboard.ts.
  const [appsRes, statusRes, docsRes] = await Promise.all([
    admissions
      .from(appsTable)
      .select(
        'enroleeNumber, studentNumber, firstName, lastName, middleName, enroleeFullName, levelApplied, stpApplicationType',
      ),
    admissions.from(statusTable).select('enroleeNumber, applicationStatus'),
    // Build the docs SELECT from DOCUMENT_SLOTS so we always read every
    // statusCol + urlCol column. urlCol is required on every slot; no fallback.
    admissions
      .from(docsTable)
      .select(
        ['enroleeNumber', ...DOCUMENT_SLOTS.flatMap((s) => [s.statusCol, s.urlCol])].join(', '),
      ),
  ]);

  if (appsRes.error || statusRes.error || docsRes.error) {
    console.error('[doc-validation] fetch error', {
      apps: appsRes.error?.message,
      status: statusRes.error?.message,
      docs: docsRes.error?.message,
    });
    return [];
  }

  type AppRow = {
    enroleeNumber: string | null;
    studentNumber: string | null;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    enroleeFullName: string | null;
    levelApplied: string | null;
    stpApplicationType: string | null;
  };
  type StatusRow = {
    enroleeNumber: string | null;
    applicationStatus: string | null;
  };
  type DocsRow = Record<string, string | null> & { enroleeNumber: string | null };

  const apps = (appsRes.data ?? []) as AppRow[];
  const statuses = (statusRes.data ?? []) as StatusRow[];
  // Dynamic SELECT string makes Supabase's typed client widen to
  // GenericStringError[]; cast through unknown so TS accepts the runtime shape.
  const docs = (docsRes.data ?? []) as unknown as DocsRow[];

  const statusByEnrolee = new Map<string, string | null>();
  for (const s of statuses) {
    if (s.enroleeNumber) statusByEnrolee.set(s.enroleeNumber, s.applicationStatus);
  }
  const appByEnrolee = new Map<string, AppRow>();
  for (const a of apps) {
    if (a.enroleeNumber) appByEnrolee.set(a.enroleeNumber, a);
  }

  const rows: ValidationQueueRow[] = [];

  for (const docRow of docs) {
    const enroleeNumber = docRow.enroleeNumber;
    if (!enroleeNumber) continue;
    const app = appByEnrolee.get(enroleeNumber);
    if (!app) continue;

    const appStatus = statusByEnrolee.get(enroleeNumber) ?? null;
    if (!appStatus) continue;
    if (!PENDING_APP_STATUSES.includes(appStatus as PendingAppStatus)) continue;

    for (const slot of DOCUMENT_SLOTS) {
      // STP-conditional gate (KD #61) — skip when stpApplicationType is null/empty.
      if (STP_CONDITIONAL_SLOT_KEY_SET.has(slot.key)) {
        const stp = app.stpApplicationType;
        if (!stp || String(stp).trim().length === 0) continue;
      }

      const status = docRow[slot.statusCol];
      if (status !== 'Uploaded') continue;

      const fileUrl = docRow[slot.urlCol];
      if (!fileUrl) continue;

      const fullName =
        app.enroleeFullName?.trim() ||
        [app.firstName, app.middleName, app.lastName]
          .map((p) => (p ?? '').trim())
          .filter(Boolean)
          .join(' ') ||
        '(unnamed)';

      rows.push({
        enroleeNumber,
        studentNumber: app.studentNumber,
        fullName,
        applicationStatus: appStatus,
        levelApplied: app.levelApplied,
        slotKey: slot.key,
        slotLabel: slot.label,
        fileUrl,
        isExpirable: slot.expiryCol != null,
        category: STP_CONDITIONAL_SLOT_KEY_SET.has(slot.key) ? 'stp' : 'general',
      });
    }
  }

  // Stable sort: by full name then slot label so the page re-renders
  // deterministically across cache hits.
  rows.sort((a, b) => {
    const nameCmp = a.fullName.localeCompare(b.fullName);
    if (nameCmp !== 0) return nameCmp;
    return a.slotLabel.localeCompare(b.slotLabel);
  });

  return rows;
}

export async function loadPendingDocValidation(
  ayCode: string,
): Promise<ValidationQueueRow[]> {
  return unstable_cache(
    () => loadPendingDocValidationUncached(ayCode),
    ['admissions', 'doc-validation', ayCode],
    { tags: [`sis:${ayCode}`], revalidate: 60 },
  )();
}

export async function countPendingDocValidation(ayCode: string): Promise<number> {
  const rows = await loadPendingDocValidation(ayCode);
  return rows.length;
}
