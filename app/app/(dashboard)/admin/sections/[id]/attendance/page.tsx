import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { AttendanceGrid } from './attendance-grid';
import { cn } from '@/lib/utils';

type LevelLite = { code: string; label: string };
type TermLite = { id: string; label: string; term_number: number; is_current: boolean };

export default async function SectionAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term_id?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const supabase = await createClient();

  const { data: section } = await supabase
    .from('sections')
    .select('id, name, academic_year_id, level:levels(code, label)')
    .eq('id', id)
    .single();
  if (!section) notFound();
  const level = (Array.isArray(section.level) ? section.level[0] : section.level) as LevelLite | null;

  const { data: terms } = await supabase
    .from('terms')
    .select('id, label, term_number, is_current')
    .eq('academic_year_id', section.academic_year_id)
    .order('term_number');
  const termList = (terms ?? []) as TermLite[];
  const currentTerm = termList.find((t) => t.is_current) ?? termList[0];
  const selectedTermId = q.term_id ?? currentTerm?.id ?? '';

  const { data: enrolments } = await supabase
    .from('section_students')
    .select(
      'id, index_number, enrollment_status, student:students(student_number, last_name, first_name, middle_name)',
    )
    .eq('section_id', id)
    .order('index_number');

  const enrolmentIds = (enrolments ?? []).map((e) => e.id);
  const { data: records } = selectedTermId && enrolmentIds.length > 0
    ? await supabase
        .from('attendance_records')
        .select('section_student_id, school_days, days_present, days_late')
        .eq('term_id', selectedTermId)
        .in('section_student_id', enrolmentIds)
    : { data: [] };
  const byEnrolment = new Map((records ?? []).map((r) => [r.section_student_id, r]));

  const gridRows = (enrolments ?? []).map((e) => {
    const s = Array.isArray(e.student) ? e.student[0] : e.student;
    const rec = byEnrolment.get(e.id);
    return {
      enrolment_id: e.id,
      index_number: e.index_number,
      withdrawn: e.enrollment_status === 'withdrawn',
      student_number: s?.student_number ?? '',
      student_name: s
        ? [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(', ')
        : '(missing)',
      school_days: rec?.school_days ?? null,
      days_present: rec?.days_present ?? null,
      days_late: rec?.days_late ?? null,
    };
  });

  return (
    <PageShell>
      <Link
        href={`/admin/sections/${id}`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {level?.label} {section.name}
      </Link>

      <PageHeader
        eyebrow={`${level?.label ?? ''} ${section.name}`}
        title="Attendance"
        description="School days / days present / days late per student per term."
      />

      <Surface className="flex flex-wrap items-center gap-2 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Term
        </span>
        {termList.map((t) => {
          const active = t.id === selectedTermId;
          return (
            <Link
              key={t.id}
              href={`/admin/sections/${id}/attendance?term_id=${t.id}`}
              className={cn(
                'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </Surface>

      <AttendanceGrid sectionId={id} termId={selectedTermId} rows={gridRows} />
    </PageShell>
  );
}
