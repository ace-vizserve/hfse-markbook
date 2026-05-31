import { NextRequest, NextResponse } from 'next/server';
import { createClient, getSessionUser } from '@/lib/supabase/server';

export type TermStat = {
  termId: string;
  termNumber: number;
  label: string;
  isCurrent: boolean;
  P: number;
  L: number;
  A: number;
  EX: number;
  rate: number | null;
};

export type StudentSummaryResponse = {
  termStats: TermStat[];
  recentAbsences: string[]; // ISO date strings (YYYY-MM-DD)
};

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sectionStudentId = searchParams.get('sectionStudentId');
  if (!sectionStudentId) {
    return NextResponse.json(
      { error: 'sectionStudentId is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Resolve section → AY
  const { data: ss } = await supabase
    .from('section_students')
    .select('section_id')
    .eq('id', sectionStudentId)
    .maybeSingle();
  if (!ss) {
    return NextResponse.json(
      { error: 'Section student not found' },
      { status: 404 }
    );
  }

  const { data: sectionRow } = await supabase
    .from('sections')
    .select('academic_year_id')
    .eq('id', (ss as { section_id: string }).section_id)
    .maybeSingle();
  const ayId = (sectionRow as { academic_year_id: string } | null)
    ?.academic_year_id;
  if (!ayId) {
    return NextResponse.json({
      termStats: [],
      recentAbsences: [],
    } satisfies StudentSummaryResponse);
  }

  // Fetch terms + all daily records in parallel
  const [termsResult, dailyResult] = await Promise.all([
    supabase
      .from('terms')
      .select('id, term_number, label, is_current')
      .eq('academic_year_id', ayId)
      .order('term_number'),
    supabase
      .from('attendance_daily')
      .select('term_id, date, status, ex_reason, period_id, recorded_at')
      .eq('section_student_id', sectionStudentId)
      .order('recorded_at', { ascending: false }),
  ]);

  type RawRow = {
    term_id: string;
    date: string;
    status: string;
    ex_reason: string | null;
    period_id: string | null;
    recorded_at: string;
  };

  // Deduplicate to the latest entry per (date, period_id) — same logic as
  // getDailyForSection in lib/attendance/queries.ts (append-only corrections).
  const seen = new Set<string>();
  const deduped = ((dailyResult.data ?? []) as RawRow[]).filter((row) => {
    const key = `${row.date}|${row.period_id ?? 'null'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  type TermRow = {
    id: string;
    term_number: number;
    label: string;
    is_current: boolean;
  };

  // Aggregate per term
  const termStats: TermStat[] = ((termsResult.data ?? []) as TermRow[]).map(
    (term) => {
      const rows = deduped.filter((r) => r.term_id === term.id);
      const P = rows.filter((r) => r.status === 'P').length;
      const L = rows.filter((r) => r.status === 'L').length;
      const A = rows.filter((r) => r.status === 'A').length;
      const EX = rows.filter((r) => r.status === 'EX').length;
      // Rate = (P + L) / (P + L + A) × 100 — late counts as attended;
      // EX excluded from denominator (excused ≠ penalised absence).
      const denominator = P + L + A;
      const rate =
        denominator > 0
          ? Math.round(((P + L) / denominator) * 100 * 10) / 10
          : null;
      return {
        termId: term.id,
        termNumber: term.term_number,
        label: term.label,
        isCurrent: term.is_current,
        P,
        L,
        A,
        EX,
        rate,
      };
    }
  );

  // 5 most recent absences across all terms
  const recentAbsences = deduped
    .filter((r) => r.status === 'A')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((r) => r.date);

  return NextResponse.json({
    termStats,
    recentAbsences,
  } satisfies StudentSummaryResponse);
}
