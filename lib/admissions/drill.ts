import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';

// Drill-down primitives shared across every Admissions drill target.
//
// One unified `DrillRow` shape powers all 12 drill surfaces. Each target
// pre-filters the row set; the same shape is sent to the client component
// (which then filters/sorts/groups locally without further network calls).
//
// CSV export delegates to the same helpers, so the downloaded file matches
// what the user sees on screen.

const CACHE_TTL_SECONDS = 60;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

function tags(ayCode: string): string[] {
  return ['admissions-drill', `admissions-drill:${ayCode}`];
}

// ---------------------------------------------------------------------------
// Types

export type DrillTarget =
  | 'applications'
  | 'enrolled'
  | 'conversion'
  | 'avg-time'
  | 'funnel-stage'
  | 'pipeline-stage'
  | 'referral'
  | 'assessment'
  | 'time-to-enroll-bucket'
  | 'applications-by-level'
  | 'doc-completion'
  | 'outdated';

export type DrillScope = 'range' | 'ay' | 'all';

export type DrillRow = {
  enroleeNumber: string;
  studentNumber: string | null;
  fullName: string;
  status: string;
  level: string | null;
  stage: string | null;
  referralSource: string | null;
  assessmentMath: string | null;
  assessmentEnglish: string | null;
  assessmentOutcome: string | null; // pass | fail | unknown (combined)
  applicationDate: string | null; // ISO
  enrollmentDate: string | null; // ISO
  daysToEnroll: number | null;
  daysSinceUpdate: number | null;
  daysInPipeline: number;
  hasMissingDocs: boolean;
  documentsComplete: number; // count of present core docs
  documentsTotal: number; // count of core doc slots tracked
};

export type DrillRangeInput = {
  ayCode: string;
  scope: DrillScope;
  /** When scope='range', clamp by these dates. Ignored for 'ay'/'all'. */
  from?: string;
  to?: string;
};

// ---------------------------------------------------------------------------
// Stage derivation
//
// Pipeline stage = rightmost timestamped step the application has reached.
// Mirrors the SIS records-tab stage logic but adapted for admissions. Status
// is the source of truth; stage is a UI grouping.

function deriveStage(status: string | null): string {
  const s = (status ?? '').trim();
  if (!s) return 'No status';
  return s;
}

function classifyAssessmentValue(raw: string | number | null): 'pass' | 'fail' | 'unknown' {
  if (raw === null || raw === undefined) return 'unknown';
  if (typeof raw === 'number') return raw >= 60 ? 'pass' : 'fail';
  const s = String(raw).trim();
  if (!s) return 'unknown';
  const n = Number(s);
  if (!Number.isNaN(n)) return n >= 60 ? 'pass' : 'fail';
  const letter = s.toUpperCase()[0];
  if (['A', 'B', 'C'].includes(letter)) return 'pass';
  if (['D', 'F'].includes(letter)) return 'fail';
  return 'unknown';
}

function combinedAssessmentOutcome(
  math: string | number | null,
  eng: string | number | null,
): 'pass' | 'fail' | 'unknown' {
  const m = classifyAssessmentValue(math);
  const e = classifyAssessmentValue(eng);
  if (m === 'unknown' && e === 'unknown') return 'unknown';
  if (m === 'fail' || e === 'fail') return 'fail';
  if (m === 'pass' && e === 'pass') return 'pass';
  // mixed pass/unknown — we surface as the better-known signal: pass if any
  // pass and no fail, otherwise unknown.
  if (m === 'pass' || e === 'pass') return 'pass';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Server-side fetch

const CORE_DOC_STATUS_COLUMNS = [
  'medicalStatus',
  'passportStatus',
  'birthCertStatus',
  'educCertStatus',
  'idPictureStatus',
] as const;

type DocRow = Record<(typeof CORE_DOC_STATUS_COLUMNS)[number] | 'enroleeNumber', string | null>;

async function loadDrillRowsUncached(input: DrillRangeInput): Promise<DrillRow[]> {
  const prefix = prefixFor(input.ayCode);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;
  const docsTable = `${prefix}_enrolment_documents`;

  const supabase = createAdmissionsClient();

  const [appsRes, statusRes, docsRes] = await Promise.all([
    supabase
      .from(appsTable)
      .select(
        'enroleeNumber, studentNumber, enroleeFullName, firstName, lastName, levelApplied, created_at, howDidYouKnowAboutHFSEIS',
      ),
    supabase
      .from(statusTable)
      .select(
        'enroleeNumber, applicationStatus, applicationUpdatedDate, classLevel, levelApplied, assessmentGradeMath, assessmentGradeEnglish',
      ),
    supabase
      .from(docsTable)
      .select(
        `enroleeNumber, ${CORE_DOC_STATUS_COLUMNS.join(', ')}`,
      ),
  ]);

  if (appsRes.error) {
    console.error('[admissions-drill] apps fetch failed:', appsRes.error.message);
    return [];
  }
  if (statusRes.error) {
    console.error('[admissions-drill] status fetch failed:', statusRes.error.message);
    return [];
  }
  if (docsRes.error) {
    // Docs failure is non-fatal — we still return rows with documentsComplete=0.
    console.warn('[admissions-drill] docs fetch failed (non-fatal):', docsRes.error.message);
  }

  type AppLite = {
    enroleeNumber: string | null;
    studentNumber: string | null;
    enroleeFullName: string | null;
    firstName: string | null;
    lastName: string | null;
    levelApplied: string | null;
    created_at: string | null;
    howDidYouKnowAboutHFSEIS: string | null;
  };
  type StatusLite = {
    enroleeNumber: string | null;
    applicationStatus: string | null;
    applicationUpdatedDate: string | null;
    classLevel: string | null;
    levelApplied: string | null;
    assessmentGradeMath: string | number | null;
    assessmentGradeEnglish: string | number | null;
  };

  const apps = (appsRes.data ?? []) as AppLite[];
  const statuses = (statusRes.data ?? []) as StatusLite[];
  const docs = ((docsRes.data ?? []) as unknown as DocRow[]);

  const statusByEnrolee = new Map<string, StatusLite>();
  for (const s of statuses) {
    if (s.enroleeNumber) statusByEnrolee.set(s.enroleeNumber, s);
  }
  const docsByEnrolee = new Map<string, DocRow>();
  for (const d of docs) {
    if (d.enroleeNumber) docsByEnrolee.set(d.enroleeNumber, d);
  }

  const today = Date.now();
  const ENROLLED_STATUSES = new Set(['Enrolled', 'Enrolled (Conditional)']);

  const out: DrillRow[] = [];
  for (const a of apps) {
    if (!a.enroleeNumber) continue;
    const s = statusByEnrolee.get(a.enroleeNumber);
    const d = docsByEnrolee.get(a.enroleeNumber);

    const status = (s?.applicationStatus ?? '').trim();
    const updated = s?.applicationUpdatedDate ?? a.created_at ?? null;

    const createdMs = a.created_at ? Date.parse(a.created_at) : NaN;
    const updatedMs = updated ? Date.parse(updated) : NaN;

    const isEnrolled = ENROLLED_STATUSES.has(status);
    const enrollmentDate = isEnrolled ? updated : null;

    const daysToEnroll =
      isEnrolled && !Number.isNaN(createdMs) && !Number.isNaN(updatedMs) && updatedMs >= createdMs
        ? Math.round((updatedMs - createdMs) / 86_400_000)
        : null;
    const daysSinceUpdate = !Number.isNaN(updatedMs)
      ? Math.floor((today - updatedMs) / 86_400_000)
      : null;
    const daysInPipeline = !Number.isNaN(createdMs)
      ? Math.floor((today - createdMs) / 86_400_000)
      : 0;

    let documentsComplete = 0;
    const documentsTotal = CORE_DOC_STATUS_COLUMNS.length;
    if (d) {
      for (const col of CORE_DOC_STATUS_COLUMNS) {
        const v = d[col];
        if (v && String(v).trim() !== '' && String(v).toLowerCase() !== 'missing') {
          documentsComplete += 1;
        }
      }
    }

    out.push({
      enroleeNumber: a.enroleeNumber,
      studentNumber: a.studentNumber,
      fullName:
        (a.enroleeFullName ?? '').trim() ||
        `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() ||
        a.enroleeNumber,
      status: status || 'No status',
      level: s?.classLevel ?? a.levelApplied ?? s?.levelApplied ?? null,
      stage: deriveStage(status),
      referralSource: (a.howDidYouKnowAboutHFSEIS ?? '').trim() || null,
      assessmentMath: s?.assessmentGradeMath != null ? String(s.assessmentGradeMath) : null,
      assessmentEnglish: s?.assessmentGradeEnglish != null ? String(s.assessmentGradeEnglish) : null,
      assessmentOutcome: combinedAssessmentOutcome(
        s?.assessmentGradeMath ?? null,
        s?.assessmentGradeEnglish ?? null,
      ),
      applicationDate: a.created_at,
      enrollmentDate,
      daysToEnroll,
      daysSinceUpdate,
      daysInPipeline,
      hasMissingDocs: documentsComplete < documentsTotal,
      documentsComplete,
      documentsTotal,
    });
  }
  return out;
}

function applyScopeFilter(rows: DrillRow[], input: DrillRangeInput): DrillRow[] {
  if (input.scope !== 'range') return rows;
  const from = input.from;
  const to = input.to;
  if (!from || !to) return rows;
  return rows.filter((r) => {
    if (!r.applicationDate) return false;
    const d = r.applicationDate.slice(0, 10);
    return d >= from && d <= to;
  });
}

export async function buildDrillRows(input: DrillRangeInput): Promise<DrillRow[]> {
  const cached = await unstable_cache(
    () => loadDrillRowsUncached({ ayCode: input.ayCode, scope: 'all' }),
    ['admissions-drill', 'rows', input.ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tags(input.ayCode) },
  )();
  return applyScopeFilter(cached, input);
}

// ---------------------------------------------------------------------------
// Per-target filter — narrows the unified row set to the rows the user
// expected to see when they clicked the surface.

export function applyTargetFilter(
  rows: DrillRow[],
  target: DrillTarget,
  segment?: string | null,
): DrillRow[] {
  switch (target) {
    case 'applications':
      return rows;
    case 'enrolled':
      return rows.filter(
        (r) => r.status === 'Enrolled' || r.status === 'Enrolled (Conditional)',
      );
    case 'conversion':
      return rows;
    case 'avg-time':
      return rows.filter((r) => r.daysToEnroll !== null);
    case 'funnel-stage': {
      // Cumulative funnel — every later stage row counts toward earlier stages.
      const stages = ['Submitted', 'Ongoing Verification', 'Processing', 'Enrolled'];
      const idx = stages.indexOf(segment ?? '');
      if (idx === -1) return rows;
      const ENROLLED = ['Enrolled', 'Enrolled (Conditional)'];
      return rows.filter((r) => {
        if (segment === 'Submitted') {
          return r.status !== 'Cancelled' && r.status !== 'Withdrawn';
        }
        if (segment === 'Ongoing Verification') {
          return ['Ongoing Verification', 'Processing', ...ENROLLED].includes(r.status);
        }
        if (segment === 'Processing') {
          return ['Processing', ...ENROLLED].includes(r.status);
        }
        if (segment === 'Enrolled') {
          return ENROLLED.includes(r.status);
        }
        return true;
      });
    }
    case 'pipeline-stage':
      if (!segment) return rows;
      return rows.filter((r) => r.stage === segment || r.status === segment);
    case 'referral':
      if (!segment) return rows;
      if (segment === 'Not specified') {
        return rows.filter((r) => !r.referralSource);
      }
      if (segment === 'Other') {
        // "Other" bucket — rows whose source isn't in the top-N. The page
        // already collapses these server-side; here we mirror by checking
        // source != any of the listed segments. The drill API endpoint
        // also accepts the explicit list via the `segment` param, but for
        // a simple dashboard segment we fall back to "all rows except
        // already-named buckets" — handled at the route level.
        return rows.filter((r) => r.referralSource && r.referralSource !== 'Other');
      }
      return rows.filter((r) => r.referralSource === segment);
    case 'assessment':
      if (!segment) return rows;
      return rows.filter((r) => r.assessmentOutcome === segment);
    case 'time-to-enroll-bucket': {
      if (!segment) return rows.filter((r) => r.daysToEnroll !== null);
      const bucket = parseTimeToEnrollBucket(segment);
      if (!bucket) return rows;
      return rows.filter((r) => {
        if (r.daysToEnroll === null) return false;
        if (bucket.hi === null) return r.daysToEnroll >= bucket.lo;
        return r.daysToEnroll >= bucket.lo && r.daysToEnroll <= bucket.hi;
      });
    }
    case 'applications-by-level':
      if (!segment) return rows;
      return rows.filter((r) => r.level === segment);
    case 'doc-completion':
      if (!segment) return rows.filter((r) => r.hasMissingDocs);
      // segment can be a level string OR "missing" / "complete"
      if (segment === 'missing') return rows.filter((r) => r.hasMissingDocs);
      if (segment === 'complete') return rows.filter((r) => !r.hasMissingDocs);
      return rows.filter((r) => r.level === segment);
    case 'outdated':
      // Outdated = stale & active (≥7 days since update, status not closed).
      return rows.filter((r) => {
        const closed = ['Enrolled', 'Enrolled (Conditional)', 'Cancelled', 'Withdrawn'].includes(
          r.status,
        );
        if (closed) return false;
        return r.daysSinceUpdate === null || r.daysSinceUpdate >= 7;
      });
    default:
      return rows;
  }
}

function parseTimeToEnrollBucket(segment: string): { lo: number; hi: number | null } | null {
  // Matches "0–7d", "8–14d", "31–60d", ">180d".
  const range = /^(\d+)[–-](\d+)d$/.exec(segment);
  if (range) return { lo: Number(range[1]), hi: Number(range[2]) };
  const open = /^>\s*(\d+)d$/.exec(segment);
  if (open) return { lo: Number(open[1]) + 1, hi: null };
  return null;
}

// ---------------------------------------------------------------------------
// Per-target column defaults — drives which columns a drill renders by
// default. The Columns dropdown can toggle hidden columns on.

export type DrillColumnKey =
  | 'enroleeNumber'
  | 'studentNumber'
  | 'fullName'
  | 'status'
  | 'level'
  | 'stage'
  | 'referralSource'
  | 'assessmentOutcome'
  | 'applicationDate'
  | 'enrollmentDate'
  | 'daysToEnroll'
  | 'daysSinceUpdate'
  | 'daysInPipeline'
  | 'documentsComplete';

export const ALL_DRILL_COLUMNS: DrillColumnKey[] = [
  'fullName',
  'enroleeNumber',
  'studentNumber',
  'status',
  'level',
  'stage',
  'applicationDate',
  'enrollmentDate',
  'daysToEnroll',
  'daysSinceUpdate',
  'daysInPipeline',
  'referralSource',
  'assessmentOutcome',
  'documentsComplete',
];

export function defaultColumnsForTarget(target: DrillTarget): DrillColumnKey[] {
  switch (target) {
    case 'applications':
      return ['fullName', 'enroleeNumber', 'status', 'level', 'applicationDate', 'daysSinceUpdate'];
    case 'enrolled':
      return [
        'fullName',
        'enroleeNumber',
        'level',
        'applicationDate',
        'enrollmentDate',
        'daysToEnroll',
      ];
    case 'conversion':
      return ['fullName', 'enroleeNumber', 'status', 'level', 'applicationDate', 'daysToEnroll'];
    case 'avg-time':
      return [
        'fullName',
        'enroleeNumber',
        'level',
        'applicationDate',
        'enrollmentDate',
        'daysToEnroll',
      ];
    case 'funnel-stage':
    case 'pipeline-stage':
      return ['fullName', 'enroleeNumber', 'stage', 'status', 'level', 'daysSinceUpdate'];
    case 'referral':
      return ['fullName', 'enroleeNumber', 'referralSource', 'status', 'level', 'applicationDate'];
    case 'assessment':
      return ['fullName', 'enroleeNumber', 'assessmentOutcome', 'level', 'status'];
    case 'time-to-enroll-bucket':
      return [
        'fullName',
        'enroleeNumber',
        'level',
        'applicationDate',
        'enrollmentDate',
        'daysToEnroll',
      ];
    case 'applications-by-level':
      return ['fullName', 'enroleeNumber', 'level', 'status', 'applicationDate'];
    case 'doc-completion':
      return ['fullName', 'enroleeNumber', 'level', 'documentsComplete', 'daysSinceUpdate'];
    case 'outdated':
      return ['fullName', 'enroleeNumber', 'status', 'level', 'daysSinceUpdate'];
    default:
      return ['fullName', 'enroleeNumber', 'status', 'level'];
  }
}

export const DRILL_COLUMN_LABELS: Record<DrillColumnKey, string> = {
  enroleeNumber: 'Enrolee #',
  studentNumber: 'Student #',
  fullName: 'Applicant',
  status: 'Status',
  level: 'Level',
  stage: 'Stage',
  referralSource: 'Referral source',
  assessmentOutcome: 'Assessment',
  applicationDate: 'App date',
  enrollmentDate: 'Enrolled on',
  daysToEnroll: 'Days to enroll',
  daysSinceUpdate: 'Days since update',
  daysInPipeline: 'Days in pipeline',
  documentsComplete: 'Documents',
};

// Title + eyebrow per target. Used in the drill sheet header.
export function drillHeaderForTarget(
  target: DrillTarget,
  segment?: string | null,
): { eyebrow: string; title: string } {
  switch (target) {
    case 'applications':
      return { eyebrow: 'Drill · Applications', title: 'Applications in scope' };
    case 'enrolled':
      return { eyebrow: 'Drill · Enrolled', title: 'Applicants enrolled' };
    case 'conversion':
      return { eyebrow: 'Drill · Conversion rate', title: 'Conversion-rate cohort' };
    case 'avg-time':
      return { eyebrow: 'Drill · Time to enroll', title: 'Days from application to enrollment' };
    case 'funnel-stage':
      return {
        eyebrow: 'Drill · Funnel stage',
        title: segment ? `Reached: ${segment}` : 'Funnel stage',
      };
    case 'pipeline-stage':
      return {
        eyebrow: 'Drill · Pipeline stage',
        title: segment ? `Currently at: ${segment}` : 'Pipeline stage',
      };
    case 'referral':
      return {
        eyebrow: 'Drill · Referral source',
        title: segment ? `From: ${segment}` : 'Referral source',
      };
    case 'assessment':
      return {
        eyebrow: 'Drill · Assessment',
        title: segment ? `Assessment: ${segment}` : 'Assessment outcome',
      };
    case 'time-to-enroll-bucket':
      return {
        eyebrow: 'Drill · Time-to-enroll bucket',
        title: segment ? `Bucket: ${segment}` : 'Time-to-enroll bucket',
      };
    case 'applications-by-level':
      return {
        eyebrow: 'Drill · By level',
        title: segment ? `Level: ${segment}` : 'Applications by level',
      };
    case 'doc-completion':
      return {
        eyebrow: 'Drill · Documents',
        title:
          segment === 'missing'
            ? 'Applicants missing documents'
            : segment === 'complete'
              ? 'Applicants with all documents'
              : segment
                ? `${segment}: missing documents`
                : 'Document completeness',
      };
    case 'outdated':
      return { eyebrow: 'Drill · Outdated', title: 'Stale active applications' };
    default:
      return { eyebrow: 'Drill', title: 'Applications' };
  }
}
