import Link from 'next/link';
import {
  ArrowRight,
  ClipboardList,
  History,
  RefreshCw,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';

type Tool = {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

const TOOLS: Tool[] = [
  {
    icon: RefreshCw,
    title: 'Sync Students from Admissions',
    description:
      'Pull new, updated, and withdrawn students from the admissions tables for the current academic year.',
    href: '/admin/sync-students',
    cta: 'Open sync',
  },
  {
    icon: Users,
    title: 'Sections & Rosters',
    description:
      'View every section for the current AY and manage enrolment, class advisers, and comments.',
    href: '/admin/sections',
    cta: 'Open sections',
  },
  {
    icon: ClipboardList,
    title: 'Grading Sheets',
    description:
      'Create, lock, and review grading sheets for every subject × section × term combination.',
    href: '/grading',
    cta: 'Open grading',
  },
  {
    icon: History,
    title: 'Audit Log',
    description:
      'Append-only record of every post-lock grade change, with field diffs and approval references.',
    href: '/admin/audit-log',
    cta: 'Open audit log',
  },
];

export default function AdminHome() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        description="Registrar and administrator tools."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Surface
              key={t.href}
              className="group flex h-full flex-col gap-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1.5">
                <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">
                  {t.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t.description}
                </p>
              </div>
              <Button asChild size="sm" className="self-start">
                <Link href={t.href}>
                  {t.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Surface>
          );
        })}
      </div>
    </PageShell>
  );
}
