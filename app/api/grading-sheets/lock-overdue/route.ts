import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAction } from '@/lib/audit/log-action';
import { invalidateDrillTags } from '@/lib/cache/invalidate-drill-tags';

// POST /api/grading-sheets/lock-overdue — Vercel Cron only.
//
// Runs daily at 06:00 SGT (22:00 UTC). Locks every unlocked grading sheet
// whose term's grading_lock_date < today (Singapore local date). Sheets are
// therefore locked the morning AFTER the deadline day, giving teachers the
// full deadline day to submit.
//
// Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` automatically.
// The CRON_SECRET env var must be configured in the Vercel project settings.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const todaySgt = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Singapore',
  });

  // Terms whose deadline has already passed as of today SGT.
  const { data: terms, error: termsErr } = await service
    .from('terms')
    .select('id, label, academic_year_id, grading_lock_date')
    .lt('grading_lock_date', todaySgt);
  if (termsErr) {
    console.error('[lock-overdue] terms fetch failed:', termsErr.message);
    return NextResponse.json({ error: termsErr.message }, { status: 500 });
  }
  if (!terms || terms.length === 0) {
    return NextResponse.json({ locked_count: 0, run_date: todaySgt });
  }

  const termIds = terms.map((t) => t.id);

  // Unlocked sheets in those terms.
  const { data: sheets, error: sheetsErr } = await service
    .from('grading_sheets')
    .select('id, term_id')
    .in('term_id', termIds)
    .eq('is_locked', false);
  if (sheetsErr) {
    console.error('[lock-overdue] sheets fetch failed:', sheetsErr.message);
    return NextResponse.json({ error: sheetsErr.message }, { status: 500 });
  }
  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ locked_count: 0, run_date: todaySgt });
  }

  const sheetIds = sheets.map((s) => s.id);
  const now = new Date().toISOString();

  const { error: lockErr } = await service
    .from('grading_sheets')
    .update({
      is_locked: true,
      locked_at: now,
      locked_by: 'system:grading-deadline',
      updated_at: now,
    })
    .in('id', sheetIds);
  if (lockErr) {
    console.error('[lock-overdue] bulk lock failed:', lockErr.message);
    return NextResponse.json({ error: lockErr.message }, { status: 500 });
  }

  await logAction({
    service,
    actor: { id: null, email: 'system:grading-deadline' },
    action: 'sheet.lock_overdue_batch',
    entityType: 'grading_sheet',
    entityId: null,
    context: {
      locked_count: sheetIds.length,
      run_date: todaySgt,
      sheet_ids: sheetIds,
    },
  });

  // Invalidate markbook caches for every AY that had sheets locked.
  const termAyMap = new Map(terms.map((t) => [t.id, t.academic_year_id]));
  const affectedAyIds = new Set(
    sheets.map((s) => termAyMap.get(s.term_id)).filter(Boolean) as string[]
  );

  if (affectedAyIds.size > 0) {
    const { data: ayRows } = await service
      .from('academic_years')
      .select('id, ay_code')
      .in('id', Array.from(affectedAyIds));
    for (const ay of ayRows ?? []) {
      invalidateDrillTags('markbook', ay.ay_code);
    }
  }

  console.info(
    `[lock-overdue] locked ${sheetIds.length} sheet(s) on ${todaySgt}`
  );
  return NextResponse.json({
    locked_count: sheetIds.length,
    run_date: todaySgt,
  });
}
