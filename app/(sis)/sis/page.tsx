import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, CalendarCog, FolderCog, ShieldCheck, Users } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { getSessionUser } from '@/lib/supabase/server';
import type { Role } from '@/lib/auth/roles';

export default async function SisAdminHub() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  const role = sessionUser.role;
  if (role !== 'school_admin' && role !== 'admin' && role !== 'superadmin') {
    redirect('/');
  }

  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          SIS · Admin Hub
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          System administration.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Structural and system-level controls for the HFSE SIS. Day-to-day operational
          work lives in the Records module; this page is for AY rollovers, approver
          management, and other setup tasks that cross modules.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <AdminCard
          href="/records"
          icon={FolderCog}
          eyebrow="Operational"
          title="Records"
          description="Student records, profiles, family, stage pipeline, discount codes. The daily operational surface for admissions + registrar staff."
          cta="Open Records"
          role={role}
          allowedRoles={['school_admin', 'admin', 'superadmin']}
        />
        <AdminCard
          href="/sis/ay-setup"
          icon={CalendarCog}
          eyebrow="Structural"
          title="AY Setup"
          description="Create a new academic year, switch the active AY, or retire an empty one. Creates the 4 AY-prefixed admissions tables + SIS reference rows in a single transaction."
          cta="Open AY Setup"
          role={role}
          allowedRoles={['school_admin', 'admin', 'superadmin']}
        />
        <AdminCard
          href="/sis/admin/approvers"
          icon={ShieldCheck}
          eyebrow="Access"
          title="Approvers"
          description="Manage who approves grade-change requests. Teachers pick primary + secondary from this list at submission; only those two see the request."
          cta="Manage approvers"
          role={role}
          allowedRoles={['superadmin']}
        />
        <AdminCard
          href="/admin/admissions"
          icon={Users}
          eyebrow="Analytics"
          title="Admissions Dashboard"
          description="Read-only pipeline analytics — applications by level, conversion funnel, outdated applications, document completeness, assessment outcomes."
          cta="Open dashboard"
          role={role}
          allowedRoles={['school_admin', 'admin', 'superadmin']}
        />
      </section>
    </PageShell>
  );
}

function AdminCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  cta,
  role,
  allowedRoles,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  role: Role | null;
  allowedRoles: Role[];
}) {
  const enabled = role != null && allowedRoles.includes(role);
  const Inner = (
    <Card
      className={`@container/card h-full transition-all ${
        enabled ? 'hover:border-brand-indigo/40 hover:shadow-sm' : 'cursor-not-allowed opacity-60'
      }`}
    >
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {eyebrow}
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
      <CardFooter>
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          {enabled ? cta : 'Requires higher role'}
          {enabled && <ArrowUpRight className="size-3.5" />}
        </span>
      </CardFooter>
    </Card>
  );

  return enabled ? <Link href={href}>{Inner}</Link> : Inner;
}
