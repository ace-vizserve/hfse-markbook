import { redirect } from 'next/navigation';
import { BookOpenCheck } from 'lucide-react';

import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PageShell } from '@/components/ui/page-shell';
import { SowReviewTable } from '@/components/sis/sow-review-table';

type TermRow = {
  id: string;
  academic_year_id: string;
  label: string;
  term_number: number;
};

export default async function SowReviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    ayCode?: string;
    termId?: string;
    subjectId?: string;
  }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (
    sessionUser.role !== 'school_admin' &&
    sessionUser.role !== 'superadmin'
  ) {
    redirect('/sis');
  }

  const sp = await searchParams;
  const service = createServiceClient();

  const [{ data: aysRaw }, { data: termsRaw }, { data: subjectsRaw }] =
    await Promise.all([
      service
        .from('academic_years')
        .select('id, ay_code, label, is_current')
        .order('ay_code', { ascending: false }),
      service
        .from('terms')
        .select('id, academic_year_id, label, term_number')
        .order('term_number'),
      service.from('subjects').select('id, code, name').order('name'),
    ]);

  const ays = (aysRaw ?? []) as {
    id: string;
    ay_code: string;
    label: string;
    is_current: boolean;
  }[];
  const terms = (termsRaw ?? []) as TermRow[];
  const subjects = (subjectsRaw ?? []) as {
    id: string;
    code: string;
    name: string;
  }[];

  const currentAy = ays.find((a) => a.is_current) ?? ays[0];
  const selectedAyCode = sp.ayCode ?? currentAy?.ay_code ?? '';
  const ayTerms = terms.filter((t) => {
    const ay = ays.find((a) => a.ay_code === selectedAyCode);
    return ay ? t.academic_year_id === ay.id : false;
  });
  const selectedTermId = sp.termId ?? ayTerms[0]?.id ?? '';
  const selectedSubjectId = sp.subjectId ?? subjects[0]?.id ?? '';

  return (
    <PageShell>
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            SIS Admin · Curriculum
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
              <BookOpenCheck className="h-5 w-5 text-white" />
            </div>
            <h1 className="font-serif text-[32px] font-semibold leading-[1.1] tracking-tight text-foreground">
              Scheme of Work.
            </h1>
          </div>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Spot-check teacher-authored SOW entries. Teachers author and
            maintain their own SOW at Markbook → Scheme of Work.
          </p>
        </div>
      </header>

      <SowReviewTable
        ays={ays}
        terms={ayTerms}
        subjects={subjects}
        initialAyCode={selectedAyCode}
        initialTermId={selectedTermId}
        initialSubjectId={selectedSubjectId}
      />
    </PageShell>
  );
}
