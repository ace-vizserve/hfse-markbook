import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ManualAddStudent } from './manual-add';
import { TeacherAssignmentsPanel } from '@/components/admin/teacher-assignments-panel';

type LevelLite = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };

type EnrolmentRow = {
  id: string;
  index_number: number;
  enrollment_status: 'active' | 'late_enrollee' | 'withdrawn';
  enrollment_date: string | null;
  withdrawal_date: string | null;
  student: {
    id: string;
    student_number: string;
    last_name: string;
    first_name: string;
    middle_name: string | null;
  } | null;
};

export default async function SectionRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: section } = await supabase
    .from('sections')
    .select('id, name, academic_year_id, level:levels(id, code, label, level_type)')
    .eq('id', id)
    .single();
  if (!section) notFound();

  const { data: rows } = await supabase
    .from('section_students')
    .select(
      'id, index_number, enrollment_status, enrollment_date, withdrawal_date, student:students(id, student_number, last_name, first_name, middle_name)',
    )
    .eq('section_id', id)
    .order('index_number');

  const levelFromSection = (Array.isArray(section.level) ? section.level[0] : section.level) as LevelLite | null;
  const { data: configs } = levelFromSection
    ? await supabase
        .from('subject_configs')
        .select('subject:subjects(id, code, name)')
        .eq('academic_year_id', section.academic_year_id)
        .eq('level_id', levelFromSection.id)
    : { data: [] };
  type CfgRow = {
    subject: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  };
  const levelSubjects = ((configs ?? []) as CfgRow[])
    .map((c) => (Array.isArray(c.subject) ? c.subject[0] : c.subject))
    .filter((s): s is { id: string; code: string; name: string } => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));

  const enrolments = (rows ?? []) as unknown as EnrolmentRow[];
  const level = levelFromSection;
  const activeCount = enrolments.filter((e) => e.enrollment_status !== 'withdrawn').length;
  const withdrawnCount = enrolments.filter((e) => e.enrollment_status === 'withdrawn').length;

  return (
    <PageShell>
      <Link
        href="/admin/sections"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All sections
      </Link>

      <PageHeader
        eyebrow={level?.label ?? 'Section'}
        title={`${level?.label ?? ''} · ${section.name}`}
        description={
          <>
            {activeCount} active
            {withdrawnCount > 0 && (
              <span className="ml-1.5">· {withdrawnCount} withdrawn</span>
            )}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/sections/${section.id}/comments`}>
                <MessageSquare className="h-4 w-4" />
                Comments
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/sections/${section.id}/attendance`}>
                <Calendar className="h-4 w-4" />
                Attendance
              </Link>
            </Button>
          </>
        }
      />

      <Surface padded={false} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead>Student #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrolments.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  No students enrolled yet. Sync from admissions or add manually.
                </TableCell>
              </TableRow>
            )}
            {enrolments.map((e) => {
              const withdrawn = e.enrollment_status === 'withdrawn';
              const s = e.student;
              const name = s
                ? [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(', ')
                : '(missing student)';
              return (
                <TableRow key={e.id} className={withdrawn ? 'text-muted-foreground' : ''}>
                  <TableCell className="text-right tabular-nums">{e.index_number}</TableCell>
                  <TableCell className="tabular-nums">{s?.student_number ?? '—'}</TableCell>
                  <TableCell className={withdrawn ? 'line-through' : ''}>{name}</TableCell>
                  <TableCell>
                    {withdrawn ? (
                      <Badge variant="secondary">withdrawn</Badge>
                    ) : e.enrollment_status === 'late_enrollee' ? (
                      <Badge variant="outline">late enrollee</Badge>
                    ) : (
                      <Badge variant="default">active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Surface>

      <ManualAddStudent
        sectionId={section.id}
        nextIndex={Math.max(0, ...enrolments.map((e) => e.index_number)) + 1}
      />

      <TeacherAssignmentsPanel sectionId={section.id} levelSubjects={levelSubjects} />
    </PageShell>
  );
}
