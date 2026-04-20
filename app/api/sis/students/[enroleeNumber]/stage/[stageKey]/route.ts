import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import {
  STAGE_COLUMN_MAP,
  STAGE_KEYS,
  STAGE_LABELS,
  StageUpdateSchema,
  type StageKey,
} from '@/lib/schemas/sis';
import { createServiceClient } from '@/lib/supabase/service';

// PATCH /api/sis/students/[enroleeNumber]/stage/[stageKey]?ay=AY2026
//
// Updates one pipeline stage on the ay{YY}_enrolment_status row. Writes:
//   - <stage>Status, <stage>Remarks, plus any stage-specific extras
//   - <stage>UpdatedDate (now), <stage>UpdatedBy (actor email)
// Returns 400 on validation failure, 404 if no status row exists for the
// enrolee, 500 on DB error. Audit log entry written on success.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ enroleeNumber: string; stageKey: string }> },
) {
  const auth = await requireRole(['registrar', 'school_admin', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { enroleeNumber, stageKey: rawStage } = await params;
  if (!enroleeNumber.trim()) {
    return NextResponse.json({ error: 'Missing enroleeNumber' }, { status: 400 });
  }
  if (!(STAGE_KEYS as readonly string[]).includes(rawStage)) {
    return NextResponse.json({ error: `Unknown stage: ${rawStage}` }, { status: 400 });
  }
  const stageKey = rawStage as StageKey;

  const url = new URL(request.url);
  const ayCode = (url.searchParams.get('ay') ?? '').trim();
  if (!/^AY\d{4}$/i.test(ayCode)) {
    return NextResponse.json({ error: 'Invalid or missing ay query param' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = StageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { status, remarks, extras } = parsed.data;

  // Validate extras keys match what this stage allows.
  const cols = STAGE_COLUMN_MAP[stageKey];
  const allowedExtras = new Set(cols.extras.map((e) => e.fieldKey));
  if (extras) {
    for (const key of Object.keys(extras)) {
      if (!allowedExtras.has(key)) {
        return NextResponse.json(
          { error: `Stage "${stageKey}" does not accept extra field "${key}"` },
          { status: 400 },
        );
      }
    }
    // Validate date extras are yyyy-MM-dd or null.
    for (const e of cols.extras) {
      if (e.kind !== 'date') continue;
      const v = extras[e.fieldKey];
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return NextResponse.json({ error: `${e.label} must be YYYY-MM-DD` }, { status: 400 });
      }
    }
  }

  const prefix = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
  const statusTable = `${prefix}_enrolment_status`;
  const supabase = createServiceClient();

  // 1) Confirm the row exists + capture pre-image for the audit diff.
  const beforeSelect = [
    cols.statusCol,
    cols.remarksCol,
    ...cols.extras.map((e) => e.columnName),
  ].join(', ');
  const { data: before, error: beforeErr } = await supabase
    .from(statusTable)
    .select(beforeSelect)
    .eq('enroleeNumber', enroleeNumber)
    .maybeSingle();
  if (beforeErr) {
    console.error('[sis stage PATCH] pre-fetch failed:', beforeErr.message);
    return NextResponse.json({ error: 'Status lookup failed' }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'No status row for this enrolee in this AY' }, { status: 404 });
  }

  // 2) Build update payload.
  const update: Record<string, unknown> = {
    [cols.statusCol]: status,
    [cols.remarksCol]: remarks,
    [cols.updatedDateCol]: new Date().toISOString(),
    [cols.updatedByCol]: auth.user.email ?? '(unknown)',
  };
  if (extras) {
    for (const e of cols.extras) {
      const v = extras[e.fieldKey];
      if (v !== undefined) update[e.columnName] = v === '' ? null : v;
    }
  }

  const { error: upErr } = await supabase
    .from(statusTable)
    .update(update)
    .eq('enroleeNumber', enroleeNumber);
  if (upErr) {
    console.error('[sis stage PATCH] update failed:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 3) Audit log diff — only fields that actually changed.
  const beforeRow = before as unknown as Record<string, unknown>;
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
  for (const [col, next] of Object.entries(update)) {
    if (col === cols.updatedDateCol || col === cols.updatedByCol) continue;
    const prev = beforeRow[col] ?? null;
    if ((prev ?? null) !== (next ?? null)) {
      changes.push({ field: col, from: prev, to: next });
    }
  }

  await logAction({
    service: supabase,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: 'sis.stage.update',
    entityType: 'enrolment_status',
    entityId: enroleeNumber,
    context: {
      ay_code: ayCode,
      stage: stageKey,
      stage_label: STAGE_LABELS[stageKey],
      changes,
    },
  });

  // 4) Invalidate the per-AY cache so detail + list re-render with new data.
  revalidateTag(`sis:${ayCode}`, 'max');

  return NextResponse.json({ ok: true, changed: changes.length });
}
