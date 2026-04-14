import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getStudentsByParentEmail } from '@/lib/supabase/admissions';
import { getCurrentAcademicYear } from '@/lib/academic-year';
import { buildReportCard } from '@/lib/report-card/build-report-card';
import { ReportCardDocument } from '@/components/report-card/report-card-document';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';

export default async function ParentReportCardPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? '';

  // 1) Verify parent→student linkage via admissions, for the current AY.
  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  if (!currentAy) notFound();
  const admissionsRows = await getStudentsByParentEmail(email, currentAy.ay_code);
  const allowedStudentNumbers = new Set(admissionsRows.map((r) => r.student_number));

  // 2) Resolve studentId → student_number to check ownership (student may
  //    exist in grading DB under a student_number we know belongs to this
  //    parent).
  const { data: student } = await service
    .from('students')
    .select('id, student_number')
    .eq('id', studentId)
    .maybeSingle();
  if (!student || !allowedStudentNumbers.has(student.student_number)) {
    notFound();
  }

  // 3) Build the report card payload via the shared helper (using service
  //    client since the parent's cookie-bound client can't read grade
  //    tables per RLS 005).
  const result = await buildReportCard(service, studentId);
  if (!result.ok) {
    if (result.error.kind === 'student_not_found' || result.error.kind === 'level_not_found') {
      notFound();
    }
    if (result.error.kind === 'no_current_ay') {
      return <div className="text-destructive">No current academic year.</div>;
    }
    if (result.error.kind === 'not_enrolled_this_ay') {
      return (
        <div className="text-sm text-muted-foreground">
          Student is not enrolled in the current academic year ({result.error.ayLabel}).
        </div>
      );
    }
  }
  if (!result.ok) notFound();
  const payload = result.payload;

  // 4) Gate: is there at least one active publication window for this
  //    student's section? If none, show a polite "not available yet" state
  //    instead of rendering the report card.
  const { data: publications } = await service
    .from('report_card_publications')
    .select('id, term_id, publish_from, publish_until')
    .eq('section_id', payload.section.id);

  // Server component runs per-request; current time is required to verify
  // the publication window.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const activePubs = (publications ?? []).filter((p) => {
    const from = new Date(p.publish_from as string).getTime();
    const until = new Date(p.publish_until as string).getTime();
    return now >= from && now <= until;
  });

  if (activePubs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Link
          href="/parent"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My children
        </Link>
        <PageHeader
          eyebrow="Report card"
          title={payload.student.full_name}
          description={`${payload.level.label} · ${payload.section.name} · ${payload.ay.label}`}
        />
        <Surface>
          <div className="py-6 text-center text-sm text-muted-foreground">
            This report card is not currently available to view. The school will publish it when
            it&apos;s ready.
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Parent chrome — hidden when printing. */}
      <div className="mx-auto w-full max-w-[8.5in] print:hidden">
        <Link
          href="/parent"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My children
        </Link>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <PageHeader
              eyebrow="Report card"
              title={payload.student.full_name}
              description={`${payload.level.label} · ${payload.section.name} · ${payload.ay.label}`}
            />
          </div>
          <div className="pt-2 text-xs text-muted-foreground">
            <Printer className="mr-1 inline h-3 w-3" />
            Press <kbd className="rounded border border-border bg-card px-1 py-0.5">Ctrl</kbd>
            {' + '}
            <kbd className="rounded border border-border bg-card px-1 py-0.5">P</kbd> to print or
            save as PDF
          </div>
        </div>
      </div>

      <ReportCardDocument payload={payload} />
    </div>
  );
}
