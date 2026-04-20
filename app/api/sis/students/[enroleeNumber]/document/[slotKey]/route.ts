import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { requireRole } from '@/lib/auth/require-role';
import { logAction } from '@/lib/audit/log-action';
import { DocumentValidationSchema } from '@/lib/schemas/sis';
import { DOCUMENT_SLOTS } from '@/lib/sis/queries';
import { createServiceClient } from '@/lib/supabase/service';

// Allowlist of valid slot keys — guards against writing arbitrary
// `${anythingStatus}` columns via the URL segment.
const SLOT_KEYS = new Set(DOCUMENT_SLOTS.map((s) => s.key));
const SLOT_META = new Map(DOCUMENT_SLOTS.map((s) => [s.key, s]));

// PATCH /api/sis/students/[enroleeNumber]/document/[slotKey]?ay=AY2026
//
// Writes {slotKey}Status on ay{YY}_enrolment_documents to 'Valid' or
// 'Rejected'. SIS is the sole writer of 'Rejected' per the cross-module
// contract — P-Files stays a repository.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ enroleeNumber: string; slotKey: string }> },
) {
  const auth = await requireRole(['registrar', 'school_admin', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const { enroleeNumber, slotKey } = await params;
  if (!enroleeNumber.trim()) {
    return NextResponse.json({ error: 'Missing enroleeNumber' }, { status: 400 });
  }
  if (!SLOT_KEYS.has(slotKey)) {
    return NextResponse.json({ error: 'Unknown slotKey' }, { status: 400 });
  }

  const url = new URL(request.url);
  const ayCode = (url.searchParams.get('ay') ?? '').trim();
  if (!/^AY\d{4}$/i.test(ayCode)) {
    return NextResponse.json({ error: 'Invalid or missing ay query param' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = DocumentValidationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const slot = SLOT_META.get(slotKey)!;
  const statusCol = slot.statusCol;
  const urlCol = slot.urlCol;

  const prefix = `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
  const table = `${prefix}_enrolment_documents`;
  const supabase = createServiceClient();

  // Pre-fetch prior status + url for audit context.
  const { data: before, error: beforeErr } = await supabase
    .from(table)
    .select(`${statusCol}, ${urlCol}`)
    .eq('enroleeNumber', enroleeNumber)
    .maybeSingle();
  if (beforeErr) {
    console.error('[sis document PATCH] pre-fetch failed:', beforeErr.message);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'No document row for this enrolee in this AY' }, { status: 404 });
  }
  const beforeRow = before as unknown as Record<string, unknown>;
  const priorStatus = (beforeRow[statusCol] as string | null) ?? null;
  const fileUrl = (beforeRow[urlCol] as string | null) ?? null;

  if (!fileUrl) {
    return NextResponse.json(
      { error: 'Cannot validate a slot with no uploaded file' },
      { status: 400 },
    );
  }

  const { error: upErr } = await supabase
    .from(table)
    .update({ [statusCol]: parsed.data.status })
    .eq('enroleeNumber', enroleeNumber);
  if (upErr) {
    console.error('[sis document PATCH] update failed:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const rejectionReason =
    parsed.data.status === 'Rejected' ? parsed.data.rejectionReason : null;

  await logAction({
    service: supabase,
    actor: { id: auth.user.id, email: auth.user.email ?? null },
    action: parsed.data.status === 'Valid' ? 'sis.document.approve' : 'sis.document.reject',
    entityType: 'enrolment_document',
    entityId: `${enroleeNumber}:${slotKey}`,
    context: {
      ay_code: ayCode,
      slot_key: slotKey,
      prior_status: priorStatus,
      new_status: parsed.data.status,
      ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    },
  });

  revalidateTag(`sis:${ayCode}`, 'max');
  return NextResponse.json({ ok: true });
}
