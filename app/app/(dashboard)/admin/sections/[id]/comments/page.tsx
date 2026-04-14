import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { CommentsGrid } from './comments-grid';
import { cn } from '@/lib/utils';

type LevelLite = { code: string; label: string };
type TermLite = { id: string; label: string; term_number: number };

export default async function SectionCommentsPage({
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
    .select('id, name, form_class_adviser, academic_year_id, level:levels(code, label)')
    .eq('id', id)
    .single();
  if (!section) notFound();
  const level = (Array.isArray(section.level) ? section.level[0] : section.level) as LevelLite | null;

  const { data: terms } = await supabase
    .from('terms')
    .select('id, label, term_number, is_current')
    .eq('academic_year_id', section.academic_year_id)
    .order('term_number');
  const termList = (terms ?? []) as (TermLite & { is_current: boolean })[];
  const currentTerm = termList.find((t) => t.is_current) ?? termList[0];
  const selectedTermId = q.term_id ?? currentTerm?.id ?? '';

  const { data: rows } = selectedTermId
    ? await supabase
        .from('section_students')
        .select(
          'id, index_number, enrollment_status, student:students(id, student_number, last_name, first_name, middle_name)',
        )
        .eq('section_id', id)
        .order('index_number')
    : { data: [] };

  const studentIds = (rows ?? [])
    .map((r) => (Array.isArray(r.student) ? r.student[0] : r.student)?.id)
    .filter((x): x is string => !!x);

  const { data: comments } = selectedTermId && studentIds.length > 0
    ? await supabase
        .from('report_card_comments')
        .select('student_id, comment')
        .eq('term_id', selectedTermId)
        .eq('section_id', id)
        .in('student_id', studentIds)
    : { data: [] };
  const byStudent = new Map((comments ?? []).map((c) => [c.student_id, c.comment]));

  const gridRows = (rows ?? []).map((r) => {
    const s = Array.isArray(r.student) ? r.student[0] : r.student;
    return {
      enrolment_id: r.id,
      index_number: r.index_number,
      withdrawn: r.enrollment_status === 'withdrawn',
      student_id: s?.id ?? '',
      student_number: s?.student_number ?? '',
      student_name: s
        ? [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(', ')
        : '(missing)',
      comment: (s && byStudent.get(s.id)) ?? null,
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
        title="Adviser Comments"
        description={
          <>
            Form Class Adviser:{' '}
            <span className="font-medium text-foreground">
              {section.form_class_adviser ?? '—'}
            </span>{' '}
            · One free-text comment per student per term.
          </>
        }
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
              href={`/admin/sections/${id}/comments?term_id=${t.id}`}
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

      <CommentsGrid sectionId={id} termId={selectedTermId} rows={gridRows} />
    </PageShell>
  );
}
