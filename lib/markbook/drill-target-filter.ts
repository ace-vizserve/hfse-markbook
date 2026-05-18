import type {
  ChangeRequestRow,
  GradeEntryRow,
  MarkbookDrillRow,
  MarkbookDrillTarget,
  SheetRow,
} from '@/lib/markbook/drill';

// Client-safe mirror of the server-side `applyTargetFilter` in
// `lib/markbook/drill.ts`. The server file imports service-role helpers, so
// the client drill sheet can't pull it in directly. This module re-implements
// just the filter logic needed to narrow pre-fetched seed rows to the
// target/segment the drill actually represents — without it, the drill shows
// the scope-filtered universe instead of the headline-narrowed slice, and the
// row count diverges from the KPI on the metric card.

const GRADE_BUCKET_LABEL: Record<string, string> = {
  dnm: 'Below Minimum (< 75)',
  fs: 'Fairly Satisfactory (75–79)',
  s: 'Satisfactory (80–84)',
  vs: 'Very Satisfactory (85–89)',
  o: 'Outstanding (90–100)',
};

function findBucketByLabel(label: string): string | null {
  for (const k of Object.keys(GRADE_BUCKET_LABEL)) {
    if (GRADE_BUCKET_LABEL[k] === label) return k;
  }
  return null;
}

export function applyTargetFilterClient(
  rows: MarkbookDrillRow[],
  target: MarkbookDrillTarget,
  segment: string | null | undefined,
  range: { from?: string; to?: string },
): MarkbookDrillRow[] {
  switch (target) {
    case 'grade-entries':
      return rows;
    case 'sheets-locked': {
      const { from, to } = range;
      if (from && to) {
        return (rows as SheetRow[]).filter((r) => {
          if (!r.isLocked || !r.lockedAt) return false;
          const day = r.lockedAt.slice(0, 10);
          return day >= from && day <= to;
        }) as MarkbookDrillRow[];
      }
      return (rows as SheetRow[]).filter((r) => r.isLocked) as MarkbookDrillRow[];
    }
    case 'change-requests': {
      if (!segment) return rows;
      if (segment === 'decided') {
        return (rows as ChangeRequestRow[]).filter(
          (r) =>
            r.resolvedAt != null &&
            (r.status === 'approved' || r.status === 'rejected' || r.status === 'applied'),
        ) as MarkbookDrillRow[];
      }
      return (rows as ChangeRequestRow[]).filter((r) => r.status === segment) as MarkbookDrillRow[];
    }
    case 'publication-coverage':
      if (!segment) return rows;
      if (segment === 'published') {
        return (rows as SheetRow[]).filter((r) => r.isPublished) as MarkbookDrillRow[];
      }
      if (segment === 'not-published') {
        return (rows as SheetRow[]).filter((r) => !r.isPublished) as MarkbookDrillRow[];
      }
      return rows;
    case 'grade-bucket-entries': {
      if (!segment) return rows;
      const key =
        segment in GRADE_BUCKET_LABEL ? segment : findBucketByLabel(segment);
      if (!key) return rows;
      return (rows as GradeEntryRow[]).filter((r) => r.gradeBucket === key) as MarkbookDrillRow[];
    }
    case 'term-sheet-status': {
      if (!segment) return rows;
      const compact = /^T(\d+)(?::(locked|open))?$/i.exec(segment);
      const labelled = /^Term\s+(\d+)\s*[·.\-]\s*(Locked|Open)$/i.exec(segment);
      const m = compact ?? labelled;
      if (!m) return rows;
      const termNumber = Number(m[1]);
      const status = (m[2] ?? '').toLowerCase() as 'locked' | 'open' | '';
      return (rows as SheetRow[]).filter((r) => {
        if (r.termNumber !== termNumber) return false;
        if (status === 'locked') return r.isLocked;
        if (status === 'open') return !r.isLocked;
        return true;
      }) as MarkbookDrillRow[];
    }
    case 'term-publication-status': {
      if (!segment) return rows;
      const compact = /^T(\d+)(?::(published|not-published))?$/i.exec(segment);
      const labelled = /^Term\s+(\d+)\s*[·.\-]\s*(Published|Unpublished)$/i.exec(segment);
      const m = compact ?? labelled;
      if (!m) return rows;
      const termNumber = Number(m[1]);
      const raw = (m[2] ?? '').toLowerCase();
      const status: 'published' | 'not-published' | '' =
        raw === 'published'
          ? 'published'
          : raw === 'unpublished' || raw === 'not-published'
            ? 'not-published'
            : '';
      const filtered = (rows as SheetRow[]).filter((r) => {
        if (r.termNumber !== termNumber) return false;
        if (status === 'published') return r.isPublished;
        if (status === 'not-published') return !r.isPublished;
        return true;
      });
      const seenSection = new Set<string>();
      const out: SheetRow[] = [];
      for (const r of filtered) {
        if (seenSection.has(r.sectionId)) continue;
        seenSection.add(r.sectionId);
        out.push(r);
      }
      return out as MarkbookDrillRow[];
    }
    case 'sheet-readiness-section': {
      if (!segment) {
        return (rows as SheetRow[]).filter((r) => !r.isLocked) as MarkbookDrillRow[];
      }
      return (rows as SheetRow[]).filter(
        (r) => r.sectionName === segment && !r.isLocked,
      ) as MarkbookDrillRow[];
    }
    case 'teacher-entry-velocity': {
      if (!segment) return rows;
      return (rows as GradeEntryRow[]).filter((r) => r.enteredBy === segment) as MarkbookDrillRow[];
    }
    default:
      return rows;
  }
}
