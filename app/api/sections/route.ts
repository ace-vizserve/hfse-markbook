import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';

// List sections for the current academic year, annotated with enrolment counts.
export async function GET() {
  const auth = await requireRole(['teacher', 'registrar', 'school_admin', 'admin', 'superadmin']);
  if ('error' in auth) return auth.error;

  const supabase = await createClient();

  const { data: ay, error: ayErr } = await supabase
    .from('academic_years')
    .select('id, ay_code')
    .eq('is_current', true)
    .single();
  if (ayErr || !ay) {
    return NextResponse.json({ error: 'no current academic year' }, { status: 500 });
  }

  const { data: sections, error: secErr } = await supabase
    .from('sections')
    .select('id, name, level:levels(id, code, label, level_type)')
    .eq('academic_year_id', ay.id)
    .order('name');
  if (secErr) return NextResponse.json({ error: secErr.message }, { status: 500 });

  const ids = (sections ?? []).map(s => s.id);
  const counts: Record<string, { active: number; withdrawn: number }> = {};
  if (ids.length > 0) {
    const { data: enrolments, error } = await supabase
      .from('section_students')
      .select('section_id, enrollment_status')
      .in('section_id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of enrolments ?? []) {
      const bucket = (counts[row.section_id] ??= { active: 0, withdrawn: 0 });
      if (row.enrollment_status === 'withdrawn') bucket.withdrawn++;
      else bucket.active++;
    }
  }

  return NextResponse.json({
    ay_code: ay.ay_code,
    sections: (sections ?? []).map(s => ({
      id: s.id,
      name: s.name,
      level: s.level,
      active_count: counts[s.id]?.active ?? 0,
      withdrawn_count: counts[s.id]?.withdrawn ?? 0,
    })),
  });
}
