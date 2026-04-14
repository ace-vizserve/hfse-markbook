import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { computeAnnualGrade, gradeDescriptor } from '@/lib/compute/annual';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { PrintButton } from './print-button';

type Cell = { quarterly: number | null; letter: string | null; is_na: boolean };
type SubjectRow = {
  subject: { id: string; code: string; name: string; is_examinable: boolean };
  t1: Cell;
  t2: Cell;
  t3: Cell;
  t4: Cell;
  annual: number | null;
};

const first = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

function cellText(cell: Cell, examinable: boolean): string {
  if (cell.is_na) return 'N/A';
  if (!examinable) return cell.letter ?? '—';
  return cell.quarterly != null ? String(cell.quarterly) : '—';
}

export default async function ReportCardPreview({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  // Loaded inline (rather than via the API) because this is a server component
  // with cookie auth — reusing the logic keeps one query roundtrip vs. two.

  const { data: student } = await supabase
    .from('students')
    .select('id, student_number, last_name, first_name, middle_name')
    .eq('id', studentId)
    .single();
  if (!student) notFound();

  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, label')
    .eq('is_current', true)
    .single();
  if (!ay) return <div className="text-destructive">No current academic year.</div>;

  const { data: terms } = await supabase
    .from('terms')
    .select('id, term_number, label')
    .eq('academic_year_id', ay.id)
    .order('term_number');
  const termList = terms ?? [];

  const { data: enrolments } = await supabase
    .from('section_students')
    .select(
      `id, enrollment_status,
       section:sections!inner(id, name, form_class_adviser, academic_year_id,
         level:levels(id, code, label, level_type))`,
    )
    .eq('student_id', studentId);
  type Enrolment = {
    id: string;
    enrollment_status: string;
    section:
      | {
          id: string;
          name: string;
          form_class_adviser: string | null;
          academic_year_id: string;
          level: { id: string; code: string; label: string; level_type: string }
            | { id: string; code: string; label: string; level_type: string }[]
            | null;
        }
      | {
          id: string;
          name: string;
          form_class_adviser: string | null;
          academic_year_id: string;
          level: { id: string; code: string; label: string; level_type: string }
            | { id: string; code: string; label: string; level_type: string }[]
            | null;
        }[]
      | null;
  };
  const enrolment = ((enrolments ?? []) as Enrolment[])
    .map(e => ({ ...e, section: first(e.section) }))
    .find(e => e.section?.academic_year_id === ay.id);
  if (!enrolment || !enrolment.section) {
    return (
      <div className="text-sm text-muted-foreground">
        Student is not enrolled in the current academic year ({ay.label}).
      </div>
    );
  }
  const section = enrolment.section;
  const level = first(section.level);
  if (!level) notFound();

  const { data: configs } = await supabase
    .from('subject_configs')
    .select('subject:subjects(id, code, name, is_examinable)')
    .eq('academic_year_id', ay.id)
    .eq('level_id', level.id);
  type CfgRow = {
    subject:
      | { id: string; code: string; name: string; is_examinable: boolean }
      | { id: string; code: string; name: string; is_examinable: boolean }[]
      | null;
  };
  const subjects = ((configs ?? []) as CfgRow[])
    .map(c => first(c.subject))
    .filter((s): s is { id: string; code: string; name: string; is_examinable: boolean } => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: sheets } = await supabase
    .from('grading_sheets')
    .select('id, term_id, subject_id')
    .eq('section_id', section.id)
    .in('term_id', termList.map(t => t.id));
  const { data: entries } = (sheets ?? []).length > 0
    ? await supabase
        .from('grade_entries')
        .select('grading_sheet_id, quarterly_grade, letter_grade, is_na')
        .in('grading_sheet_id', (sheets ?? []).map(s => s.id))
        .eq('section_student_id', enrolment.id)
    : { data: [] };
  const entriesBySheet = new Map((entries ?? []).map(e => [e.grading_sheet_id, e]));

  const empty: Cell = { quarterly: null, letter: null, is_na: false };
  const subjectRows: SubjectRow[] = subjects.map(sub => {
    const byTerm: Record<number, Cell> = {};
    for (const t of termList) {
      const sheet = (sheets ?? []).find(s => s.term_id === t.id && s.subject_id === sub.id);
      const entry = sheet ? entriesBySheet.get(sheet.id) : null;
      byTerm[t.term_number] = entry
        ? {
            quarterly: (entry.quarterly_grade as number | null) ?? null,
            letter: (entry.letter_grade as string | null) ?? null,
            is_na: Boolean(entry.is_na),
          }
        : empty;
    }
    const annual = sub.is_examinable
      ? computeAnnualGrade(
          byTerm[1]?.quarterly ?? null,
          byTerm[2]?.quarterly ?? null,
          byTerm[3]?.quarterly ?? null,
          byTerm[4]?.quarterly ?? null,
        )
      : null;
    return {
      subject: sub,
      t1: byTerm[1] ?? empty,
      t2: byTerm[2] ?? empty,
      t3: byTerm[3] ?? empty,
      t4: byTerm[4] ?? empty,
      annual,
    };
  });

  const { data: attendance } = await supabase
    .from('attendance_records')
    .select('term_id, school_days, days_present, days_late')
    .eq('section_student_id', enrolment.id)
    .in('term_id', termList.map(t => t.id));

  const { data: comments } = await supabase
    .from('report_card_comments')
    .select('term_id, comment')
    .eq('section_id', section.id)
    .eq('student_id', student.id)
    .in('term_id', termList.map(t => t.id));

  const studentName = [student.last_name, student.first_name, student.middle_name]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      {/* Registrar controls — hidden from the "paper" preview below. */}
      <div className="mx-auto w-full max-w-[8.5in] print:hidden">
        <Link
          href="/report-cards"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All report cards
        </Link>
        <div className="mt-4">
          <PageHeader
            eyebrow="Report Card"
            title={studentName}
            description={`${level.label} · ${section.name} · ${ay.label}`}
            actions={<PrintButton />}
          />
        </div>
      </div>

      {/* --- Report card "paper" --- */}
      <Card className="mx-auto max-w-[8.5in] space-y-6 p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="border-b pb-4 text-center">
          <h1 className="text-lg font-bold tracking-wide">HFSE INTERNATIONAL SCHOOL</h1>
          <div className="text-xs text-muted-foreground">Singapore</div>
          <h2 className="mt-2 text-base font-semibold uppercase">Student Progress Report</h2>
          <div className="text-xs text-muted-foreground">{ay.label}</div>
        </header>

        {/* Student info */}
        <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <InfoRow label="Name" value={studentName} />
          <InfoRow label="Student No." value={student.student_number} />
          <InfoRow label="Course" value={level.label} />
          <InfoRow label="Class" value={section.name} />
          <InfoRow label="Form Class Adviser" value={section.form_class_adviser ?? '—'} />
          <InfoRow label="Status" value={enrolment.enrollment_status} />
        </section>

        {/* Academic grades */}
        <section>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Academic Grades
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-1 pr-2">Subject</th>
                {termList.map((t) => (
                  <th key={t.id} className="w-14 py-1 text-center">
                    T{t.term_number}
                  </th>
                ))}
                <th className="w-16 py-1 text-center">Final</th>
                <th className="py-1 pl-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {subjectRows.map((row) => (
                <tr key={row.subject.id} className="border-b last:border-b-0">
                  <td className="py-1 pr-2">{row.subject.name}</td>
                  <td className="py-1 text-center tabular-nums">
                    {cellText(row.t1, row.subject.is_examinable)}
                  </td>
                  <td className="py-1 text-center tabular-nums">
                    {cellText(row.t2, row.subject.is_examinable)}
                  </td>
                  <td className="py-1 text-center tabular-nums">
                    {cellText(row.t3, row.subject.is_examinable)}
                  </td>
                  <td className="py-1 text-center tabular-nums">
                    {cellText(row.t4, row.subject.is_examinable)}
                  </td>
                  <td className="py-1 text-center font-semibold tabular-nums">
                    {row.subject.is_examinable ? (row.annual ?? '—') : '—'}
                  </td>
                  <td className="py-1 pl-2 text-xs text-muted-foreground">
                    {row.subject.is_examinable ? gradeDescriptor(row.annual) : 'Letter'}
                  </td>
                </tr>
              ))}
              {subjectRows.length === 0 && (
                <tr>
                  <td
                    colSpan={termList.length + 3}
                    className="py-3 text-center text-muted-foreground"
                  >
                    No subjects configured for {level.label}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Grading legend */}
        <section className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <div className="font-semibold uppercase">Grading Legend</div>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
            <div>90–100 · Outstanding</div>
            <div>A — Outstanding (90–100)</div>
            <div>85–89 · Very Satisfactory</div>
            <div>B — Very Satisfactory (85–89)</div>
            <div>80–84 · Satisfactory</div>
            <div>C — Satisfactory (80–84)</div>
            <div>75–79 · Fairly Satisfactory</div>
            <div>IP — In Progress (&lt; 80)</div>
            <div>&lt; 75 · Below Minimum</div>
            <div>NA / UG / INC / CO / E — special codes</div>
          </div>
        </section>

        {/* Attendance */}
        <section>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Attendance
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-1 pr-2"></th>
                {termList.map((t) => (
                  <th key={t.id} className="py-1 text-center">
                    T{t.term_number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['school_days', 'days_present', 'days_late'] as const).map((field) => (
                <tr key={field} className="border-b last:border-b-0">
                  <td className="py-1 pr-2 capitalize text-muted-foreground">
                    {field.replace('_', ' ')}
                  </td>
                  {termList.map((t) => {
                    const rec = (attendance ?? []).find((a) => a.term_id === t.id);
                    const val = (rec as Record<string, unknown> | undefined)?.[field] as
                      | number
                      | null
                      | undefined;
                    return (
                      <td key={t.id} className="py-1 text-center tabular-nums">
                        {val ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Adviser comments */}
        <section>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Form Class Adviser&apos;s Comments
          </div>
          <div className="space-y-2">
            {termList.map((t) => {
              const comment = (comments ?? []).find((c) => c.term_id === t.id)?.comment ?? null;
              return (
                <div key={t.id} className="rounded-md border p-2 text-sm">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {t.label}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">
                    {comment ?? (
                      <span className="italic text-muted-foreground">No comment yet.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer / signature line */}
        <footer className="border-t pt-4 text-xs text-muted-foreground">
          <div className="flex items-end justify-between">
            <div>
              <div className="mb-6">_________________________</div>
              <div>{section.form_class_adviser ?? 'Form Class Adviser'}</div>
            </div>
            <div className="text-right">
              <div className="mb-6">_________________________</div>
              <div>Parent / Guardian Signature</div>
            </div>
          </div>
          <div className="mt-4 text-center text-[10px] text-muted-foreground">
            HFSE International School · PEI Registration No. 2014xxxxx
          </div>
        </footer>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <div className="w-36 text-muted-foreground">{label}:</div>
      <div className="flex-1 font-medium">{value}</div>
    </div>
  );
}
