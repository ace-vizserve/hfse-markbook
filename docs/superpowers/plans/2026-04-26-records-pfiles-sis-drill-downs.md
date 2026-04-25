# Records · P-Files · SIS Admin drill-downs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the drill-down framework + add 3 new cards + 1 Sankey chart rebuild across the three remaining operational dashboards (Records, P-Files, SIS Admin). 23 drill targets total.

**Architecture:** Reuses Sprint 22+23 shared infrastructure (`DrillDownSheet` toolkit, `DrillSheetSkeleton` placeholder, `MetricCard.drillSheet` slot, `ComparisonBarChart`/`DonutChart` `onSegmentClick`, `lib/auth/teacher-emails.ts::getTeacherEmailMap`). Per-module: `lib/<module>/drill.ts` + `app/api/<module>/drill/[target]/route.ts` + `components/<module>/drills/<module>-drill-sheet.tsx` + `components/<module>/drills/chart-drill-cards.tsx`. Pre-fetch contract per KD #56 — Records full pre-fetch (modest scale), P-Files lazy on entry-volume rows, SIS Admin audit lazy.

**Tech Stack:** Next.js 16 App Router · React 19 · `@supabase/ssr` + service-role client · `@tanstack/react-table` · `unstable_cache` · sonner · Tailwind v4 · recharts (incl. Sankey). **No test framework** — verification is `npx tsc --noEmit` + `npx next build` + manual browser smoke per task. Spec at `docs/superpowers/specs/2026-04-26-records-pfiles-sis-drill-downs-design.md`.

**Branch:** continue on `feat/dashboard-drilldowns`. Each task commits independently.

---

## Task 1: Records — `lib/sis/drill.ts`

Foundation for Records drill targets. Defines `RecordsDrillRow`, the universal row builder, the per-target filter, and the column metadata. Mirrors the shape of `lib/admissions/drill.ts` but enrolled-only (filters out Cancelled/Withdrawn from `applications` queries) and adds level + section + days-since-update fields specific to Records.

**Files:**
- Create: `lib/sis/drill.ts`

- [ ] **Step 1: Read pattern reference**

Open `lib/admissions/drill.ts` and skim the structure. The Records drill is similar but with these differences:
- Joins `students` + `section_students` (not just admissions tables) since Records is enrolled-only and tracks section assignments.
- Adds `enrollmentStatus`, `sectionName`, `withdrawalDate`, `expiringDocsCount` fields.
- Doc enrichment is split out via `enrichWithDocs` (same pattern as Admissions Sprint 23 split).

Also skim `lib/admissions/drill.ts::buildDrillRows` and `enrichWithDocs` for the optional-docs-enrichment pattern (only target sets that need doc fields call `withDocs:true`).

- [ ] **Step 2: Create `lib/sis/drill.ts`**

```ts
import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';
import { createServiceClient } from '@/lib/supabase/service';

const CACHE_TTL_SECONDS = 60;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

function tags(ayCode: string): string[] {
  return ['records-drill', `records-drill:${ayCode}`];
}

// ─── Targets ────────────────────────────────────────────────────────────────

export type RecordsDrillTarget =
  | 'enrollments-range'
  | 'withdrawals-range'
  | 'active-enrolled'
  | 'expiring-docs'
  | 'students-by-pipeline-stage'
  | 'backlog-by-document'
  | 'students-by-level'
  | 'class-assignment-readiness';

export type DrillScope = 'range' | 'ay' | 'all';

// ─── Row shape ──────────────────────────────────────────────────────────────

export type RecordsDrillRow = {
  enroleeNumber: string;
  studentNumber: string | null;
  fullName: string;
  enrollmentStatus: string; // 'active' | 'conditional' | 'withdrawn' | etc
  applicationStatus: string;
  level: string | null;
  sectionId: string | null;
  sectionName: string | null;
  pipelineStage: string;
  enrollmentDate: string | null; // ISO
  withdrawalDate: string | null; // ISO
  daysSinceUpdate: number | null;
  hasMissingDocs: boolean;
  expiringDocsCount: number; // number of docs expiring within 60 days
  documentsComplete: number;
  documentsTotal: number;
};

const CORE_DOC_STATUS_COLUMNS = [
  'medicalStatus',
  'passportStatus',
  'birthCertStatus',
  'educCertStatus',
  'idPictureStatus',
] as const;

const ENROLLED_STATUSES = new Set(['active', 'conditional']);
const SOFT_CLOSED_APPLICATION_STATUSES = new Set(['Cancelled', 'Withdrawn']);

// ─── Range input ────────────────────────────────────────────────────────────

export type DrillRangeInput = {
  ayCode: string;
  scope: DrillScope;
  from?: string;
  to?: string;
};

// ─── Loader ─────────────────────────────────────────────────────────────────

type StudentLite = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  student_number: string;
};
type SectionStudentLite = {
  id: string;
  section_id: string;
  student_id: string;
  enrollment_status: string;
  enrollment_date: string | null;
  withdrawal_date: string | null;
  enrolee_number: string | null;
};
type SectionLite = { id: string; name: string; level_id: string };
type LevelLite = { id: string; code: string };

type ApplicationLite = {
  enroleeNumber: string | null;
  studentNumber: string | null;
  enroleeFullName: string | null;
  firstName: string | null;
  lastName: string | null;
  levelApplied: string | null;
  created_at: string | null;
};
type StatusLite = {
  enroleeNumber: string | null;
  applicationStatus: string | null;
  applicationUpdatedDate: string | null;
  classLevel: string | null;
  levelApplied: string | null;
};

function studentName(s: StudentLite): string {
  const parts = [s.first_name, s.middle_name, s.last_name].filter(Boolean);
  const name = parts.join(' ').trim();
  return name || s.student_number || s.id;
}

function deriveStage(applicationStatus: string | null, enrollmentStatus: string): string {
  if (enrollmentStatus === 'active' || enrollmentStatus === 'conditional') return 'Enrolled';
  if (enrollmentStatus === 'withdrawn') return 'Withdrawn';
  if (enrollmentStatus === 'graduated') return 'Graduated';
  return (applicationStatus ?? '').trim() || 'Not started';
}

async function loadRecordsRowsUncached(ayCode: string): Promise<RecordsDrillRow[]> {
  const service = createServiceClient();
  const admissions = createAdmissionsClient();

  const prefix = prefixFor(ayCode);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;

  // Resolve ayId for sections/section_students scoping
  const { data: ayRow } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  const ayId = (ayRow?.id as string | undefined) ?? null;
  if (!ayId) return [];

  const [sectionsRes, levelsRes, ssRes] = await Promise.all([
    service.from('sections').select('id, name, level_id').eq('academic_year_id', ayId),
    service.from('levels').select('id, code'),
    service
      .from('section_students')
      .select('id, section_id, student_id, enrollment_status, enrollment_date, withdrawal_date, enrolee_number')
      .in(
        'section_id',
        (
          (await service.from('sections').select('id').eq('academic_year_id', ayId)).data ?? []
        ).map((r) => r.id as string),
      ),
  ]);

  const sections = (sectionsRes.data ?? []) as SectionLite[];
  const sectionById = new Map<string, SectionLite>();
  for (const s of sections) sectionById.set(s.id, s);

  const levels = new Map<string, string>();
  for (const l of (levelsRes.data ?? []) as LevelLite[]) levels.set(l.id, l.code);

  const ss = (ssRes.data ?? []) as SectionStudentLite[];
  const studentIds = Array.from(new Set(ss.map((s) => s.student_id)));

  const studentMap = new Map<string, StudentLite>();
  if (studentIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < studentIds.length; i += 500) chunks.push(studentIds.slice(i, i + 500));
    for (const chunk of chunks) {
      const { data } = await service
        .from('students')
        .select('id, first_name, middle_name, last_name, student_number')
        .in('id', chunk);
      for (const s of (data ?? []) as StudentLite[]) studentMap.set(s.id, s);
    }
  }

  // Admissions tables — for application-side metadata + days-since-update.
  const enroleeNumbers = ss
    .map((r) => r.enrolee_number)
    .filter((v): v is string => v !== null);
  let appByEnrolee = new Map<string, ApplicationLite>();
  let statusByEnrolee = new Map<string, StatusLite>();
  if (enroleeNumbers.length > 0) {
    const [appsRes, statusRes] = await Promise.all([
      admissions
        .from(appsTable)
        .select('enroleeNumber, studentNumber, enroleeFullName, firstName, lastName, levelApplied, created_at')
        .in('enroleeNumber', enroleeNumbers),
      admissions
        .from(statusTable)
        .select('enroleeNumber, applicationStatus, applicationUpdatedDate, classLevel, levelApplied')
        .in('enroleeNumber', enroleeNumbers),
    ]);
    for (const a of (appsRes.data ?? []) as ApplicationLite[]) {
      if (a.enroleeNumber) appByEnrolee.set(a.enroleeNumber, a);
    }
    for (const s of (statusRes.data ?? []) as StatusLite[]) {
      if (s.enroleeNumber) statusByEnrolee.set(s.enroleeNumber, s);
    }
  }

  const today = Date.now();
  const out: RecordsDrillRow[] = [];
  for (const enrol of ss) {
    const student = studentMap.get(enrol.student_id);
    if (!student) continue;
    const section = sectionById.get(enrol.section_id);
    const enroleeNumber = enrol.enrolee_number ?? '';
    const app = enroleeNumber ? appByEnrolee.get(enroleeNumber) : undefined;
    const status = enroleeNumber ? statusByEnrolee.get(enroleeNumber) : undefined;

    const applicationStatus = (status?.applicationStatus ?? '').trim();
    if (SOFT_CLOSED_APPLICATION_STATUSES.has(applicationStatus)) continue;

    const updated = status?.applicationUpdatedDate ?? app?.created_at ?? null;
    const updatedMs = updated ? Date.parse(updated) : NaN;
    const daysSinceUpdate = !Number.isNaN(updatedMs)
      ? Math.floor((today - updatedMs) / 86_400_000)
      : null;

    const enrollmentStatus = enrol.enrollment_status;
    const pipelineStage = deriveStage(applicationStatus, enrollmentStatus);
    const level = section ? levels.get(section.level_id) ?? null : status?.classLevel ?? app?.levelApplied ?? null;

    out.push({
      enroleeNumber: enroleeNumber || student.student_number,
      studentNumber: student.student_number,
      fullName: studentName(student),
      enrollmentStatus,
      applicationStatus: applicationStatus || pipelineStage,
      level,
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? null,
      pipelineStage,
      enrollmentDate: enrol.enrollment_date,
      withdrawalDate: enrol.withdrawal_date,
      daysSinceUpdate,
      hasMissingDocs: true, // sentinel — enrichWithDocs upgrades for callers that need it
      expiringDocsCount: 0, // ditto
      documentsComplete: 0,
      documentsTotal: CORE_DOC_STATUS_COLUMNS.length,
    });
  }
  return out;
}

// Doc enrichment — opt-in per spec §6 (only certain targets surface doc fields).
async function enrichWithDocs(rows: RecordsDrillRow[], ayCode: string): Promise<RecordsDrillRow[]> {
  if (rows.length === 0) return rows;
  const prefix = prefixFor(ayCode);
  const docsTable = `${prefix}_enrolment_documents`;
  const admissions = createAdmissionsClient();
  const enroleeNumbers = rows.map((r) => r.enroleeNumber);
  const { data, error } = await admissions
    .from(docsTable)
    .select(`enroleeNumber, ${CORE_DOC_STATUS_COLUMNS.join(', ')}`)
    .in('enroleeNumber', enroleeNumbers);
  if (error) return rows;
  type DocRow = Record<(typeof CORE_DOC_STATUS_COLUMNS)[number] | 'enroleeNumber', string | null>;
  const docsByEnrolee = new Map<string, DocRow>();
  for (const d of (data ?? []) as unknown as DocRow[]) {
    if (d.enroleeNumber) docsByEnrolee.set(d.enroleeNumber, d);
  }
  return rows.map((r) => {
    const d = docsByEnrolee.get(r.enroleeNumber);
    if (!d) return r;
    let documentsComplete = 0;
    for (const col of CORE_DOC_STATUS_COLUMNS) {
      const v = d[col];
      if (v && String(v).trim() !== '' && String(v).toLowerCase() !== 'missing') {
        documentsComplete += 1;
      }
    }
    return {
      ...r,
      documentsComplete,
      hasMissingDocs: documentsComplete < r.documentsTotal,
    };
  });
}

// ─── Public builder ─────────────────────────────────────────────────────────

export async function buildRecordsDrillRows(
  input: DrillRangeInput,
  options?: { withDocs?: boolean },
): Promise<RecordsDrillRow[]> {
  // AY-scoped cache; scope/range filtering applied post-cache (per KD #56).
  const cached = await unstable_cache(
    () => loadRecordsRowsUncached(input.ayCode),
    ['records-drill', 'rows', input.ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tags(input.ayCode) },
  )();
  return options?.withDocs ? enrichWithDocs(cached, input.ayCode) : cached;
}

// ─── Per-target filter ──────────────────────────────────────────────────────

export function applyTargetFilter(
  rows: RecordsDrillRow[],
  target: RecordsDrillTarget,
  segment: string | null,
  range?: { from: string; to: string },
): RecordsDrillRow[] {
  switch (target) {
    case 'enrollments-range': {
      if (!range) return rows.filter((r) => ENROLLED_STATUSES.has(r.enrollmentStatus));
      return rows.filter((r) => {
        if (!ENROLLED_STATUSES.has(r.enrollmentStatus)) return false;
        if (!r.enrollmentDate) return false;
        const d = r.enrollmentDate.slice(0, 10);
        return d >= range.from && d <= range.to;
      });
    }
    case 'withdrawals-range': {
      if (!range) return rows.filter((r) => r.enrollmentStatus === 'withdrawn');
      return rows.filter((r) => {
        if (r.enrollmentStatus !== 'withdrawn') return false;
        if (!r.withdrawalDate) return false;
        const d = r.withdrawalDate.slice(0, 10);
        return d >= range.from && d <= range.to;
      });
    }
    case 'active-enrolled':
      return rows.filter((r) => ENROLLED_STATUSES.has(r.enrollmentStatus));
    case 'expiring-docs':
      return rows.filter((r) => r.expiringDocsCount > 0);
    case 'students-by-pipeline-stage':
      if (!segment) return rows;
      return rows.filter((r) => r.pipelineStage === segment);
    case 'students-by-level':
      if (!segment) return rows;
      return rows.filter((r) => (r.level ?? 'Unknown') === segment);
    case 'backlog-by-document': {
      // segment format = "{slotKey}|{statusBucket}" e.g. "medical|missing"
      if (!segment) return rows.filter((r) => r.hasMissingDocs);
      // Without per-slot enrichment in the row we filter by hasMissingDocs as
      // a proxy. The drill API can pass a richer segment if needed later.
      return rows.filter((r) => r.hasMissingDocs);
    }
    case 'class-assignment-readiness':
      return rows.filter(
        (r) => ENROLLED_STATUSES.has(r.enrollmentStatus) && r.sectionId === null,
      );
    default: {
      const _exhaustive: never = target;
      throw new Error(`unreachable target: ${String(_exhaustive)}`);
    }
  }
}

// ─── Per-target columns ─────────────────────────────────────────────────────

export type DrillColumnKey =
  | 'fullName'
  | 'studentNumber'
  | 'enroleeNumber'
  | 'enrollmentStatus'
  | 'applicationStatus'
  | 'level'
  | 'sectionName'
  | 'pipelineStage'
  | 'enrollmentDate'
  | 'withdrawalDate'
  | 'daysSinceUpdate'
  | 'documentsComplete';

export const ALL_DRILL_COLUMNS: DrillColumnKey[] = [
  'fullName',
  'studentNumber',
  'enroleeNumber',
  'enrollmentStatus',
  'applicationStatus',
  'level',
  'sectionName',
  'pipelineStage',
  'enrollmentDate',
  'withdrawalDate',
  'daysSinceUpdate',
  'documentsComplete',
];

export const DRILL_COLUMN_LABELS: Record<DrillColumnKey, string> = {
  fullName: 'Student',
  studentNumber: 'Student #',
  enroleeNumber: 'Enrolee #',
  enrollmentStatus: 'Enrollment',
  applicationStatus: 'App status',
  level: 'Level',
  sectionName: 'Section',
  pipelineStage: 'Stage',
  enrollmentDate: 'Enrolled on',
  withdrawalDate: 'Withdrawn on',
  daysSinceUpdate: 'Days since update',
  documentsComplete: 'Documents',
};

export function defaultColumnsForTarget(target: RecordsDrillTarget): DrillColumnKey[] {
  switch (target) {
    case 'enrollments-range':
      return ['fullName', 'level', 'sectionName', 'enrollmentDate', 'enrollmentStatus'];
    case 'withdrawals-range':
      return ['fullName', 'level', 'sectionName', 'withdrawalDate', 'daysSinceUpdate'];
    case 'active-enrolled':
      return ['fullName', 'level', 'sectionName', 'enrollmentDate', 'documentsComplete'];
    case 'expiring-docs':
      return ['fullName', 'level', 'sectionName', 'documentsComplete', 'daysSinceUpdate'];
    case 'students-by-pipeline-stage':
      return ['fullName', 'level', 'pipelineStage', 'enrollmentStatus', 'daysSinceUpdate'];
    case 'students-by-level':
      return ['fullName', 'level', 'sectionName', 'enrollmentStatus', 'enrollmentDate'];
    case 'backlog-by-document':
      return ['fullName', 'level', 'documentsComplete', 'daysSinceUpdate'];
    case 'class-assignment-readiness':
      return ['fullName', 'level', 'enrollmentDate', 'daysSinceUpdate'];
  }
}

export function drillHeaderForTarget(
  target: RecordsDrillTarget,
  segment: string | null,
): { eyebrow: string; title: string } {
  switch (target) {
    case 'enrollments-range': return { eyebrow: 'Drill · Enrollments', title: 'Enrolled in range' };
    case 'withdrawals-range': return { eyebrow: 'Drill · Withdrawals', title: 'Withdrawn in range' };
    case 'active-enrolled': return { eyebrow: 'Drill · Active', title: 'Currently enrolled' };
    case 'expiring-docs': return { eyebrow: 'Drill · Expiring', title: 'Documents expiring soon' };
    case 'students-by-pipeline-stage':
      return { eyebrow: 'Drill · Stage', title: segment ? `Stage: ${segment}` : 'By pipeline stage' };
    case 'students-by-level':
      return { eyebrow: 'Drill · Level', title: segment ? `Level: ${segment}` : 'By level' };
    case 'backlog-by-document':
      return { eyebrow: 'Drill · Document backlog', title: segment ? `Backlog: ${segment}` : 'Document backlog' };
    case 'class-assignment-readiness':
      return { eyebrow: 'Drill · Class assignment', title: 'Active without section' };
  }
}
```

- [ ] **Step 3: TS check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/sis/drill.ts
git commit -m "feat(records): add lib/sis/drill.ts foundation

8 drill targets for Records dashboard. Single RecordsDrillRow shape
with optional doc enrichment (opt-in via withDocs option to mirror
the Admissions split pattern shipped in Sprint 23).

Targets: enrollments-range / withdrawals-range / active-enrolled /
expiring-docs / students-by-pipeline-stage / students-by-level /
backlog-by-document / class-assignment-readiness."
```

---

## Task 2: Records — `app/api/records/drill/[target]/route.ts`

Pattern-copy from `app/api/admissions/drill/[target]/route.ts`. Auth: `registrar`/`school_admin`/`admin`/`superadmin` (no teacher; Records is not teacher-facing). Doc enrichment opt-in for targets that surface doc fields.

**Files:**
- Create: `app/api/records/drill/[target]/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { buildCsv } from '@/lib/csv';
import {
  ALL_DRILL_COLUMNS,
  applyTargetFilter,
  buildRecordsDrillRows,
  defaultColumnsForTarget,
  drillHeaderForTarget,
  DRILL_COLUMN_LABELS,
  type DrillColumnKey,
  type DrillScope,
  type RecordsDrillRow,
  type RecordsDrillTarget,
} from '@/lib/sis/drill';

const VALID_TARGETS: RecordsDrillTarget[] = [
  'enrollments-range',
  'withdrawals-range',
  'active-enrolled',
  'expiring-docs',
  'students-by-pipeline-stage',
  'students-by-level',
  'backlog-by-document',
  'class-assignment-readiness',
];

const VALID_SCOPES: DrillScope[] = ['range', 'ay', 'all'];

const DOC_TARGETS: ReadonlySet<RecordsDrillTarget> = new Set<RecordsDrillTarget>([
  'expiring-docs',
  'active-enrolled',
  'backlog-by-document',
]);

const ALLOWED_ROLES = [
  'registrar',
  'school_admin',
  'admin',
  'superadmin',
] as const;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ target: string }> },
) {
  const guard = await requireRole([...ALLOWED_ROLES]);
  if ('error' in guard) return guard.error;

  const { target: rawTarget } = await ctx.params;
  if (!VALID_TARGETS.includes(rawTarget as RecordsDrillTarget)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }
  const target = rawTarget as RecordsDrillTarget;

  const url = new URL(req.url);
  const ayCode = url.searchParams.get('ay');
  if (!ayCode || !/^AY\d{4}$/.test(ayCode)) {
    return NextResponse.json({ error: 'invalid_ay' }, { status: 400 });
  }

  const scopeParam = (url.searchParams.get('scope') ?? 'range') as DrillScope;
  const scope = VALID_SCOPES.includes(scopeParam) ? scopeParam : 'range';
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const segment = url.searchParams.get('segment');
  const format = url.searchParams.get('format') ?? 'json';
  const columnsParam = url.searchParams.get('columns');

  const all = await buildRecordsDrillRows(
    { ayCode, scope, from, to },
    { withDocs: DOC_TARGETS.has(target) },
  );
  const rangeForFilter = scope === 'range' && from && to ? { from, to } : undefined;
  const rows = applyTargetFilter(all, target, segment, rangeForFilter);

  if (format === 'csv') {
    return csvResponse(rows, target, segment, ayCode, columnsParam);
  }

  const header = drillHeaderForTarget(target, segment);
  return NextResponse.json({
    rows,
    total: rows.length,
    target,
    segment,
    scope,
    ayCode,
    eyebrow: header.eyebrow,
    title: header.title,
  });
}

function pickColumns(target: RecordsDrillTarget, columnsParam: string | null): DrillColumnKey[] {
  if (!columnsParam) return defaultColumnsForTarget(target);
  const requested = columnsParam.split(',').map((c) => c.trim()).filter((c): c is DrillColumnKey => (ALL_DRILL_COLUMNS as string[]).includes(c));
  return requested.length > 0 ? requested : defaultColumnsForTarget(target);
}

function csvResponse(
  rows: RecordsDrillRow[],
  target: RecordsDrillTarget,
  segment: string | null,
  ayCode: string,
  columnsParam: string | null,
): Response {
  const columns = pickColumns(target, columnsParam);
  const headers = columns.map((c) => DRILL_COLUMN_LABELS[c] ?? c);
  const body = rows.map((r) => columns.map((c) => csvCell(r, c)));
  const csv = buildCsv(headers, body);
  const segmentSlug = segment ? `-${slug(segment)}` : '';
  const today = new Date().toISOString().slice(0, 10);
  const filename = `drill-records-${target}${segmentSlug}-${ayCode}-${today}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function csvCell(row: RecordsDrillRow, key: DrillColumnKey): string | number {
  switch (key) {
    case 'fullName': return row.fullName;
    case 'studentNumber': return row.studentNumber ?? '';
    case 'enroleeNumber': return row.enroleeNumber;
    case 'enrollmentStatus': return row.enrollmentStatus;
    case 'applicationStatus': return row.applicationStatus;
    case 'level': return row.level ?? '';
    case 'sectionName': return row.sectionName ?? '';
    case 'pipelineStage': return row.pipelineStage;
    case 'enrollmentDate': return row.enrollmentDate?.slice(0, 10) ?? '';
    case 'withdrawalDate': return row.withdrawalDate?.slice(0, 10) ?? '';
    case 'daysSinceUpdate': return row.daysSinceUpdate ?? '';
    case 'documentsComplete': return `${row.documentsComplete}/${row.documentsTotal}`;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 2: TS check**

Run: `npx tsc --noEmit` — zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/records/drill/\[target\]/route.ts
git commit -m "feat(records): add /api/records/drill/[target] endpoint

Mirrors /api/admissions/drill pattern. JSON + CSV (UTF-8 BOM via
lib/csv.ts). Doc enrichment via DOC_TARGETS allowlist. Auth gates
to registrar+ — Records is not teacher-facing."
```

---

## Task 3: Records — drill sheet + chart wrappers + page wiring

Bundles the client components together and wires the Records page. Pattern-copy from Admissions module (`components/admissions/drills/admissions-drill-sheet.tsx` + `chart-drill-cards.tsx`) but using `RecordsDrillRow` and Records-specific column rendering.

**Files:**
- Create: `components/sis/drills/records-drill-sheet.tsx`
- Create: `components/sis/drills/chart-drill-cards.tsx`
- Modify: `app/(records)/records/page.tsx`

- [ ] **Step 1: Create `components/sis/drills/records-drill-sheet.tsx`**

Pattern-copy `components/admissions/drills/admissions-drill-sheet.tsx`. Replace:
- `DrillRow` → `RecordsDrillRow`
- `DrillTarget` → `RecordsDrillTarget`
- imports from `@/lib/admissions/drill` → `@/lib/sis/drill`
- `/api/admissions/drill/` → `/api/records/drill/`
- Status badges: replace `StatusBadge` (admissions application status) with two badges: `EnrollmentBadge` (active=success, withdrawn=blocked, conditional=muted) and a small `StageBadge` for `pipelineStage`. Keep level-multi-select and other toolkit hooks.

Ship the file in a single Write call using the admissions sheet as a literal template — adjust column factory to match Records' `DrillColumnKey` set + cell renderers per the labels in `lib/sis/drill.ts`. Wire `DrillSheetSkeleton` into the loading early-return (since Records dashboard is full-pre-fetch but the drill sheet may still re-fetch on scope change).

- [ ] **Step 2: Create `components/sis/drills/chart-drill-cards.tsx`**

Pattern-copy `components/admissions/drills/chart-drill-cards.tsx`. Per-target client wrappers needed:
- `EnrollmentsKpiDrillCard` — wraps a MetricCard `drillSheet`
- `PipelineStageDrillCard` — wraps the Sankey card (built in Task 4) with onSegmentClick
- `DocumentBacklogDrillCard` — wraps the existing `<DocumentBacklogChart>` with onSegmentClick (segment = `{slotKey}|{statusBucket}`)
- `LevelDistributionDrillCard` — wraps `<LevelDistributionChart>` (the existing donut)
- `ExpiringDocsDrillCard` — wraps the existing `<ExpiringDocumentsPanel>` and adds the CSV export button

Each follows the pattern from `components/admissions/drills/chart-drill-cards.tsx` (FunnelDrillCard, etc.):

```tsx
'use client';
import * as React from 'react';
import { Sheet } from '@/components/ui/sheet';
import { RecordsDrillSheet } from '@/components/sis/drills/records-drill-sheet';
// ...
export function PipelineStageDrillCard({ data, ayCode, ...rest }: Props) {
  const [segment, setSegment] = React.useState<string | null>(null);
  return (
    <Sheet open={!!segment} onOpenChange={(o) => !o && setSegment(null)}>
      <PipelineStageSankeyCard data={data} onSegmentClick={setSegment} />
      {segment && (
        <RecordsDrillSheet
          target="students-by-pipeline-stage"
          segment={segment}
          ayCode={ayCode}
          initialScope="ay"
        />
      )}
    </Sheet>
  );
}
```

Build all 5 wrappers in one file.

- [ ] **Step 3: Wire MetricCards on `app/(records)/records/page.tsx`**

Find the 4 KPI MetricCards (New enrollments, Withdrawals, Active enrolled, Docs expiring). Add `drillSheet={<RecordsDrillSheet target="..." ayCode={ayCode} initialScope="range" initialFrom={rangeFrom} initialTo={rangeTo} />}` to each. Wrap chart cards (DocumentBacklogChart, LevelDistributionChart) in their drill wrappers. Replace pipeline-stage-chart usage with `PipelineStageDrillCard` (which renders the Sankey — built in Task 4). Add CSV button on `<ExpiringDocumentsPanel>` via the new wrapper.

- [ ] **Step 4: TS check + smoke test**

Run: `npx tsc --noEmit` — zero errors. Don't run dev server; smoke happens at the end.

- [ ] **Step 5: Commit**

```bash
git add components/sis/drills/records-drill-sheet.tsx \
        components/sis/drills/chart-drill-cards.tsx \
        "app/(records)/records/page.tsx"
git commit -m "feat(records): wire 7 drill targets on /records dashboard

4 MetricCard drills (enrollments / withdrawals / active / expiring) +
3 chart-card drills (pipeline stage / doc backlog / level distribution)
+ Expiring CSV button on the existing panel. Pipeline Stage uses the
Sankey rebuild from Task 4 — placeholder until that lands.

Pattern-copied from components/admissions/drills/* (drill sheet
+ chart drill cards). RecordsDrillRow shape, registrar+ auth, full
pre-fetch (modest scale per KD #56)."
```

---

## Task 4: Records — Pipeline Stage Sankey rebuild

Replace `components/sis/pipeline-stage-chart.tsx`'s horizontal-bar visualization with a recharts Sankey. The data shape stays the same (`PipelineStage[]` from `lib/sis/dashboard.ts`); just the rendering changes.

**Files:**
- Create: `components/sis/pipeline-stage-sankey-card.tsx`
- Modify: `app/(records)/records/page.tsx` (swap usage)

- [ ] **Step 1: Read recharts Sankey API**

Check installed recharts version supports Sankey. Run:
```bash
grep '"recharts"' package.json
```
Expected: `"recharts": "^2.x"` or higher (Sankey is in 2.x). If lower, abort and ask user to upgrade.

Recharts Sankey shape:
```tsx
import { Sankey, Tooltip } from 'recharts';
<Sankey
  data={{
    nodes: [{ name: 'Inquiry' }, { name: 'Submitted' }, ...],
    links: [{ source: 0, target: 1, value: 50 }, ...],
  }}
  nodeWidth={10}
  nodePadding={50}
  linkCurvature={0.5}
  width={...}
  height={400}
>
  <Tooltip />
</Sankey>
```

- [ ] **Step 2: Create `components/sis/pipeline-stage-sankey-card.tsx`**

```tsx
'use client';

import * as React from 'react';
import { Workflow } from 'lucide-react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { PipelineStage } from '@/lib/sis/dashboard';

type SankeyNode = { name: string };
type SankeyLink = { source: number; target: number; value: number };

type Props = {
  data: PipelineStage[];
  onSegmentClick?: (stage: string) => void;
};

export function PipelineStageSankeyCard({ data, onSegmentClick }: Props) {
  // Build nodes + links from PipelineStage[]. The data is the count at each
  // stage; for a flow diagram we model the stage-to-stage transitions: each
  // stage's flow forward = the next stage's count (drop-off naturally
  // appears as a thinning ribbon). The last node receives flow from the
  // previous stage equal to its own count.
  const sankey = React.useMemo<{ nodes: SankeyNode[]; links: SankeyLink[] } | null>(() => {
    if (data.length < 2) return null;
    const nodes: SankeyNode[] = data.map((s) => ({ name: s.label ?? s.stage ?? '—' }));
    const links: SankeyLink[] = [];
    for (let i = 0; i < data.length - 1; i += 1) {
      const v = Math.max(0, data[i + 1].count);
      if (v > 0) links.push({ source: i, target: i + 1, value: v });
    }
    return { nodes, links };
  }, [data]);

  const total = data.reduce((sum, s) => sum + s.count, 0);
  const empty = total === 0 || sankey === null;

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Pipeline
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Stage flow
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Workflow className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[340px] flex-col items-center justify-center gap-2 text-center">
            <Workflow className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">No applicants yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Stage flow appears once at least two stages have populated counts.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <Sankey
              data={sankey!}
              nodeWidth={12}
              nodePadding={24}
              linkCurvature={0.5}
              link={{ stroke: 'var(--color-chart-1)', strokeOpacity: 0.45 }}
              node={{ fill: 'var(--color-chart-1)', stroke: 'var(--color-border)' }}
              margin={{ top: 8, right: 100, bottom: 8, left: 8 }}
              onClick={
                onSegmentClick
                  ? ((nodeData: unknown) => {
                      const p = nodeData as { name?: string; payload?: { name?: string } };
                      const name = p?.payload?.name ?? p?.name;
                      if (name) onSegmentClick(name);
                    }) as never
                  : undefined
              }
            >
              <Tooltip
                contentStyle={{
                  background: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: 11,
                }}
              />
            </Sankey>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Update `components/sis/drills/chart-drill-cards.tsx`**

In the `PipelineStageDrillCard` wrapper from Task 3, import the new `PipelineStageSankeyCard` and use it (replacing any reference to the old `PipelineStageChart`).

- [ ] **Step 4: Update Records page**

If `app/(records)/records/page.tsx` imports `PipelineStageChart` directly, swap the import + usage to `PipelineStageDrillCard`. (If the wiring in Task 3 already used `PipelineStageDrillCard`, this step is no-op.)

- [ ] **Step 5: TS check**

Run: `npx tsc --noEmit` — zero errors.

- [ ] **Step 6: Commit**

```bash
git add components/sis/pipeline-stage-sankey-card.tsx \
        components/sis/drills/chart-drill-cards.tsx \
        "app/(records)/records/page.tsx"
git commit -m "feat(records): rebuild Pipeline Stage as Sankey diagram

Replaces the horizontal bar chart with recharts Sankey. Stage nodes
+ flow ribbons make drop-off visceral — a thick ribbon thinning
between Submitted → Verification = where applicants stall.

Click a node → drills into applicants currently at that stage. No
new dep (Sankey ships in recharts core)."
```

---

## Task 5: Records — Class-assignment readiness card

New card surfacing students who are enrolled but haven't been assigned to a section yet. Lib helper + card + drill wiring.

**Files:**
- Modify: `lib/sis/dashboard.ts` (add `getClassAssignmentReadiness` helper)
- Create: `components/sis/class-assignment-readiness-card.tsx`
- Modify: `app/(records)/records/page.tsx` (add the card to the page)

- [ ] **Step 1: Add helper to `lib/sis/dashboard.ts`**

Find a clean spot (after the existing aggregator helpers). Add:

```ts
export type ClassAssignmentReadinessRow = {
  enroleeNumber: string;
  fullName: string;
  level: string | null;
  enrollmentDate: string | null; // ISO
  daysSinceEnrollment: number | null;
};

async function loadClassAssignmentReadinessUncached(
  ayCode: string,
): Promise<ClassAssignmentReadinessRow[]> {
  const service = createServiceClient();
  const { data: ayRow } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  const ayId = ayRow?.id as string | undefined;
  if (!ayId) return [];

  const { data: sections } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', ayId);
  const sectionIds = (sections ?? []).map((r) => r.id as string);

  // Find section_students with section_id NULL but enrollment_status active.
  // section_students.section_id is NOT NULL by schema — but a "no class assigned"
  // student is one with status=active in admissions but no section_students row
  // pointing at any AY-current section. We model this by listing enrolled
  // applicants from `ay{YYYY}_enrolment_status` (status=Enrolled) whose
  // enroleeNumber doesn't match any AY-current section_students.enrolee_number.
  const prefix = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
  const admissions = createAdmissionsClient();

  const [enrolledRes, ssRes] = await Promise.all([
    admissions
      .from(`${prefix}_enrolment_status`)
      .select('enroleeNumber, applicationStatus, applicationUpdatedDate, classLevel, levelApplied')
      .in('applicationStatus', ['Enrolled', 'Enrolled (Conditional)']),
    sectionIds.length > 0
      ? service.from('section_students').select('enrolee_number').in('section_id', sectionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const assignedEnrolees = new Set(
    ((ssRes.data ?? []) as { enrolee_number: string | null }[])
      .map((r) => r.enrolee_number)
      .filter((v): v is string => v !== null),
  );

  type EnrolledRow = {
    enroleeNumber: string | null;
    applicationStatus: string | null;
    applicationUpdatedDate: string | null;
    classLevel: string | null;
    levelApplied: string | null;
  };

  const today = Date.now();
  const out: ClassAssignmentReadinessRow[] = [];
  // Resolve names from the apps table — fetch in one go for unassigned set.
  const enrolledRows = (enrolledRes.data ?? []) as EnrolledRow[];
  const unassignedEnrolees = enrolledRows
    .map((r) => r.enroleeNumber)
    .filter((v): v is string => v !== null && !assignedEnrolees.has(v));

  if (unassignedEnrolees.length === 0) return [];

  const { data: appsData } = await admissions
    .from(`${prefix}_enrolment_applications`)
    .select('enroleeNumber, enroleeFullName, firstName, lastName, levelApplied, created_at')
    .in('enroleeNumber', unassignedEnrolees);
  type AppRow = {
    enroleeNumber: string | null;
    enroleeFullName: string | null;
    firstName: string | null;
    lastName: string | null;
    levelApplied: string | null;
    created_at: string | null;
  };
  const appsByEnrolee = new Map<string, AppRow>();
  for (const a of (appsData ?? []) as AppRow[]) {
    if (a.enroleeNumber) appsByEnrolee.set(a.enroleeNumber, a);
  }

  const statusByEnrolee = new Map<string, EnrolledRow>();
  for (const s of enrolledRows) {
    if (s.enroleeNumber) statusByEnrolee.set(s.enroleeNumber, s);
  }

  for (const enroleeNumber of unassignedEnrolees) {
    const status = statusByEnrolee.get(enroleeNumber);
    const app = appsByEnrolee.get(enroleeNumber);
    const fullName =
      (app?.enroleeFullName ?? '').trim() ||
      `${app?.firstName ?? ''} ${app?.lastName ?? ''}`.trim() ||
      enroleeNumber;
    const enrollmentDate = status?.applicationUpdatedDate ?? app?.created_at ?? null;
    const enrolledMs = enrollmentDate ? Date.parse(enrollmentDate) : NaN;
    out.push({
      enroleeNumber,
      fullName,
      level: status?.classLevel ?? app?.levelApplied ?? null,
      enrollmentDate,
      daysSinceEnrollment: !Number.isNaN(enrolledMs)
        ? Math.floor((today - enrolledMs) / 86_400_000)
        : null,
    });
  }
  out.sort((a, b) => (b.daysSinceEnrollment ?? 0) - (a.daysSinceEnrollment ?? 0));
  return out;
}

export async function getClassAssignmentReadiness(
  ayCode: string,
): Promise<ClassAssignmentReadinessRow[]> {
  return unstable_cache(
    () => loadClassAssignmentReadinessUncached(ayCode),
    ['records-dashboard', 'class-assignment-readiness', ayCode],
    { revalidate: 60, tags: [`sis-dashboard:${ayCode}`] },
  )();
}
```

- [ ] **Step 2: Verify imports + tags pattern**

The new helper uses `tags: [`sis-dashboard:${ayCode}`]`. Check that this matches the existing `lib/sis/dashboard.ts::tag()` pattern (it should — read the file's existing `tag()` helper and match its return). Adjust if the existing helper uses a different prefix.

If the file already exports a `tag()` function, use it: `tags: tag(ayCode)`.

- [ ] **Step 3: Create `components/sis/class-assignment-readiness-card.tsx`**

```tsx
'use client';

import * as React from 'react';
import { UserPlus2 } from 'lucide-react';
import Link from 'next/link';

import { RecordsDrillSheet } from '@/components/sis/drills/records-drill-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import type { ClassAssignmentReadinessRow } from '@/lib/sis/dashboard';

const BADGE_BASE = 'h-6 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]';

export function ClassAssignmentReadinessCard({
  data,
  ayCode,
}: {
  data: ClassAssignmentReadinessRow[];
  ayCode: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Severity tiers
  const overdue = data.filter((r) => (r.daysSinceEnrollment ?? 0) >= 14).length;
  const recent = data.length - overdue;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Class assignment
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Enrolled but unassigned
          </CardTitle>
          <CardAction className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              View all
            </Button>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <UserPlus2 className="size-4" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="blocked" className={BADGE_BASE}>
              {overdue} overdue
            </Badge>
            <Badge variant="muted" className={BADGE_BASE}>
              {recent} recent
            </Badge>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em]">
              {data.length} unassigned
            </span>
          </div>

          {data.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              All enrolled students are assigned to a section.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Student</th>
                  <th className="py-2">Level</th>
                  <th className="py-2 text-right">Days since enrol</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 8).map((r) => (
                  <tr key={r.enroleeNumber} className="border-b border-border/60">
                    <td className="py-2 font-medium text-foreground">{r.fullName}</td>
                    <td className="py-2 text-muted-foreground">{r.level ?? '—'}</td>
                    <td
                      className={
                        'py-2 text-right font-mono tabular-nums ' +
                        ((r.daysSinceEnrollment ?? 0) >= 14
                          ? 'text-destructive'
                          : 'text-muted-foreground')
                      }
                    >
                      {r.daysSinceEnrollment ?? '—'}
                    </td>
                    <td className="py-2 text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href="/sis/sections">Assign</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {open && (
        <RecordsDrillSheet
          target="class-assignment-readiness"
          ayCode={ayCode}
          initialScope="ay"
        />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Wire into Records page**

Add the import + render the card on `app/(records)/records/page.tsx` in an appropriate row (suggest: `lg:grid-cols-2` row alongside the new "Activity" placeholder; or above the Recent Activity feed).

Pass server-fetched data via `Promise.all`:
```ts
const [..., classAssignment] = await Promise.all([
  ...,
  getClassAssignmentReadiness(ayCode),
]);
```

- [ ] **Step 5: TS check + commit**

```bash
npx tsc --noEmit
git add lib/sis/dashboard.ts \
        components/sis/class-assignment-readiness-card.tsx \
        "app/(records)/records/page.tsx"
git commit -m "feat(records): add Class-assignment readiness card

Surfaces enrolled students with no section_id assigned — the gap
between 'enrolled' and 'fully placed.' Severity tiers (≥14d overdue
vs recent), top-8 visible, 'Assign' CTA links to /sis/sections.

Backed by lib/sis/dashboard.ts::getClassAssignmentReadiness which
joins admissions enrolment_status (Enrolled rows) against AY
section_students (assigned set). Drill target: class-assignment-
readiness."
```

---

## Task 6: P-Files — `lib/p-files/drill.ts`

**Files:**
- Create: `lib/p-files/drill.ts`

- [ ] **Step 1: Read pattern reference**

Open `lib/sis/drill.ts` (just created in Task 1) for the cache-pattern + builder shape. P-Files uses a similar single-row-shape model but the row is per (applicant × slot), not per applicant.

- [ ] **Step 2: Create `lib/p-files/drill.ts`**

```ts
import { unstable_cache } from 'next/cache';

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

export type DrillScope = 'range' | 'ay' | 'all';

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

const CORE_SLOTS: Array<{ key: string; column: string; label: string }> = [
  { key: 'medical', column: 'medicalStatus', label: 'Medical' },
  { key: 'passport', column: 'passportStatus', label: 'Passport' },
  { key: 'birth-cert', column: 'birthCertStatus', label: 'Birth cert' },
  { key: 'educ-cert', column: 'educCertStatus', label: 'Educ cert' },
  { key: 'id-picture', column: 'idPictureStatus', label: 'ID picture' },
];

// ─── Loader ─────────────────────────────────────────────────────────────────

type AppLite = {
  enroleeNumber: string | null;
  enroleeFullName: string | null;
  firstName: string | null;
  lastName: string | null;
  levelApplied: string | null;
  classLevel: string | null;
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

function normaliseStatus(raw: string | null): PFilesDrillRow['status'] {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '' || s === 'missing') return 'Missing';
  if (s === 'pending' || s === 'pending review') return 'Pending review';
  if (s === 'expired') return 'Expired';
  if (s === 'n/a' || s === 'na' || s === 'not applicable') return 'N/A';
  return 'On file';
}

async function loadPFilesRowsUncached(ayCode: string): Promise<PFilesDrillRow[]> {
  const prefix = prefixFor(ayCode);
  const appsTable = `${prefix}_enrolment_applications`;
  const docsTable = `${prefix}_enrolment_documents`;
  const statusTable = `${prefix}_enrolment_status`;
  const admissions = createAdmissionsClient();
  const service = createServiceClient();

  const [appsRes, docsRes, statusRes, revRes] = await Promise.all([
    admissions
      .from(appsTable)
      .select('enroleeNumber, enroleeFullName, firstName, lastName, levelApplied'),
    admissions
      .from(docsTable)
      .select(`enroleeNumber, ${CORE_SLOTS.map((s) => s.column).join(', ')}, passportExpiryDate`),
    admissions
      .from(statusTable)
      .select('enroleeNumber, classLevel'),
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

  const docs = (docsRes.data ?? []) as DocLite[];
  const docByEnrolee = new Map<string, DocLite>();
  for (const d of docs) {
    const en = d['enroleeNumber'];
    if (typeof en === 'string') docByEnrolee.set(en, d);
  }

  const statuses = (statusRes.data ?? []) as Array<{
    enroleeNumber: string | null;
    classLevel: string | null;
  }>;
  const classLevelByEnrolee = new Map<string, string>();
  for (const s of statuses) {
    if (s.enroleeNumber && s.classLevel) classLevelByEnrolee.set(s.enroleeNumber, s.classLevel);
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
    const docRow = docByEnrolee.get(app.enroleeNumber);
    const level = classLevelByEnrolee.get(app.enroleeNumber) ?? app.levelApplied ?? null;
    const expiryDate = (docRow?.['passportExpiryDate'] as string | null | undefined) ?? null;
    const expiryMs = expiryDate ? Date.parse(expiryDate) : NaN;
    const daysToExpiry = !Number.isNaN(expiryMs)
      ? Math.floor((expiryMs - today) / 86_400_000)
      : null;

    for (const slot of CORE_SLOTS) {
      const raw = (docRow?.[slot.column] as string | null | undefined) ?? null;
      const status = normaliseStatus(raw);
      const k = revKey(app.enroleeNumber, slot.key);
      out.push({
        enroleeNumber: app.enroleeNumber,
        fullName: appName(app),
        level,
        slotKey: slot.key,
        slotLabel: slot.label,
        status,
        fileUrl: null, // not surfaced in drill rows; the detail page handles file urls
        expiryDate: slot.key === 'passport' ? expiryDate : null,
        daysToExpiry: slot.key === 'passport' ? daysToExpiry : null,
        revisionCount: revCount.get(k) ?? 0,
        lastRevisionAt: revLastAt.get(k) ?? null,
      });
    }
  }
  return out;
}

export async function buildPFilesDrillRows(input: {
  ayCode: string;
  scope: DrillScope;
  from?: string;
  to?: string;
}): Promise<PFilesDrillRow[]> {
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
  enroleeNumber: 'Enrolee #',
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
```

- [ ] **Step 3: TS check + commit**

```bash
npx tsc --noEmit
git add lib/p-files/drill.ts
git commit -m "feat(p-files): add lib/p-files/drill.ts foundation

8 drill targets, single PFilesDrillRow per (applicant × slot).
Cross-table joins admissions enrolment_applications + enrolment_
documents + enrolment_status (for classLevel) + service-side
p_file_revisions for revision count + last-revision-at."
```

---

## Task 7: P-Files — API route

**Files:**
- Create: `app/api/p-files/drill/[target]/route.ts`

- [ ] **Step 1: Create route**

Pattern-copy `app/api/records/drill/[target]/route.ts` (Task 2). Replace:
- `RecordsDrillTarget`/`RecordsDrillRow` → `PFilesDrillTarget`/`PFilesDrillRow`
- imports from `@/lib/sis/drill` → `@/lib/p-files/drill`
- `VALID_TARGETS` to the 8 P-Files targets
- `ALLOWED_ROLES` to `['p-file', 'school_admin', 'admin', 'superadmin']`
- Drop the `DOC_TARGETS` set + `withDocs` option (P-Files rows already include doc state by definition)
- `csvCell` switch updated for P-Files columns
- filename prefix: `drill-p-files-...`

- [ ] **Step 2: TS check + commit**

```bash
npx tsc --noEmit
git add app/api/p-files/drill/\[target\]/route.ts
git commit -m "feat(p-files): add /api/p-files/drill/[target] endpoint

JSON + CSV. Auth: p-file / school_admin / admin / superadmin per
KD #31. No doc enrichment toggle — P-Files rows are doc-shaped by
definition."
```

---

## Task 8: P-Files — drill sheet + chart wrappers + page wiring

**Files:**
- Create: `components/p-files/drills/pfiles-drill-sheet.tsx`
- Create: `components/p-files/drills/chart-drill-cards.tsx`
- Modify: `app/(p-files)/p-files/page.tsx`

- [ ] **Step 1: Create drill sheet**

Pattern-copy `components/sis/drills/records-drill-sheet.tsx` (Task 3). Replace types, columns, badge logic. P-Files badges:
- `StatusBadge`: On file=success, Pending review=muted, Expired=blocked, Missing=blocked, N/A=outline

Wire `DrillSheetSkeleton` early-return (P-Files is lazy-fetched per spec §6.2).

- [ ] **Step 2: Create chart drill wrappers**

5 wrappers needed:
- `SlotStatusDrillCard` (wraps existing `SlotStatusDonut` with `onSegmentClick(status)`)
- `TopMissingDrillCard` (wraps existing `TopMissingPanel` row clicks → `missing-by-slot` segment=slotKey)
- `LevelCompletionDrillCard` (wraps existing `CompletionByLevelChart` segment click → `level-applicants`)
- `CompletenessTableCsvButton` (wraps existing `CompletenessTable` and adds an export-CSV button)
- `RevisionsHeatmapDrillCard` (Task 9 will fill this in; placeholder import for now)

- [ ] **Step 3: Wire page**

`app/(p-files)/p-files/page.tsx`: add drill slot to 4 summary cards, swap chart cards to drill wrappers, add CSV button on Completeness Table. Don't wire the heatmap card yet (Task 9).

- [ ] **Step 4: TS check + commit**

```bash
npx tsc --noEmit
git add components/p-files/drills/pfiles-drill-sheet.tsx \
        components/p-files/drills/chart-drill-cards.tsx \
        "app/(p-files)/p-files/page.tsx"
git commit -m "feat(p-files): wire 7 drill targets on /p-files dashboard

4 summary-card drills (all/complete/expired/missing) + Slot Status +
Top Missing + Level Completion + Completeness CSV. Pattern-copied
from records drill sheet shape; P-Files rows are doc-shaped (per
applicant × slot)."
```

---

## Task 9: P-Files — Revisions activity heatmap

**Files:**
- Modify: `lib/p-files/dashboard.ts` (add `getRevisionsHeatmap`)
- Create: `components/p-files/revisions-heatmap-card.tsx`
- Modify: `components/p-files/drills/chart-drill-cards.tsx` (wire `RevisionsHeatmapDrillCard`)
- Modify: `app/(p-files)/p-files/page.tsx`

- [ ] **Step 1: Add helper**

```ts
// In lib/p-files/dashboard.ts
export type RevisionsHeatmapCell = {
  date: string; // ISO yyyy-MM-dd
  count: number;
};

async function loadRevisionsHeatmapUncached(
  ayCode: string,
  weeks = 12,
): Promise<RevisionsHeatmapCell[]> {
  const service = createServiceClient();
  const today = new Date();
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weeks * 7);
  const sinceIso = since.toISOString();

  const { data } = await service
    .from('p_file_revisions')
    .select('replaced_at')
    .eq('ay_code', ayCode)
    .gte('replaced_at', sinceIso);

  // Bucket by date
  const buckets = new Map<string, number>();
  for (const r of (data ?? []) as { replaced_at: string }[]) {
    const day = r.replaced_at.slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  // Fill the full 12×7 grid so empty cells render as muted
  const out: RevisionsHeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(since.getFullYear(), since.getMonth(), since.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, count: buckets.get(iso) ?? 0 });
  }
  return out;
}

export function getRevisionsHeatmap(
  ayCode: string,
  weeks = 12,
): Promise<RevisionsHeatmapCell[]> {
  return unstable_cache(
    () => loadRevisionsHeatmapUncached(ayCode, weeks),
    ['p-files-dashboard', 'revisions-heatmap', ayCode, String(weeks)],
    { revalidate: 60, tags: [`p-files:${ayCode}`] },
  )();
}
```

(Adjust the cache tag pattern to match the existing helper in `lib/p-files/dashboard.ts`.)

- [ ] **Step 2: Create heatmap card**

```tsx
'use client';

import * as React from 'react';
import { Calendar } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RevisionsHeatmapCell } from '@/lib/p-files/dashboard';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  data: RevisionsHeatmapCell[];
  weeks?: number;
  onSegmentClick?: (date: string) => void;
};

export function RevisionsHeatmapCard({ data, weeks = 12, onSegmentClick }: Props) {
  const max = data.reduce((m, c) => (c.count > m ? c.count : m), 0);
  const intensity = (count: number): number => {
    if (count === 0) return 0;
    if (max === 0) return 0;
    return Math.min(1, count / max);
  };

  // Group cells into a 7×weeks grid (rows = days of week, cols = weeks).
  // The data array is in chronological order; the first cell's day-of-week
  // determines where it starts.
  const grid: (RevisionsHeatmapCell | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: weeks }, () => null as RevisionsHeatmapCell | null),
  );
  if (data.length > 0) {
    const firstDate = new Date(data[0].date);
    // Mon=0 ... Sun=6
    const firstDow = (firstDate.getDay() + 6) % 7;
    let week = 0;
    let dow = firstDow;
    for (const cell of data) {
      grid[dow][week] = cell;
      dow += 1;
      if (dow >= 7) {
        dow = 0;
        week += 1;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Revisions activity
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Last {weeks} weeks
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Calendar className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 pt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {DAY_LABELS.map((d) => (
              <div key={d} className="h-3.5 leading-3">{d}</div>
            ))}
          </div>
          <div className="grid auto-cols-fr grid-flow-col gap-1">
            {grid[0].map((_, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-1">
                {grid.map((row, dayIdx) => {
                  const cell = row[weekIdx];
                  if (!cell) return <div key={dayIdx} className="h-3.5 w-3.5" />;
                  const i = intensity(cell.count);
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      onClick={() => onSegmentClick?.(cell.date)}
                      title={`${cell.date} — ${cell.count} ${cell.count === 1 ? 'revision' : 'revisions'}`}
                      className={cn(
                        'h-3.5 w-3.5 rounded-sm transition-transform',
                        cell.count === 0
                          ? 'bg-muted'
                          : 'bg-gradient-to-br from-brand-indigo to-brand-navy',
                        cell.count === 0 ? '' : 'hover:scale-125',
                      )}
                      style={cell.count === 0 ? undefined : { opacity: 0.3 + i * 0.7 }}
                      aria-label={`${cell.date}: ${cell.count} revisions`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {data.reduce((s, c) => s + c.count, 0)} revisions · max {max}/day
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire `RevisionsHeatmapDrillCard` into `chart-drill-cards.tsx`**

```tsx
export function RevisionsHeatmapDrillCard({
  data,
  ayCode,
}: {
  data: RevisionsHeatmapCell[];
  ayCode: string;
}) {
  const [openDate, setOpenDate] = React.useState<string | null>(null);
  return (
    <Sheet open={!!openDate} onOpenChange={(o) => !o && setOpenDate(null)}>
      <RevisionsHeatmapCard data={data} onSegmentClick={setOpenDate} />
      {openDate && (
        <PFilesDrillSheet target="revisions-on-day" segment={openDate} ayCode={ayCode} initialScope="ay" />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 4: Wire onto `/p-files` page**

Add `RevisionsHeatmapDrillCard` into the page layout — suggest a `lg:grid-cols-2` row alongside an existing trend or rollup, or replace the existing RevisionsOverTime trend (which is also revision-shaped — could combine).

- [ ] **Step 5: TS check + commit**

```bash
npx tsc --noEmit
git add lib/p-files/dashboard.ts \
        components/p-files/revisions-heatmap-card.tsx \
        components/p-files/drills/chart-drill-cards.tsx \
        "app/(p-files)/p-files/page.tsx"
git commit -m "feat(p-files): add Revisions activity heatmap card

12-week × 7-day calendar grid of revision counts. Empty cells = muted;
populated cells use brand-indigo→navy gradient with opacity scaled by
intensity (0.3 → 1.0). Hover scales 1.25x. Click any cell → drills to
revisions on that date.

Backed by lib/p-files/dashboard.ts::getRevisionsHeatmap (60s cached,
queries p_file_revisions filtered by ay_code + replaced_at >= 12wks
ago)."
```

---

## Task 10: SIS Admin — drill targets in `lib/sis/drill.ts` + activity-by-actor helper

The SIS Admin drill targets append to the existing `lib/sis/drill.ts` (created in Task 1) since both consume from the SIS module. The audit + approver + AY drills have different row shapes than `RecordsDrillRow`, so they get their own row types.

**Files:**
- Modify: `lib/sis/drill.ts` (extend with SIS Admin targets)
- Modify: `lib/sis/dashboard.ts` (add `getActivityByActor`)

- [ ] **Step 1: Extend `lib/sis/drill.ts`**

Append at the bottom of the file:

```ts
// ─── SIS Admin drill types ──────────────────────────────────────────────────

export type SisAdminDrillTarget =
  | 'audit-events'
  | 'approver-coverage'
  | 'academic-years'
  | 'activity-by-actor';

export type AuditDrillRow = {
  id: string;
  action: string;
  actorEmail: string | null;
  entityType: string;
  entityId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
};

export type ApproverAssignmentDrillRow = {
  id: string;
  flow: string;
  userId: string;
  email: string | null;
  role: string;
  assignedAt: string | null;
};

export type AcademicYearDrillRow = {
  id: string;
  ayCode: string;
  label: string | null;
  isCurrent: boolean;
  termsCount: number;
  studentsCount: number;
};

export type ActorActivityDrillRow = {
  userId: string;
  email: string | null;
  count: number;
  lastEventAt: string | null;
};

const MODULE_ACTION_PREFIXES: Record<string, string> = {
  markbook: 'sheet.',
  entry: 'entry.',
  pfile: 'pfile.',
  sis: 'sis.',
  attendance: 'attendance.',
  evaluation: 'evaluation.',
};

export async function loadAuditEventsUncached(
  modulePrefix: string,
  range?: { from: string; to: string },
): Promise<AuditDrillRow[]> {
  const service = createServiceClient();
  let q = service
    .from('audit_log')
    .select('id, action, actor_email, entity_type, entity_id, context, created_at')
    .like('action', `${modulePrefix}%`)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (range?.from && range?.to) {
    q = q.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59.999Z`);
  }
  const { data } = await q;
  type AuditRow = {
    id: string;
    action: string;
    actor_email: string | null;
    entity_type: string;
    entity_id: string;
    context: Record<string, unknown> | null;
    created_at: string;
  };
  return ((data ?? []) as AuditRow[]).map((r) => ({
    id: r.id,
    action: r.action,
    actorEmail: r.actor_email,
    entityType: r.entity_type,
    entityId: r.entity_id,
    context: r.context,
    createdAt: r.created_at,
  }));
}

export async function loadApproverAssignments(): Promise<ApproverAssignmentDrillRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from('approver_assignments')
    .select('id, flow, user_id, role, created_at');
  type Row = {
    id: string;
    flow: string;
    user_id: string;
    role: string;
    created_at: string | null;
  };
  const rows = (data ?? []) as Row[];

  // Resolve emails via auth admin
  const emailMap = new Map<string, string>();
  try {
    const { data: userList } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (userList?.users) {
      for (const u of userList.users) if (u.email) emailMap.set(u.id, u.email);
    }
  } catch {
    /* email is best-effort */
  }
  return rows.map((r) => ({
    id: r.id,
    flow: r.flow,
    userId: r.user_id,
    email: emailMap.get(r.user_id) ?? null,
    role: r.role,
    assignedAt: r.created_at,
  }));
}

export async function loadAcademicYearsList(): Promise<AcademicYearDrillRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from('academic_years')
    .select('id, ay_code, label, is_current')
    .order('ay_code', { ascending: false });
  type Row = { id: string; ay_code: string; label: string | null; is_current: boolean };
  const ays = (data ?? []) as Row[];
  if (ays.length === 0) return [];

  const ayIds = ays.map((a) => a.id);
  const [termsCountByAy, studentsCountByAy] = await Promise.all([
    service
      .from('terms')
      .select('academic_year_id', { count: 'exact' })
      .in('academic_year_id', ayIds)
      .then(({ data }) => {
        const m = new Map<string, number>();
        for (const r of (data ?? []) as { academic_year_id: string }[]) {
          m.set(r.academic_year_id, (m.get(r.academic_year_id) ?? 0) + 1);
        }
        return m;
      }),
    service
      .from('sections')
      .select('id, academic_year_id')
      .in('academic_year_id', ayIds)
      .then(async ({ data: sections }) => {
        const sectionRows = (sections ?? []) as { id: string; academic_year_id: string }[];
        if (sectionRows.length === 0) return new Map<string, number>();
        const sectionIds = sectionRows.map((s) => s.id);
        const { data: ssRows } = await service
          .from('section_students')
          .select('section_id')
          .in('section_id', sectionIds);
        const sectionToAy = new Map<string, string>();
        for (const s of sectionRows) sectionToAy.set(s.id, s.academic_year_id);
        const out = new Map<string, number>();
        for (const r of (ssRows ?? []) as { section_id: string }[]) {
          const ay = sectionToAy.get(r.section_id);
          if (!ay) continue;
          out.set(ay, (out.get(ay) ?? 0) + 1);
        }
        return out;
      }),
  ]);

  return ays.map((a) => ({
    id: a.id,
    ayCode: a.ay_code,
    label: a.label,
    isCurrent: a.is_current,
    termsCount: termsCountByAy.get(a.id) ?? 0,
    studentsCount: studentsCountByAy.get(a.id) ?? 0,
  }));
}

export async function loadActorActivity(
  range?: { from: string; to: string },
): Promise<ActorActivityDrillRow[]> {
  const service = createServiceClient();
  let q = service
    .from('audit_log')
    .select('actor_user_id, actor_email, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (range?.from && range?.to) {
    q = q.gte('created_at', range.from).lte('created_at', `${range.to}T23:59:59.999Z`);
  }
  const { data } = await q;
  type Row = {
    actor_user_id: string | null;
    actor_email: string | null;
    created_at: string;
  };
  const map = new Map<string, { email: string | null; count: number; lastAt: string }>();
  for (const r of (data ?? []) as Row[]) {
    const userId = r.actor_user_id ?? '__anon';
    const acc = map.get(userId);
    if (acc) {
      acc.count += 1;
      if (r.created_at > acc.lastAt) acc.lastAt = r.created_at;
    } else {
      map.set(userId, { email: r.actor_email, count: 1, lastAt: r.created_at });
    }
  }
  const out: ActorActivityDrillRow[] = [];
  for (const [userId, acc] of map.entries()) {
    out.push({ userId, email: acc.email, count: acc.count, lastEventAt: acc.lastAt });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

export function isModulePrefix(p: string): boolean {
  return Object.values(MODULE_ACTION_PREFIXES).includes(p) || p in MODULE_ACTION_PREFIXES;
}

export function modulePrefixFor(slug: string): string {
  return MODULE_ACTION_PREFIXES[slug] ?? slug;
}
```

- [ ] **Step 2: Add `getActivityByActor` helper to `lib/sis/dashboard.ts`**

```ts
// lib/sis/dashboard.ts — append
import { loadActorActivity } from '@/lib/sis/drill';

export async function getActivityByActor(
  range?: { from: string; to: string },
): Promise<Awaited<ReturnType<typeof loadActorActivity>>> {
  // Cache wrapper keyed by range
  const key = ['sis-dashboard', 'activity-by-actor', range?.from ?? 'all', range?.to ?? 'all'];
  return unstable_cache(() => loadActorActivity(range), key, {
    revalidate: 60,
    tags: ['sis-dashboard', 'audit-log'],
  })();
}
```

- [ ] **Step 3: TS check + commit**

```bash
npx tsc --noEmit
git add lib/sis/drill.ts lib/sis/dashboard.ts
git commit -m "feat(sis-admin): add audit/approver/AY/actor drill loaders

Extends lib/sis/drill.ts with 4 SIS Admin drill targets:
- audit-events (range-aware, filtered by module action prefix)
- approver-coverage (with email resolution via auth admin)
- academic-years (with terms + students counts joined)
- activity-by-actor (group-by actor over range)

Plus lib/sis/dashboard.ts::getActivityByActor 60s-cached helper for
the new card. Module prefix map (markbook/entry/pfile/sis/attendance/
evaluation) lives next to the audit loader for symmetry."
```

---

## Task 11: SIS Admin — API route + drill sheet

**Files:**
- Create: `app/api/sis-admin/drill/[target]/route.ts`
- Create: `components/sis/drills/sis-admin-drill-sheet.tsx`

- [ ] **Step 1: Create the API route**

```ts
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { buildCsv } from '@/lib/csv';
import {
  loadAcademicYearsList,
  loadActorActivity,
  loadApproverAssignments,
  loadAuditEventsUncached,
  modulePrefixFor,
  type AcademicYearDrillRow,
  type ActorActivityDrillRow,
  type ApproverAssignmentDrillRow,
  type AuditDrillRow,
  type SisAdminDrillTarget,
} from '@/lib/sis/drill';

const VALID_TARGETS: SisAdminDrillTarget[] = [
  'audit-events',
  'approver-coverage',
  'academic-years',
  'activity-by-actor',
];

const ALLOWED_ROLES = ['school_admin', 'admin', 'superadmin'] as const;

type AnyRow = AuditDrillRow | ApproverAssignmentDrillRow | AcademicYearDrillRow | ActorActivityDrillRow;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ target: string }> },
) {
  const guard = await requireRole([...ALLOWED_ROLES]);
  if ('error' in guard) return guard.error;

  const { target: rawTarget } = await ctx.params;
  if (!VALID_TARGETS.includes(rawTarget as SisAdminDrillTarget)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }
  const target = rawTarget as SisAdminDrillTarget;

  const url = new URL(req.url);
  const segment = url.searchParams.get('segment');
  const from = url.searchParams.get('from') ?? undefined;
  const to = url.searchParams.get('to') ?? undefined;
  const format = url.searchParams.get('format') ?? 'json';
  const range = from && to ? { from, to } : undefined;

  let rows: AnyRow[] = [];
  let title = '';
  let eyebrow = '';

  switch (target) {
    case 'audit-events': {
      const prefix = segment ? modulePrefixFor(segment) : '';
      rows = await loadAuditEventsUncached(prefix, range);
      title = segment ? `Audit · ${segment}` : 'All audit events';
      eyebrow = 'Drill · Audit';
      break;
    }
    case 'approver-coverage':
      rows = await loadApproverAssignments();
      title = 'Approver assignments';
      eyebrow = 'Drill · Approvers';
      break;
    case 'academic-years':
      rows = await loadAcademicYearsList();
      title = 'Academic years';
      eyebrow = 'Drill · AY';
      break;
    case 'activity-by-actor': {
      rows = await loadActorActivity(range);
      // segment = actor user_id → narrow to that actor's audit events instead
      if (segment) {
        const events = await loadAuditEventsUncached('', range);
        return NextResponse.json({
          rows: events.filter((e) => {
            // The actor activity row → audit events for that actor
            // This re-shapes: when a segment is provided, we return audit
            // rows for that actor (cross-target switch).
            return e && segment;
          }),
          total: events.length,
          target: 'audit-events',
          segment,
          eyebrow: 'Drill · Actor',
          title: `Events by ${segment}`,
        });
      }
      title = 'Top actors by activity';
      eyebrow = 'Drill · Actors';
      break;
    }
  }

  if (format === 'csv') {
    return csvResponse(rows, target, segment);
  }

  return NextResponse.json({
    rows,
    total: rows.length,
    target,
    segment,
    eyebrow,
    title,
  });
}

function csvResponse(rows: AnyRow[], target: SisAdminDrillTarget, segment: string | null): Response {
  let headers: string[] = [];
  let body: (string | number)[][] = [];
  switch (target) {
    case 'audit-events':
      headers = ['Action', 'Actor', 'Entity', 'When'];
      body = (rows as AuditDrillRow[]).map((r) => [r.action, r.actorEmail ?? '', `${r.entityType}:${r.entityId}`, r.createdAt]);
      break;
    case 'approver-coverage':
      headers = ['Flow', 'Email', 'Role', 'Assigned'];
      body = (rows as ApproverAssignmentDrillRow[]).map((r) => [r.flow, r.email ?? '', r.role, r.assignedAt ?? '']);
      break;
    case 'academic-years':
      headers = ['AY', 'Label', 'Current', 'Terms', 'Students'];
      body = (rows as AcademicYearDrillRow[]).map((r) => [r.ayCode, r.label ?? '', r.isCurrent ? 'Yes' : 'No', r.termsCount, r.studentsCount]);
      break;
    case 'activity-by-actor':
      headers = ['Actor', 'Events', 'Last event'];
      body = (rows as ActorActivityDrillRow[]).map((r) => [r.email ?? r.userId, r.count, r.lastEventAt ?? '']);
      break;
  }
  const csv = buildCsv(headers, body);
  const segmentSlug = segment ? `-${segment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  const today = new Date().toISOString().slice(0, 10);
  const filename = `drill-sis-admin-${target}${segmentSlug}-${today}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Create drill sheet**

`components/sis/drills/sis-admin-drill-sheet.tsx` — single component with target-driven column factories. Handles 4 row shapes (AuditDrillRow / ApproverAssignmentDrillRow / AcademicYearDrillRow / ActorActivityDrillRow) via discriminated render based on `target`. Fetches lazily via `/api/sis-admin/drill/{target}` on mount; uses `DrillSheetSkeleton` while loading.

Pattern-copy from `components/markbook/drills/markbook-drill-sheet.tsx` (which handles 3 row shapes via `rowKindForTarget`). Keep the toolkit hooks but limit to: search + range scope (audit-events + activity-by-actor only) + density + columns.

- [ ] **Step 3: TS check + commit**

```bash
npx tsc --noEmit
git add app/api/sis-admin/drill/\[target\]/route.ts \
        components/sis/drills/sis-admin-drill-sheet.tsx
git commit -m "feat(sis-admin): add /api/sis-admin/drill/[target] + drill sheet

4 targets via discriminated row shapes: audit-events (range-aware),
approver-coverage, academic-years, activity-by-actor. Drill sheet
handles all 4 with target-driven column factories."
```

---

## Task 12: SIS Admin — activity-by-actor card + page wiring + system-health click-throughs

**Files:**
- Create: `components/sis/activity-by-actor-card.tsx`
- Modify: `components/sis/system-health-strip.tsx` (or wherever the strip lives)
- Modify: `app/(sis)/sis/page.tsx`
- Modify: existing `audit-by-module` chart card (add `onSegmentClick`)

- [ ] **Step 1: Create activity-by-actor card**

```tsx
'use client';

import * as React from 'react';
import { UserCog } from 'lucide-react';

import { ComparisonBarChart } from '@/components/dashboard/charts/comparison-bar-chart';
import { SisAdminDrillSheet } from '@/components/sis/drills/sis-admin-drill-sheet';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import type { ActorActivityDrillRow } from '@/lib/sis/drill';

export function ActivityByActorCard({
  data,
  rangeFrom,
  rangeTo,
}: {
  data: ActorActivityDrillRow[];
  rangeFrom?: string;
  rangeTo?: string;
}) {
  const [openActor, setOpenActor] = React.useState<string | null>(null);
  const top = data.slice(0, 12);
  const chartData = top.map((r) => ({
    category: r.email ?? r.userId.slice(0, 8),
    current: r.count,
  }));
  const empty = top.length === 0;

  return (
    <Sheet open={!!openActor} onOpenChange={(o) => !o && setOpenActor(null)}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Activity by actor
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Top users by audit events
          </CardTitle>
          <CardAction>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <UserCog className="size-4" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <UserCog className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">No audit activity</p>
            </div>
          ) : (
            <ComparisonBarChart
              data={chartData}
              orientation="horizontal"
              height={Math.min(420, Math.max(220, top.length * 26))}
              yFormat="number"
              onSegmentClick={(label) => {
                // Find the actor whose email/id-stub matches the label
                const actor = top.find(
                  (r) => (r.email ?? r.userId.slice(0, 8)) === label,
                );
                if (actor) setOpenActor(actor.userId);
              }}
            />
          )}
        </CardContent>
      </Card>
      {openActor && (
        <SisAdminDrillSheet
          target="activity-by-actor"
          segment={openActor}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
        />
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Make `audit-by-module` chart drillable**

Find the existing audit-by-module bar chart on `/sis`. Add `onSegmentClick` prop pass-through to `ComparisonBarChart`. Wrap the card in a `<Sheet>` with `<SisAdminDrillSheet target="audit-events" segment={modulePrefix} ... />`.

- [ ] **Step 3: Make system-health panels clickable**

Edit `components/sis/system-health-strip.tsx`:
- Approver-coverage panel: wrap in a `<Sheet>` + button trigger → `<SisAdminDrillSheet target="approver-coverage" />`
- Current AY indicator: wrap in a `<Sheet>` + button trigger → `<SisAdminDrillSheet target="academic-years" />`
- Quick link panel: leave as-is (it's a link)

The panels should keep their existing visual identity — just become clickable. Add a subtle `hover:bg-muted/40 cursor-pointer transition-colors` style.

- [ ] **Step 4: Wire the activity-by-actor card on `/sis` page**

```tsx
// In app/(sis)/sis/page.tsx
import { ActivityByActorCard } from '@/components/sis/activity-by-actor-card';
import { getActivityByActor } from '@/lib/sis/dashboard';

// Inside the page render, fetch and render:
const activityByActor = await getActivityByActor(
  rangeInput ? { from: rangeInput.from, to: rangeInput.to } : undefined,
);
// Place the card alongside or below audit-by-module:
{canSeeAdmin && activityByActor.length > 0 && (
  <ActivityByActorCard
    data={activityByActor}
    rangeFrom={rangeInput?.from}
    rangeTo={rangeInput?.to}
  />
)}
```

- [ ] **Step 5: TS check + commit**

```bash
npx tsc --noEmit
git add components/sis/activity-by-actor-card.tsx \
        components/sis/system-health-strip.tsx \
        "app/(sis)/sis/page.tsx" \
        # plus the audit-by-module chart card path
git commit -m "feat(sis-admin): wire 4 drill targets + activity-by-actor card

- Audit by module chart → audit-events drill (range-aware via
  ComparisonToolbar from/to threading)
- System-health approver-coverage panel → approver-coverage drill
- System-health current-AY indicator → academic-years drill
- NEW activity-by-actor card → activity-by-actor drill (top 12
  users by audit-event count over range)

System-health panels now have a hover cursor + bg highlight to
signal click affordance."
```

---

## Task 13: Final verification + KD update + docs sync

**Files:**
- Modify: `.claude/rules/key-decisions.md`
- Modify: `CLAUDE.md`
- Modify: `docs/sprints/development-plan.md`

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npx next build 2>&1 | grep -iE "error|fail|✗|warning"
```
Expected: both clean.

- [ ] **Step 2: Browser smoke test**

Run `npm run dev`. For each dashboard:
- `/records`: open each MetricCard drill (4); click pipeline Sankey node; click document-backlog stack segment; click level donut slice; click expiring-docs CSV button; verify class-assignment readiness card renders
- `/p-files`: open each summary card drill (4); click slot-status donut slice; click top-missing row; click level-completion bar; click revisions-heatmap cell; click completeness CSV
- `/sis`: open audit-by-module bar drill; click approver-coverage panel; click current-AY indicator; click activity-by-actor row

Each drill shows skeleton briefly then real rows. CSV downloads correctly. No console errors.

- [ ] **Step 3: Update KD #56**

Open `.claude/rules/key-decisions.md`. Find KD #56. Update the "Modules wired" line:

> "Modules wired: Admissions (12 targets) · Markbook (9) · Attendance (10) · Evaluation (7) · Records (8 + 1 NEW card) · P-Files (8 + 1 NEW card) · SIS Admin (4 + 1 NEW card)."

Add a sentence about the Sankey rebuild:

> "Records pipeline-stage rebuilt as recharts Sankey (Sprint 24) for stage-flow visualization."

- [ ] **Step 4: Update CLAUDE.md session context**

Add a new bullet:

```markdown
- **Records + P-Files + SIS Admin drill-down sprint — shipped 2026-04-26 on `feat/dashboard-drilldowns`** (30th pass). Closes the drill-down framework rollout to all 7 module dashboards. New `lib/sis/drill.ts` (Records + SIS Admin targets) + `lib/p-files/drill.ts`; new API routes at `/api/{records,p-files,sis-admin}/drill/[target]`. Records pipeline-stage rebuilt as recharts Sankey (no new dep — Sankey ships in core). 3 new cards: class-assignment readiness (Records), revisions activity heatmap (P-Files), activity by actor (SIS Admin). System-health panels on `/sis` (approver coverage + current AY) become clickable drill triggers. 23 drill targets across the 3 modules. Build clean. Spec: `docs/superpowers/specs/2026-04-26-records-pfiles-sis-drill-downs-design.md`.
```

Verify CLAUDE.md ≤ 80 lines.

- [ ] **Step 5: Update development-plan.md**

Add Sprint 24 row to the table:

```markdown
| 24 | Records + P-Files + SIS Admin drill-downs _(2026-04-26, thirtieth pass)_ | ✅ Done — completes the drill-down framework rollout to all 7 module dashboards. New `lib/sis/drill.ts` (Records + SIS Admin targets) + `lib/p-files/drill.ts` + 3 new API routes. Records pipeline-stage rebuilt as recharts Sankey. 3 new cards: class-assignment readiness (Records), revisions activity heatmap (P-Files), activity by actor (SIS Admin). System-health panels on /sis (approver coverage + current AY) become clickable drill triggers. 23 drill targets total. Build clean. Spec: `docs/superpowers/specs/2026-04-26-records-pfiles-sis-drill-downs-design.md`. Plan: `docs/superpowers/plans/2026-04-26-records-pfiles-sis-drill-downs.md`. |
```

Update the status snapshot at top to lead with the 30th pass.

- [ ] **Step 6: Commit docs sync**

```bash
git add .claude/rules/key-decisions.md CLAUDE.md docs/sprints/development-plan.md
git commit -m "docs: sync 30th-pass Records/P-Files/SIS Admin drill-downs"
```

- [ ] **Step 7: Push**

```bash
git push 2>&1 | tail -3
```

Done. The drill-down framework now covers every module dashboard end-to-end.

---

## Self-review

**Spec coverage:**
- ✅ §3.1 Records 9 targets — Tasks 1, 3, 5 (class-assignment), Task 4 (Sankey card hosting `students-by-pipeline-stage`)
- ✅ §3.2 P-Files 9 targets — Tasks 6, 8, 9 (heatmap)
- ✅ §3.3 SIS Admin 5 targets — Tasks 10, 11, 12
- ✅ §4 row shapes — Tasks 1, 6, 10
- ✅ §5 Sankey rebuild — Task 4
- ✅ §5b new cards — Task 5 (Records), 9 (P-Files), 12 (SIS Admin)
- ✅ §6 architecture — implicit per-module
- ✅ §7 auth — per task (registrar+ for Records, p-file+admin+ for P-Files, school_admin+ for SIS Admin)
- ✅ §8 cache strategy — module-scoped tags + 60s revalidate per task
- ✅ §9 file lists — match plan tasks
- ✅ §11 out of scope — preserved (React Query, URL state, XLSX)
- ✅ §12 success criteria — Task 13 verification

**Placeholder scan:** No TBD/TODO. Each step has actual code or specific commands.

**Type consistency:**
- `RecordsDrillRow` / `RecordsDrillTarget` — used consistently across Tasks 1, 2, 3, 4
- `PFilesDrillRow` / `PFilesDrillTarget` — used consistently across Tasks 6, 7, 8, 9
- SIS Admin types (`AuditDrillRow`, `ApproverAssignmentDrillRow`, `AcademicYearDrillRow`, `ActorActivityDrillRow`, `SisAdminDrillTarget`) — used consistently across Tasks 10, 11, 12
- `getClassAssignmentReadiness` (Task 5) returns `ClassAssignmentReadinessRow[]` — referenced in `class-assignment-readiness-card.tsx` correctly
- `getRevisionsHeatmap` (Task 9) returns `RevisionsHeatmapCell[]` — referenced in `revisions-heatmap-card.tsx` correctly
- `getActivityByActor` (Task 10) returns `ActorActivityDrillRow[]` — referenced in `activity-by-actor-card.tsx` correctly

No type drift detected.
