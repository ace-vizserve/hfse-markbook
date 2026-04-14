import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import { CommentsGrid } from '@/app/(dashboard)/admin/sections/[id]/comments/comments-grid';
import { cn } from '@/lib/utils';

type LevelLite = { code: string; label: string };
type TermLite = { id: string; label: string; term_number: number; is_current: boolean };

export default async function AdvisoryCommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term_id?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) redirect('/login');
  const role = getUserRole(user);
  const isManager = role === 'registrar' || role === 'admin' || role === 'superadmin';

  if (!isManager) {
    const { data: assignment } = await supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_user_id', user.id)
      .eq('section_id', id)
      .eq('role', 'form_adviser')
      .maybeSingle();
    if (!assignment) {
      return (
        <PageShell className="max-w-lg">
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Not the form adviser for this section</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                You can only write comments for sections where you are assigned as the Form
                Class Adviser. Ask the registrar to update your assignments if you think this
                is wrong.
              </p>
              <Link
                href="/grading"
                className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to grading
              </Link>
            </AlertDescription>
          </Alert>
        </PageShell>
      );
    }
  }

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
  const termList = (terms ?? []) as TermLite[];
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
        href="/grading"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to grading
      </Link>

      <PageHeader
        eyebrow="Advisory"
        title={`${level?.label ?? ''} ${section.name} · Adviser Comments`}
        description="One free-text comment per student per term. These appear on the report card."
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
              href={`/grading/advisory/${id}/comments?term_id=${t.id}`}
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
