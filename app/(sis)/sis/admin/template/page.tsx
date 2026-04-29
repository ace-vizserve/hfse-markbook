import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { TemplateManagerClient } from '@/components/sis/template-manager-client';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import {
  listEligibleAysForApply,
  listTemplateSections,
  listTemplateSubjectConfigs,
} from '@/lib/sis/template/queries';
import { listLevels, listSubjects } from '@/lib/sis/subjects/queries';
import { getSessionUser } from '@/lib/supabase/server';

// Master template editor. Superadmin only. Sections + subject_configs
// edited here are what every NEW AY copies from on creation, and the
// admin can also propagate template changes to existing AYs via the
// "Propagate template to AYs" dialog (UPSERT — never deletes).
export default async function TemplateAdminPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (sessionUser.role !== 'superadmin') redirect('/sis');

  const [templateSections, templateConfigs, subjects, levels, eligibleAys] = await Promise.all([
    listTemplateSections(),
    listTemplateSubjectConfigs(),
    listSubjects(),
    listLevels(),
    listEligibleAysForApply(),
  ]);

  return (
    <PageShell>
      <Link
        href="/sis"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        SIS Admin
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            SIS Admin · Class template
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Class template.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            The master sections + subject weights every new academic year copies from on creation.
            Edits stay in the template until you propagate them. New AYs created after a template
            change inherit the new values automatically; existing AYs only get them when you
            explicitly propagate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            Template
          </Badge>
        </div>
      </header>

      <TemplateManagerClient
        templateSections={templateSections}
        templateConfigs={templateConfigs}
        subjects={subjects}
        levels={levels}
        eligibleAys={eligibleAys}
      />
    </PageShell>
  );
}
