import { ArrowUpRight, ClipboardList, FileText, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { Surface } from "@/components/ui/surface";
import { getUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = getUserRole(user);

  const canSeeAdmin = role === "registrar" || role === "admin" || role === "superadmin";
  const canSeeGrading = role === "teacher" || role === "registrar" || role === "superadmin";
  const canSeeReportCards = role === "registrar" || role === "admin" || role === "superadmin";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Faculty Portal"
        title="Welcome back"
        description={
          <>
            Signed in as <span className="font-medium text-foreground">{user?.email}</span>
          </>
        }
        actions={
          <Badge variant="secondary" className="capitalize">
            {role ?? "no role"}
          </Badge>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {canSeeGrading && (
          <QuickLink
            icon={ClipboardList}
            title="Grading Sheets"
            description="Enter and review quarterly grades for your sections."
            href="/grading"
            cta="Open grading"
          />
        )}
        {canSeeReportCards && (
          <QuickLink
            icon={FileText}
            title="Report Cards"
            description="Preview and print report cards for the current academic year."
            href="/report-cards"
            cta="Browse report cards"
          />
        )}
        {canSeeAdmin && (
          <QuickLink
            icon={Settings}
            title="Admin"
            description="Sync students, manage sections, and review the audit log."
            href="/admin"
            cta="Open admin"
          />
        )}
      </div>
    </PageShell>
  );
}

function QuickLink({
  icon: Icon,
  title,
  description,
  href,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Surface className="group flex h-full flex-col gap-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1.5">
        <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" className="self-start">
        <Link href={href}>
          {cta}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </Button>
    </Surface>
  );
}
