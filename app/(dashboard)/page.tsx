import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Lock,
  RefreshCw,
  Unlock,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { PipelineCards } from "@/components/admissions/pipeline-cards";
import { OutdatedApplicationsTable } from "@/components/admissions/outdated-applications-table";
import {
  getOutdatedApplications,
  getPipelineCounts,
} from "@/lib/admissions/dashboard";
import { getCurrentAcademicYear, requireCurrentAyCode } from "@/lib/academic-year";
import { getRoleFromClaims } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Tool = {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

const ADMIN_TOOLS: Tool[] = [
  {
    icon: RefreshCw,
    eyebrow: "Admissions",
    title: "Sync Students",
    description:
      "Pull new, updated, and withdrawn students from the admissions tables for the current academic year.",
    href: "/admin/sync-students",
    cta: "Open sync",
  },
  {
    icon: Users,
    eyebrow: "Rosters",
    title: "Sections & Advisers",
    description:
      "View every section for the current AY and manage enrolment, class advisers, and comments.",
    href: "/admin/sections",
    cta: "Open sections",
  },
  {
    icon: History,
    eyebrow: "Compliance",
    title: "Audit Log",
    description:
      "Append-only record of every post-lock grade change, with field diffs and approval references.",
    href: "/admin/audit-log",
    cta: "Open audit log",
  },
];

export default async function DashboardHome() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const email = (claims?.email as string | undefined) ?? undefined;
  const role = getRoleFromClaims(claims);

  // Superadmin defaults to the SIS admin hub — their job is structural /
  // IT / CEO-level oversight, not the Markbook dashboard. They can still
  // reach `/` via the module switcher → Markbook; this is just the default
  // landing after sign-in and on fresh navigation to `/`.
  if (role === "superadmin") {
    redirect("/sis");
  }

  // Superadmin was already redirected to /sis above, so the narrowed role
  // type no longer includes "superadmin" — don't repeat it in these checks.
  const canSeeAdmin = role === "registrar" || role === "school_admin" || role === "admin";
  const canSeeGrading = role === "teacher" || role === "registrar";
  const canSeeReportCards = role === "registrar" || role === "school_admin" || role === "admin";

  // Service client bypasses RLS so stats are the school-wide view — teachers
  // see the same numbers; their scoped work lives on /grading.
  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  const ayCode = canSeeAdmin ? await requireCurrentAyCode(supabase) : null;

  // Run stats, pipeline, and outdated-applications in parallel. Each is
  // independently cached (stats via unstable_cache below; pipeline/outdated
  // via lib/admissions/dashboard.ts).
  const [stats, pipeline, outdated] = await Promise.all([
    currentAy ? loadStats(currentAy.id) : Promise.resolve(null),
    canSeeAdmin && ayCode ? getPipelineCounts(ayCode) : Promise.resolve(null),
    canSeeAdmin && ayCode
      ? getOutdatedApplications(ayCode)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof getOutdatedApplications>>,
        ),
  ]);

  return (
    <PageShell>
      {/* Hero header */}
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Faculty Portal
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Welcome back.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{email}</span>. Here&apos;s where
            HFSE stands today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentAy && (
            <Badge
              variant="outline"
              className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
            >
              {currentAy.ay_code}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
          >
            {role ?? "no role"}
          </Badge>
        </div>
      </header>

      {/* Stats — dashboard-01 SectionCards pattern */}
      <div className="@container/main">
        <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <StatCard
            description="Students enrolled"
            value={stats ? formatNumber(stats.studentsActive) : "—"}
            icon={Users}
            footerTitle={stats ? `${formatNumber(stats.sectionsActive)} active sections` : "No data"}
            footerDetail={currentAy?.label ?? "—"}
          />
          <StatCard
            description="Grading sheets"
            value={stats ? formatNumber(stats.sheetsOpen + stats.sheetsLocked) : "—"}
            icon={ClipboardList}
            footerTitle={
              stats
                ? `${formatNumber(stats.sheetsOpen)} open · ${formatNumber(stats.sheetsLocked)} locked`
                : "No data"
            }
            footerDetail="Across all terms"
          />
          <StatCard
            description="Sheets locked"
            value={stats ? formatPercent(stats.sheetsLocked, stats.sheetsOpen + stats.sheetsLocked) : "—"}
            icon={Lock}
            footerTitle={
              stats && stats.sheetsOpen + stats.sheetsLocked > 0
                ? `${stats.sheetsLocked} of ${stats.sheetsOpen + stats.sheetsLocked} sheets`
                : "No sheets yet"
            }
            footerDetail="Locked = finalized for parents"
          />
          <StatCard
            description="Publications live"
            value={stats ? formatNumber(stats.publicationsActive) : "—"}
            icon={CheckCircle2}
            footerTitle={
              stats && stats.publicationsScheduled > 0
                ? `${stats.publicationsScheduled} scheduled next`
                : "No upcoming windows"
            }
            footerDetail="Report cards visible to parents"
          />
        </div>
      </div>

      {/* Admissions snapshot — privileged roles only */}
      {canSeeAdmin && pipeline && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Admissions · At a glance
              </p>
              <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                Pipeline snapshot
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/admissions">
                Full dashboard
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <PipelineCards counts={pipeline} />
        </section>
      )}

      {/* Stale applications — privileged roles only */}
      {canSeeAdmin && (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Needs attention
            </p>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
              Stale applications
            </h2>
          </div>
          <OutdatedApplicationsTable rows={outdated} />
        </section>
      )}

      {/* Admin tools — privileged roles only */}
      {canSeeAdmin && (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Tools
            </p>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
              Administrator tools
            </h2>
          </div>
          <div className="@container/main">
            <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
              {ADMIN_TOOLS.map((t) => (
                <QuickLinkCard
                  key={t.href}
                  icon={t.icon}
                  eyebrow={t.eyebrow}
                  title={t.title}
                  description={t.description}
                  href={t.href}
                  cta={t.cta}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Quick links — grading + report cards (admin card removed; admin tools are inline above) */}
      {(canSeeGrading || canSeeReportCards) && (
        <div>
          <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Jump back in
          </p>
          <div className="@container/main">
            <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2">
              {canSeeGrading && (
                <QuickLinkCard
                  icon={ClipboardList}
                  eyebrow="Grading"
                  title="Grading Sheets"
                  description="Enter and review quarterly grades for your sections."
                  href="/grading"
                  cta="Open grading"
                  primary={!canSeeAdmin}
                />
              )}
              {canSeeReportCards && (
                <QuickLinkCard
                  icon={FileText}
                  eyebrow="Report Cards"
                  title="Report Cards"
                  description="Preview, print, and publish report cards for the current academic year."
                  href="/report-cards"
                  cta="Browse report cards"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <TrustStrip ayLabel={currentAy?.ay_code ?? "—"} />
    </PageShell>
  );
}

type Stats = {
  studentsActive: number;
  sectionsActive: number;
  sheetsOpen: number;
  sheetsLocked: number;
  publicationsActive: number;
  publicationsScheduled: number;
};

// School-wide dashboard stats. Cached with a short TTL + a `dashboard-stats`
// tag so mutations elsewhere (grading, publications) can revalidate on demand
// via `revalidateTag('dashboard-stats')` when that becomes worth wiring up.
// Service client is created inside the cached function so the closure is
// fully serializable and the cache key is deterministic on academicYearId.
async function loadStatsUncached(academicYearId: string): Promise<Stats> {
  const service = createServiceClient();

  // First wave: fetch sections (rows + exact count) and term IDs in parallel.
  // Combining the two section queries saves one round-trip versus the old
  // "count head + id rows" pair.
  const [sectionsRes, termsRes] = await Promise.all([
    service
      .from("sections")
      .select("id", { count: "exact" })
      .eq("academic_year_id", academicYearId),
    service
      .from("terms")
      .select("id")
      .eq("academic_year_id", academicYearId),
  ]);

  const sectionIds = (sectionsRes.data ?? []).map((r) => r.id as string);
  const sectionsActive = sectionsRes.count ?? 0;
  const termIds = (termsRes.data ?? []).map((r) => r.id as string);

  // Second wave: five dependent counts all in parallel.
  const nowIso = new Date().toISOString();
  type CountRes = { count: number | null };
  const zero: Promise<CountRes> = Promise.resolve({ count: 0 });

  const [studentsRes, sheetsOpenRes, sheetsLockedRes, pubActiveRes, pubScheduledRes] =
    await Promise.all([
      sectionIds.length > 0
        ? service
            .from("section_students")
            .select("*", { count: "exact", head: true })
            .eq("enrollment_status", "active")
            .in("section_id", sectionIds)
        : zero,
      termIds.length > 0
        ? service
            .from("grading_sheets")
            .select("*", { count: "exact", head: true })
            .eq("is_locked", false)
            .in("term_id", termIds)
        : zero,
      termIds.length > 0
        ? service
            .from("grading_sheets")
            .select("*", { count: "exact", head: true })
            .eq("is_locked", true)
            .in("term_id", termIds)
        : zero,
      sectionIds.length > 0
        ? service
            .from("report_card_publications")
            .select("*", { count: "exact", head: true })
            .in("section_id", sectionIds)
            .lte("publish_from", nowIso)
            .gte("publish_until", nowIso)
        : zero,
      sectionIds.length > 0
        ? service
            .from("report_card_publications")
            .select("*", { count: "exact", head: true })
            .in("section_id", sectionIds)
            .gt("publish_from", nowIso)
        : zero,
    ]);

  return {
    studentsActive: studentsRes.count ?? 0,
    sectionsActive,
    sheetsOpen: sheetsOpenRes.count ?? 0,
    sheetsLocked: sheetsLockedRes.count ?? 0,
    publicationsActive: pubActiveRes.count ?? 0,
    publicationsScheduled: pubScheduledRes.count ?? 0,
  };
}

const loadStats = unstable_cache(
  loadStatsUncached,
  ["dashboard-stats"],
  { revalidate: 60, tags: ["dashboard-stats"] },
);

function formatNumber(n: number): string {
  return n.toLocaleString("en-SG");
}

function formatPercent(num: number, den: number): string {
  if (den === 0) return "—";
  const pct = Math.round((num / den) * 100);
  return `${pct}%`;
}

function StatCard({
  description,
  value,
  icon: Icon,
  footerTitle,
  footerDetail,
}: {
  description: string;
  value: string;
  icon: LucideIcon;
  footerTitle: string;
  footerDetail: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {description}
        </CardDescription>
        <CardTitle className="font-serif text-[32px] font-semibold leading-none tabular-nums text-foreground @[240px]/card:text-[38px]">
          {value}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <p className="font-medium text-foreground">{footerTitle}</p>
        <p className="text-xs text-muted-foreground">{footerDetail}</p>
      </CardFooter>
    </Card>
  );
}

function QuickLinkCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  href,
  cta,
  primary = false,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <Card
      className={
        "@container/card group relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" +
        (primary ? " ring-1 ring-primary/20" : "")
      }
    >
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {eyebrow}
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold leading-snug tracking-tight text-foreground @[260px]/card:text-[22px]">
          {title}
        </CardTitle>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-4 text-sm">
        <p className="leading-relaxed text-muted-foreground">{description}</p>
        <Button asChild size="sm">
          <Link href={href}>
            {cta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function TrustStrip({ ayLabel }: { ayLabel: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <Unlock className="size-3" strokeWidth={2.25} />
      <span>{ayLabel}</span>
      <span className="text-border">·</span>
      <span>Supabase Auth</span>
      <span className="text-border">·</span>
      <span>Audit-logged</span>
    </div>
  );
}
