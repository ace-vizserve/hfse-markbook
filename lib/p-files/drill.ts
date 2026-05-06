import { unstable_cache } from 'next/cache';

import { DOCUMENT_SLOTS, STP_CONDITIONAL_SLOT_KEYS } from '@/lib/sis/queries';
import { createAdmissionsClient } from '@/lib/supabase/admissions';
import { createServiceClient } from '@/lib/supabase/service';

const CACHE_TTL_SECONDS = 60;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

function tags(ayCode: string): string[] {
  return ['p-files-drill', `p-files-drill:${ayCode}`];
}

// ─── Targets ────────────────────────────────────────────────────────────────

export type PFilesDrillTarget =
  | 'all-docs'
  | 'complete-docs'
  | 'expired-docs'
  | 'missing-docs'
  | 'slot-by-status'
  | 'missing-by-slot'
  | 'level-applicants'
  | 'revisions-on-day';

// ─── Row shape ──────────────────────────────────────────────────────────────

export type PFilesDrillRow = {
  enroleeNumber: string;
  fullName: string;
  level: string | null;
  slotKey: string; // 'medical' | 'passport' | 'birth-cert' | 'educ-cert' | 'id-picture' | ...
  slotLabel: string;
  status: 'On file' | 'Pending review' | 'Expired' | 'Missing' | 'N/A';
  fileUrl: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  revisionCount: number;
  lastRevisionAt: string | null; // ISO
};

// Slots the P-Files drill iterates per enrolled student. All 16
// `DOCUMENT_SLOTS` minus `form12` (deliberately excluded — not part of the
// per-student chase queue). The 3 STP-conditional slots (icaPhoto,
// financialSupportDocs, vaccinationInformation per KD #61) are present in
// this list but skipped per-row when the app row's `stpApplicationType`
// is null/empty — they only apply to applicants whose Student Pass
// is being sponsored by HFSE.
const ELIGIBLE_SLOTS = DOCUMENT_SLOTS.filter((s) => s.key !== 'form12');
const STP_SLOT_KEYS_SET = new Set<string>(STP_CONDITIONAL_SLOT_KEYS);

// ─── Loader ─────────────────────────────────────────────────────────────────

type AppLite = {
  enroleeNumber: string | null;
  enroleeFullName: string | null;
  firstName: string | null;
  lastName: string | null;
  levelApplied: string | null;
  classLevel: string | null;
  stpApplicationType: string | null;
};
type DocLite = Record<string, string | null>;
type RevisionLite = {
  enrolee_number: string | null;
  slot_key: string;
  ay_code: string;
  replaced_at: string;
};

function appName(a: AppLite): string {
  return (
    (a.enroleeFullName ?? '').trim() ||
    `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() ||
    a.enroleeNumber ||
    ''
  );
}

// Map raw `<slot>Status` values written by the parent portal + populated
// seeder (KD #60: 'Valid' / 'Uploaded' / 'To follow' / 'Rejected' /
// 'Expired') to the 5-state display enum the P-Files drill UI expects.
//   - 'Valid'                → 'On file' (registrar has validated)
//   - 'Uploaded' / 'Pending' → 'Pending review' (parent uploaded, awaiting review)
//   - 'To follow' / 'Rejected' → 'Pending review' (parent owes a re-upload — same chase queue)
//   - 'Expired'              → 'Expired'
//   - null / 'Missing'       → 'Missing'
//   - 'N/A' / 'NA'           → 'N/A'
//   - anything else          → 'On file' (defensive fallback for legacy data)
function normaliseStatus(raw: string | null): PFilesDrillRow['status'] {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '' || s === 'missing') return 'Missing';
  if (s === 'expired') return 'Expired';
  if (s === 'n/a' || s === 'na' || s === 'not applicable') return 'N/A';
  if (
    s === 'pending' ||
    s === 'pending review' ||
    s === 'uploaded' ||
    s === 'to follow' ||
    s === 'rejected'
  ) {
    return 'Pending review';
  }
  if (s === 'valid') return 'On file';
  return 'On file';
}

async function loadPFilesRowsUncached(ayCode: string): Promise<PFilesDrillRow[]> {
  const prefix = prefixFor(ayCode);
  const appsTable = `${prefix}_enrolment_applications`;
  const docsTable = `${prefix}_enrolment_documents`;
  const statusTable = `${prefix}_enrolment_status`;
  const admissions = createAdmissionsClient();
  const service = createServiceClient();

  // Build the docs SELECT from ELIGIBLE_SLOTS — pull every slot's status
  // column plus the expiry column for the 8 expiring slots so each drill
  // row carries its own per-slot expiry.
  const docColumns = Array.from(
    new Set(
      ELIGIBLE_SLOTS.flatMap((s) =>
        s.expiryCol ? [s.statusCol, s.expiryCol] : [s.statusCol],
      ),
    ),
  ).join(', ');

  const [appsRes, docsRes, statusRes, revRes] = await Promise.all([
    admissions
      .from(appsTable)
      .select(
        'enroleeNumber, enroleeFullName, firstName, lastName, levelApplied, stpApplicationType',
      ),
    admissions
      .from(docsTable)
      .select(`enroleeNumber, ${docColumns}`),
    // Enrollment gate at the loader (practical rule: P-Files = enrolled-only,
    // KD #71). Filter at the SQL layer so funnel rows never enter the cache.
    admissions
      .from(statusTable)
      .select('enroleeNumber, classLevel, applicationStatus, classSection')
      .in('applicationStatus', ['Enrolled', 'Enrolled (Conditional)'])
      .not('classSection', 'is', null),
    service
      .from('p_file_revisions')
      .select('enrolee_number, slot_key, ay_code, replaced_at')
      .eq('ay_code', ayCode),
  ]);

  const apps = (appsRes.data ?? []) as AppLite[];
  const appByEnrolee = new Map<string, AppLite>();
  for (const a of apps) {
    if (a.enroleeNumber) appByEnrolee.set(a.enroleeNumber, a);
  }

  const docs = (docsRes.data ?? []) as unknown as DocLite[];
  const docByEnrolee = new Map<string, DocLite>();
  for (const d of docs) {
    const en = d['enroleeNumber'];
    if (typeof en === 'string') docByEnrolee.set(en, d);
  }

  const statuses = (statusRes.data ?? []) as Array<{
    enroleeNumber: string | null;
    classLevel: string | null;
    applicationStatus: string | null;
    classSection: string | null;
  }>;
  const classLevelByEnrolee = new Map<string, string>();
  // Set of enrolled enroleeNumbers — only these emit drill rows below.
  // The status fetch already filtered at SQL but we materialize the Set
  // for the iteration filter (`apps` is not pre-filtered).
  const enrolledEnrolees = new Set<string>();
  for (const s of statuses) {
    if (!s.enroleeNumber) continue;
    enrolledEnrolees.add(s.enroleeNumber);
    if (s.classLevel) classLevelByEnrolee.set(s.enroleeNumber, s.classLevel);
  }

  // Revisions counted per (enrolee, slot)
  const revKey = (en: string, slot: string) => `${en}|${slot}`;
  const revCount = new Map<string, number>();
  const revLastAt = new Map<string, string>();
  for (const r of (revRes.data ?? []) as RevisionLite[]) {
    if (!r.enrolee_number) continue;
    const k = revKey(r.enrolee_number, r.slot_key);
    revCount.set(k, (revCount.get(k) ?? 0) + 1);
    const prev = revLastAt.get(k);
    if (!prev || r.replaced_at > prev) revLastAt.set(k, r.replaced_at);
  }

  const today = Date.now();
  const out: PFilesDrillRow[] = [];
  for (const app of apps) {
    if (!app.enroleeNumber) continue;
    // Enrollment gate: skip funnel applicants. The status query above
    // already filters to enrolled at SQL; this Set check makes the
    // intent explicit at the iteration site too.
    if (!enrolledEnrolees.has(app.enroleeNumber)) continue;
    const docRow = docByEnrolee.get(app.enroleeNumber);
    const level = classLevelByEnrolee.get(app.enroleeNumber) ?? app.levelApplied ?? null;
    const isStpApplicant = !!(app.stpApplicationType ?? '').trim();

    for (const slot of ELIGIBLE_SLOTS) {
      // STP-conditional slots only apply to STP applicants per KD #61.
      // Non-STP students don't have an icaPhoto / financialSupportDocs /
      // vaccinationInformation requirement, so they shouldn't generate
      // drill rows for those slots — would inflate "Missing" counts.
      if (STP_SLOT_KEYS_SET.has(slot.key) && !isStpApplicant) continue;

      const raw = (docRow?.[slot.statusCol] as string | null | undefined) ?? null;
      const status = normaliseStatus(raw);

      // Per-slot expiry — every expiring slot carries its own date.
      let expiryDate: string | null = null;
      let daysToExpiry: number | null = null;
      if (slot.expiryCol) {
        const raw = (docRow?.[slot.expiryCol] as string | null | undefined) ?? null;
        expiryDate = raw;
        const expiryMs = raw ? Date.parse(raw) : NaN;
        daysToExpiry = !Number.isNaN(expiryMs)
          ? Math.floor((expiryMs - today) / 86_400_000)
          : null;
      }

      const k = revKey(app.enroleeNumber, slot.key);
      out.push({
        enroleeNumber: app.enroleeNumber,
        fullName: appName(app),
        level,
        slotKey: slot.key,
        slotLabel: slot.label,
        status,
        fileUrl: null, // not surfaced in drill rows; the detail page handles file urls
        expiryDate,
        daysToExpiry,
        revisionCount: revCount.get(k) ?? 0,
        lastRevisionAt: revLastAt.get(k) ?? null,
      });
    }
  }
  return out;
}

export async function buildPFilesDrillRows(input: {
  ayCode: string;
  from?: string;
  to?: string;
}): Promise<PFilesDrillRow[]> {
  // Loader is AY-scoped; range filtering is target-specific (revisions /
  // expiry dates) and applied by `applyTargetFilter` in the API route via
  // the `range` parameter. The `from` / `to` props on this builder are
  // accepted for API consistency with sibling builders, but intentionally
  // not applied at load time — P-Files renders all enrolled students every
  // render so the slot-status mix and completion-by-level are full-AY
  // views regardless of the user's selected range.
  return unstable_cache(
    () => loadPFilesRowsUncached(input.ayCode),
    ['p-files-drill', 'rows', input.ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tags(input.ayCode) },
  )();
}

// ─── Per-target filter ──────────────────────────────────────────────────────

export function applyTargetFilter(
  rows: PFilesDrillRow[],
  target: PFilesDrillTarget,
  segment: string | null,
  range?: { from: string; to: string },
): PFilesDrillRow[] {
  switch (target) {
    case 'all-docs': return rows;
    case 'complete-docs': return rows.filter((r) => r.status === 'On file');
    case 'expired-docs': return rows.filter((r) => r.status === 'Expired');
    case 'missing-docs': return rows.filter((r) => r.status === 'Missing');
    case 'slot-by-status': {
      // segment = a status string ('Missing', 'Expired', etc.)
      if (!segment) return rows;
      return rows.filter((r) => r.status === segment);
    }
    case 'missing-by-slot': {
      // segment = slotKey
      if (!segment) return rows.filter((r) => r.status === 'Missing');
      return rows.filter((r) => r.slotKey === segment && r.status === 'Missing');
    }
    case 'level-applicants': {
      if (!segment) return rows;
      return rows.filter((r) => (r.level ?? 'Unknown') === segment);
    }
    case 'revisions-on-day': {
      // segment = ISO date 'YYYY-MM-DD'
      if (!segment) return rows.filter((r) => r.lastRevisionAt !== null);
      return rows.filter((r) => r.lastRevisionAt?.slice(0, 10) === segment);
    }
    default: {
      const _exhaustive: never = target;
      throw new Error(`unreachable target: ${String(_exhaustive)}`);
    }
  }
}

// ─── Per-target columns ─────────────────────────────────────────────────────

export type DrillColumnKey =
  | 'fullName'
  | 'enroleeNumber'
  | 'level'
  | 'slotLabel'
  | 'status'
  | 'expiryDate'
  | 'daysToExpiry'
  | 'revisionCount'
  | 'lastRevisionAt';

export const ALL_DRILL_COLUMNS: DrillColumnKey[] = [
  'fullName',
  'enroleeNumber',
  'level',
  'slotLabel',
  'status',
  'expiryDate',
  'daysToExpiry',
  'revisionCount',
  'lastRevisionAt',
];

export const DRILL_COLUMN_LABELS: Record<DrillColumnKey, string> = {
  fullName: 'Applicant',
  enroleeNumber: 'Applicant Number',
  level: 'Level',
  slotLabel: 'Slot',
  status: 'Status',
  expiryDate: 'Expires',
  daysToExpiry: 'Days to expiry',
  revisionCount: 'Revisions',
  lastRevisionAt: 'Last revision',
};

export function defaultColumnsForTarget(target: PFilesDrillTarget): DrillColumnKey[] {
  switch (target) {
    case 'all-docs': return ['fullName', 'level', 'slotLabel', 'status'];
    case 'complete-docs':
    case 'expired-docs':
    case 'missing-docs':
    case 'slot-by-status':
    case 'missing-by-slot':
      return ['fullName', 'level', 'slotLabel', 'status', 'lastRevisionAt'];
    case 'level-applicants':
      return ['fullName', 'level', 'slotLabel', 'status'];
    case 'revisions-on-day':
      return ['fullName', 'level', 'slotLabel', 'status', 'revisionCount', 'lastRevisionAt'];
  }
}

export function drillHeaderForTarget(
  target: PFilesDrillTarget,
  segment: string | null,
): { eyebrow: string; title: string } {
  switch (target) {
    case 'all-docs': return { eyebrow: 'Drill · All', title: 'All document slots' };
    case 'complete-docs': return { eyebrow: 'Drill · Complete', title: 'On-file documents' };
    case 'expired-docs': return { eyebrow: 'Drill · Expired', title: 'Expired documents' };
    case 'missing-docs': return { eyebrow: 'Drill · Missing', title: 'Missing documents' };
    case 'slot-by-status':
      return { eyebrow: 'Drill · Status', title: segment ? `Status: ${segment}` : 'By status' };
    case 'missing-by-slot':
      return { eyebrow: 'Drill · Slot', title: segment ? `Missing: ${segment}` : 'Missing by slot' };
    case 'level-applicants':
      return { eyebrow: 'Drill · Level', title: segment ? `Level: ${segment}` : 'By level' };
    case 'revisions-on-day':
      return { eyebrow: 'Drill · Revisions', title: segment ? `Revisions on ${segment}` : 'Revisions' };
  }
}
