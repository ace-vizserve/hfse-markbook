import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileStack,
  FolderKanban,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { isRouteAllowed } from '@/lib/auth/roles';
import { getSessionUser } from '@/lib/supabase/server';

// Root `/` is the SIS entry point. Single-module roles auto-redirect to
// their module; multi-module roles see a "pick a module" tile picker
// — same lifecycle order + same canonical role gate as the top-bar
// ModuleSwitcher, so the picker can't drift from ROUTE_ACCESS.
//
// Lifecycle order: Admissions → Records → P-Files → Markbook → Attendance
// → Evaluation → SIS Admin (matches components/module-switcher.tsx).
const MODULES: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/admissions', label: 'Admissions', icon: FileStack },
  { href: '/records', label: 'Records', icon: Users },
  { href: '/p-files', label: 'P-Files', icon: FolderKanban },
  { href: '/markbook', label: 'Markbook', icon: BookOpen },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/evaluation', label: 'Evaluation', icon: ClipboardCheck },
  { href: '/sis', label: 'SIS Admin', icon: ShieldCheck },
];

export default async function Home() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');

  const { role, email } = sessionUser;

  // Single-module roles: skip the picker, go straight to work.
  if (role === 'teacher') redirect('/markbook');
  if (role === 'p-file') redirect('/p-files');
  if (role === 'admissions') redirect('/admissions');
  if (!role) redirect('/parent');

  // Superadmin defaults to /sis per KD #42 — structural oversight, not daily
  // operational work. They can still pick any module via the switcher.
  if (role === 'superadmin') redirect('/sis');

  // Multi-module roles (registrar, school_admin, admin) see the picker.
  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          HFSE · Student Information System
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Pick a module.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{email}</span>. Every module
          surfaces a different facet of the same student record.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {MODULES.map((m) => (
          <ModuleTile
            key={m.href}
            href={m.href}
            label={m.label}
            icon={m.icon}
            enabled={isRouteAllowed(m.href, role)}
          />
        ))}
      </section>
    </PageShell>
  );
}

function ModuleTile({
  href,
  label,
  icon: Icon,
  enabled,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
}) {
  const inner = (
    <Card
      className={
        '@container/card flex aspect-square flex-col items-center justify-center gap-4 p-6 text-center transition-all ' +
        (enabled
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-brand-indigo/40 hover:shadow-md'
          : 'cursor-not-allowed opacity-50')
      }
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
        <Icon className="size-6" />
      </div>
      <span className="font-serif text-base font-semibold tracking-tight text-foreground">
        {label}
      </span>
    </Card>
  );

  return enabled ? <Link href={href}>{inner}</Link> : <div aria-disabled>{inner}</div>;
}
