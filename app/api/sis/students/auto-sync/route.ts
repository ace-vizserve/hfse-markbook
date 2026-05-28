import { NextResponse, type NextRequest } from 'next/server';

import { requireCurrentAyCode } from '@/lib/academic-year';
import { logAction } from '@/lib/audit/log-action';
import { invalidateAllOperationalDrills } from '@/lib/cache/invalidate-drill-tags';
import { createAdmissionsClient } from '@/lib/supabase/admissions';
import { createServiceClient } from '@/lib/supabase/service';
import { loadUnsyncedEnrolledStudents } from '@/lib/sis/unsynced-students';
import { syncOneStudent } from '@/lib/sync/students';

// POST /api/sis/students/auto-sync — Vercel Cron only.
//
// Runs daily at 15:00 UTC (23:00 SGT). Walks the unsynced enrolled-students
// queue and runs syncOneStudent for every row where gapReason='not_synced'
// (both studentNumber and classSection are already set on the admissions side
// — only the public.students mirror is stale or missing). Rows with
// gapReason='no_class_section' or 'no_student_number' are intentionally
// skipped because a human decision is required to unblock them.
//
// Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` automatically.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const admissions = createAdmissionsClient();

  let ayCode: string;
  try {
    ayCode = await requireCurrentAyCode();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[auto-sync] requireCurrentAyCode failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const allRows = await loadUnsyncedEnrolledStudents(ayCode);
  const candidates = allRows.filter((r) => r.gapReason === 'not_synced');

  const byCounts: Record<string, number> = {};
  const errors: string[] = [];

  for (const row of candidates) {
    const result = await syncOneStudent(
      service,
      admissions,
      row.enroleeNumber,
      ayCode
    );
    if (result.ok) {
      byCounts[result.change] = (byCounts[result.change] ?? 0) + 1;
    } else {
      const errMsg = `${row.enroleeNumber}: ${result.error ?? result.reason ?? 'unknown'}`;
      errors.push(errMsg);
      console.warn('[auto-sync] syncOneStudent failed:', errMsg);
      byCounts['skipped'] = (byCounts['skipped'] ?? 0) + 1;
    }
  }

  const runDate = new Date().toISOString();

  await logAction({
    service,
    actor: { id: null, email: 'system:auto-sync' },
    action: 'sis.student.auto_sync_batch',
    entityType: 'academic_year',
    entityId: ayCode,
    context: {
      run_date: runDate,
      total_candidates: candidates.length,
      by_outcome: byCounts,
      errors,
    },
  });

  invalidateAllOperationalDrills(ayCode);

  console.info(
    `[auto-sync] processed ${candidates.length} candidate(s) for ${ayCode} on ${runDate}`
  );

  return NextResponse.json({
    run_date: runDate,
    total_candidates: candidates.length,
    by_outcome: byCounts,
    errors,
  });
}
