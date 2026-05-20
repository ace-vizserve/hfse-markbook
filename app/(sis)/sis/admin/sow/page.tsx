import { redirect } from 'next/navigation';
import { BookOpenCheck } from 'lucide-react';

import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PageShell } from '@/components/ui/page-shell';
import { SowBuilder } from '@/components/sis/sow-builder';

type AyRow = { id: string; ay_code: string; label: string; is_current: boolean };
type TermRow = { id: string; academic_year_id: string; label: string; term_number: number };
type SubjectRow = { id: string; code: string; name: string };
type LevelRow = { id: string; code: string; label: string };

// SIS Admin — Scheme of Work Builder
// school_admin and superadmin can create/edit/publish SOW master templates.
// The builder drives evaluation topic lists and WW/PT activity labels across
// all grading sheets in a given (AY × term × subject × level × track) scope.
export default async function SowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{
    ay_id?: string;
    term_id?: string;
    subject_id?: string;
    level_id?: string;
    curriculum_track?: string;
  }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (sessionUser.role !== 'school_admin' && sessionUser.role !== 'superadmin') {
    redirect('/sis');
  }

  const sp = await searchParams;
  const service = createServiceClient();

  const [
    { data: aysRaw },
    { data: termsRaw },
    { data: subjectsRaw },
    { data: levelsRaw },
  ] = await Promise.all([
    service
      .from('academic_years')
      .select('id, ay_code, label, is_current')
      .order('ay_code', { ascending: false }),
    service
      .from('terms')
      .select('id, academic_year_id, label, term_number')
      .order('term_number'),
    service
      .from('subjects')
      .select('id, code, name')
      .order('name'),
    service
      .from('levels')
      .select('id, code, label')
      .order('code'),
  ]);

  const ays = (aysRaw ?? []) as AyRow[];
  const terms = (termsRaw ?? []) as TermRow[];
  const subjects = (subjectsRaw ?? []) as SubjectRow[];
  const levels = (levelsRaw ?? []) as LevelRow[];

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
            Define activity names and evaluation topics per scope. Publish a version to make it available to sections;
            registrar applies it when creating grading sheets.
          </p>
        </div>
      </header>

      <SowBuilder
        ays={ays}
        terms={terms}
        subjects={subjects}
        levels={levels}
        initialScope={{
          ay_id: sp.ay_id,
          term_id: sp.term_id,
          subject_id: sp.subject_id,
          level_id: sp.level_id,
          curriculum_track: sp.curriculum_track as 'cambridge' | 'o_level' | 'singapore_inspired' | undefined,
        }}
      />
    </PageShell>
  );
}
