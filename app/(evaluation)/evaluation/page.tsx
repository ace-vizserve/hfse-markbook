import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCheck, Clock, NotebookPen, SquarePen, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ComparisonToolbar } from "@/components/dashboard/comparison-toolbar";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PriorityPanel } from "@/components/dashboard/priority-panel";
import {
  SubmissionVelocityDrillCard,
  TimeToSubmitHistogramCard,
  WriteupsBySectionCard,
} from "@/components/evaluation/drills/chart-drill-cards";
import { EvaluationDrillSheet } from "@/components/evaluation/drills/evaluation-drill-sheet";
import { TermOpenToggle } from "@/components/evaluation/term-open-toggle";
import { Alert, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { evaluationInsights } from "@/lib/dashboard/insights";
import { formatRangeLabel, resolveRange, TERM_SCOPED_PRESETS, type DashboardSearchParams } from "@/lib/dashboard/range";
import { getDashboardWindows } from "@/lib/dashboard/windows";
import {
  getEvaluationKpisRange,
  getEvaluationRegistrarPriority,
  getEvaluationTeacherPriority,
  getSubmissionVelocityRange,
} from "@/lib/evaluation/dashboard";
import { buildAllRowSets } from "@/lib/evaluation/drill";
import {
  daysUntilPtc,
  findPtcForWriteupTerm,
  getPtcEventsForAy,
  type PtcEvent,
} from "@/lib/evaluation/ptc-resolver";
import { cn } from "@/lib/utils";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Evaluation module landing page. The real work happens on /evaluation/sections
// (Bite 4) — this page is a light orientation surface describing what the
// module does + jumping into the writeup roster.
// Architectural note (KD #57 two-view split): teacher-vs-registrar branches
// currently render via inline conditionals (`isTeacher`, `canToggle &&
// rangeInput`). The full split into
// `components/evaluation/evaluation-{teacher,registrar}-view.tsx` is queued
// as architectural debt — pure code organisation, no behaviour change.
// Deferred because the inline pattern is functionally correct and the split
// is regression-risky for zero user-facing benefit. Revisit when this file
// crosses ~600 lines or a third role enters the mix.
export default async function EvaluationHub({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  const resolvedSearch = await searchParams;

  const canToggle =
    sessionUser.role === "registrar" ||
    sessionUser.role === "school_admin" ||
    sessionUser.role === "superadmin";

  // Current AY → its T1-T3 terms + window state. Cheap query + used only
  // by the toggle strip on this page.
  const supabase = await createClient();
  const service = createServiceClient();
  const { data: ay } = await supabase.from("academic_years").select("id, ay_code").eq("is_current", true).maybeSingle();
  const { data: termRows } = ay
    ? await supabase
        .from("terms")
        .select("id, label, term_number, is_current, virtue_theme")
        .eq("academic_year_id", ay.id)
        .neq("term_number", 4)
        .order("term_number", { ascending: true })
    : { data: [] };
  type TermLite = {
    id: string;
    label: string;
    term_number: number;
    is_current: boolean;
    virtue_theme: string | null;
  };
  const terms = (termRows ?? []) as TermLite[];

  const { data: evalTermRows } =
    terms.length > 0
      ? await service
          .from("evaluation_terms")
          .select("term_id, is_open")
          .in(
            "term_id",
            terms.map((t) => t.id),
          )
      : { data: [] };
  const openByTerm = new Map<string, boolean>(
    ((evalTermRows ?? []) as Array<{ term_id: string; is_open: boolean }>).map((r) => [r.term_id, r.is_open]),
  );

  // Dashboard band — current AY only.
  const ayCode = ay?.ay_code ?? "";

  // PTC deadline awareness — each writeup term may be discussed at a PTC
  // event scheduled in the *following* term on the calendar (e.g. T1 → Apr
  // PTC). Pulled from `calendar_events` via the date-driven resolver so
  // reschedules/additions flow through without code changes.
  const ptcEvents: PtcEvent[] = ayCode ? await getPtcEventsForAy(ayCode) : [];
  const ptcByTerm = new Map<string, PtcEvent | null>(
    terms.map((t) => [t.id, findPtcForWriteupTerm(t.id, ptcEvents)]),
  );

  // Cross-surface coordination check — surface a single dashboard-level
  // alert when a term's PTC is within 30 days and the evaluation window
  // is still closed (advisers can't write, but parents will turn up).
  // Tentative PTC dates are excluded: the date isn't locked in yet, so
  // an alert here would create false urgency. The inline label still
  // shows the tentative date so the registrar sees what's coming.
  const ptcWindowGaps = terms
    .map((t) => {
      const ptc = ptcByTerm.get(t.id) ?? null;
      if (!ptc) return null;
      if (ptc.tentative) return null;
      const days = daysUntilPtc(ptc.startDate);
      if (days < 0 || days > 30) return null;
      if (openByTerm.get(t.id)) return null;
      return { term: t, ptc, days };
    })
    .filter((g): g is { term: TermLite; ptc: PtcEvent; days: number } => g != null);

  const windows = ayCode
    ? await getDashboardWindows(ayCode)
    : { term: { thisTerm: null, lastTerm: null, byNumber: { 1: null, 2: null, 3: null, 4: null } }, ay: { thisAY: null, lastAY: null }, activeTermFallback: false };
  const rangeInput = ayCode ? resolveRange(resolvedSearch, windows, ayCode) : null;
  const [kpisResult, velocity, drillRowSets] = rangeInput
    ? await Promise.all([
        getEvaluationKpisRange(rangeInput),
        getSubmissionVelocityRange(rangeInput),
        buildAllRowSets({ ayCode, from: rangeInput.from, to: rangeInput.to }),
      ])
    : [null, null, null];
  const comparisonLabel = kpisResult?.comparisonRange
    ? `vs ${formatRangeLabel(kpisResult.comparisonRange)}`
    : undefined;

  // Role-aware PriorityPanel payload — teacher gets pending writeups across
  // their advisory sections; registrar gets pending writeups school-wide.
  // Run in parallel — neither depends on the other.
  const isTeacher = sessionUser.role === "teacher";
  const [teacherPriority, registrarPriority] = await Promise.all([
    isTeacher && ayCode
      ? getEvaluationTeacherPriority({ ayCode, teacherUserId: sessionUser.id })
      : Promise.resolve(null),
    canToggle && ayCode
      ? getEvaluationRegistrarPriority({ ayCode })
      : Promise.resolve(null),
  ]);

  const insights = kpisResult
    ? evaluationInsights({
        submissionPct: kpisResult.current.submissionPct,
        submitted: kpisResult.current.submitted,
        expected: kpisResult.current.expected,
        medianTimeToSubmitDays: kpisResult.current.medianTimeToSubmitDays,
        medianTimeToSubmitDaysPrior: kpisResult.comparison?.medianTimeToSubmitDays,
        lateSubmissions: kpisResult.current.lateSubmissions,
      })
    : [];

  // Soft-warn when any T1–T3 term in the current AY lacks a virtue theme.
  // Per KD #28, NULL virtue locks teacher textareas; registrars can still
  // write but face the same content gap on the report card. Surface the gap
  // on the hub so neither role discovers it on a closed dialog.
  const termsMissingVirtue = terms.filter((t) => !t.virtue_theme);

  return (
    <PageShell>
      <DashboardHero
        eyebrow="Student Evaluation · Hub"
        title="Form class adviser write-ups"
        description="One paragraph per student per term, guided by the term's virtue theme. Sole source for T1–T3 report card comments. T4 is inactive."
        badges={ayCode ? [{ label: ayCode }] : []}
      />

      {termsMissingVirtue.length > 0 && (
        <Alert variant="warning">
          <AlertIcon>
            <AlertTriangle className="size-4" />
          </AlertIcon>
          <AlertTitle>Virtue theme not set for {termsMissingVirtue.length} term{termsMissingVirtue.length === 1 ? "" : "s"}</AlertTitle>
          <AlertDescription>
            {termsMissingVirtue.map((t) => t.label).join(" · ")} — write-up textareas stay locked for teachers until a
            virtue theme is configured.{" "}
            {canToggle ? (
              <Link href="/sis/ay-setup" className="font-medium underline underline-offset-2">
                Set virtue themes in AY Setup →
              </Link>
            ) : (
              <span>Ask the registrar to set the virtue theme in AY Setup.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {teacherPriority && <PriorityPanel payload={teacherPriority} />}
      {registrarPriority && <PriorityPanel payload={registrarPriority} />}

      {canToggle && rangeInput && kpisResult && velocity && (
        <>
          {windows.activeTermFallback && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
              Active term hasn&apos;t started yet. Showing the previous term&apos;s data as a default — pick a different range above to override.
            </div>
          )}

          <ComparisonToolbar
            ayCode={ayCode}
            ayCodes={[ayCode]}
            range={{ from: rangeInput.from, to: rangeInput.to }}
            comparison={
              rangeInput.cmpFrom && rangeInput.cmpTo
                ? { from: rangeInput.cmpFrom, to: rangeInput.cmpTo }
                : null
            }
            termWindows={windows.term}
            ayWindows={windows.ay}
            showAySwitcher={false}
            presets={TERM_SCOPED_PRESETS}
          />

          {insights.length > 0 && <InsightsPanel insights={insights} />}

          <section className="grid gap-4 xl:grid-cols-4">
            <MetricCard
              label="Submission %"
              value={kpisResult.current.submissionPct}
              format="percent"
              icon={TrendingUp}
              intent={kpisResult.current.submissionPct >= 80 ? "good" : "warning"}
              delta={kpisResult.delta ?? undefined}
              deltaGoodWhen="up"
              comparisonLabel={comparisonLabel}
              sparkline={velocity.current.slice(-14)}
              drillSheet={() => (
                <EvaluationDrillSheet
                  target="submission-status"
                  ayCode={ayCode}
                  initialFrom={rangeInput.from}
                  initialTo={rangeInput.to}
                  initialWriteups={drillRowSets?.writeups}
                />
              )}
            />
            <MetricCard
              label="Submitted"
              value={kpisResult.current.submitted}
              icon={CheckCircle2}
              intent="default"
              subtext={`of ${kpisResult.current.expected} expected`}
              drillSheet={() => (
                <EvaluationDrillSheet
                  target="submitted"
                  ayCode={ayCode}
                  initialFrom={rangeInput.from}
                  initialTo={rangeInput.to}
                  initialWriteups={drillRowSets?.writeups}
                />
              )}
            />
            <MetricCard
              label="Median time-to-submit"
              value={kpisResult.current.medianTimeToSubmitDays ?? "—"}
              format="days"
              icon={Clock}
              intent="default"
              deltaGoodWhen="down"
              subtext={
                kpisResult.comparison?.medianTimeToSubmitDays != null
                  ? `${kpisResult.comparison.medianTimeToSubmitDays}d prior`
                  : kpisResult.comparison
                    ? "No prior data"
                    : undefined
              }
              drillSheet={() => (
                <EvaluationDrillSheet
                  target="time-to-submit"
                  ayCode={ayCode}
                  initialFrom={rangeInput.from}
                  initialTo={rangeInput.to}
                  initialWriteups={drillRowSets?.writeups}
                />
              )}
            />
            <MetricCard
              label="Late submissions"
              value={kpisResult.current.lateSubmissions}
              icon={Clock}
              intent={kpisResult.current.lateSubmissions > 0 ? "warning" : "good"}
              deltaGoodWhen="down"
              subtext={
                kpisResult.comparison
                  ? `${kpisResult.comparison.lateSubmissions} prior · submitted >14d after creation`
                  : "Submitted >14d after writeup was created"
              }
              drillSheet={() => (
                <EvaluationDrillSheet
                  target="late"
                  ayCode={ayCode}
                  initialFrom={rangeInput.from}
                  initialTo={rangeInput.to}
                  initialWriteups={drillRowSets?.writeups}
                />
              )}
            />
          </section>

          {velocity.current.length > 1 && (
            <SubmissionVelocityDrillCard
              current={velocity.current}
              comparison={velocity.comparison}
              ayCode={ayCode}
              rangeFrom={rangeInput.from}
              rangeTo={rangeInput.to}
              initialWriteups={drillRowSets?.writeups}
            />
          )}

          {drillRowSets && (drillRowSets.bySection.length > 0 || drillRowSets.buckets.some((b) => b.count > 0)) && (
            <section className="grid gap-4 lg:grid-cols-2">
              <WriteupsBySectionCard
                data={drillRowSets.bySection}
                ayCode={ayCode}
                rangeFrom={rangeInput.from}
                rangeTo={rangeInput.to}
                initialBySection={drillRowSets.bySection}
                initialWriteups={drillRowSets.writeups}
              />
              <TimeToSubmitHistogramCard
                data={drillRowSets.buckets}
                ayCode={ayCode}
                rangeFrom={rangeInput.from}
                rangeTo={rangeInput.to}
                initialBuckets={drillRowSets.buckets}
                initialWriteups={drillRowSets.writeups}
              />
            </section>
          )}
        </>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <HubCard
          href="/evaluation/sections"
          icon={SquarePen}
          eyebrow="Write-ups"
          title={isTeacher ? "My sections" : "Section roster"}
          description={
            isTeacher
              ? "Write or revise the adviser paragraph for each student in your section. Guided by the term's virtue theme. Autosaves per keystroke; Submit marks a write-up finalised."
              : "Browse every section's adviser writeups school-wide. Filter by term, virtue theme, or completion state. Read-only oversight unless you're the assigned form adviser."
          }
          cta="Open roster"
        />
        <HubCard
          href="/sis/ay-setup"
          icon={NotebookPen}
          eyebrow="Configuration"
          title="Virtue theme"
          description="Set in SIS Admin → Term dates, per term. The theme appears as a prompt to advisers and as the parenthetical on printed report cards."
          cta="Open AY Setup"
        />
      </section>

      {/* Evaluation-window open/close toggle strip (registrar+). Teachers
          see the open/closed state read-only; they're gated by it, not
          controlling it. */}
      {terms.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Evaluation window
          </h2>

          {/* Cross-surface coordination alert — fires when a term's PTC is
              within two weeks but the evaluation window is still closed
              (KD #76 calendar + KD #49 writeup deadline interaction). */}
          {canToggle && ptcWindowGaps.length > 0 && (
            <Alert variant="warning">
              <AlertIcon>
                <AlertTriangle />
              </AlertIcon>
              <AlertTitle>
                {ptcWindowGaps.length === 1
                  ? `${ptcWindowGaps[0].term.label} PTC is ${formatPtcCountdown(ptcWindowGaps[0].days)} but the window is still closed`
                  : `${ptcWindowGaps.length} terms have PTC within 30 days but the window is still closed`}
              </AlertTitle>
              <AlertDescription>
                Advisers can&apos;t write or submit until the window is open. Toggle it on for{" "}
                {ptcWindowGaps.map((g) => g.term.label).join(", ")} below so they can finish writeups before parents arrive.
              </AlertDescription>
            </Alert>
          )}

          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {terms.map((t) => {
              const ptc = ptcByTerm.get(t.id) ?? null;
              return (
                <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-[15px] font-semibold text-foreground">{t.label}</span>
                      {t.is_current && (
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                          current
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                      <span>{t.virtue_theme ? `Virtue: ${t.virtue_theme}` : "Virtue theme not set"}</span>
                      <PtcInlineLabel ptc={ptc} />
                    </div>
                  </div>
                  <TermOpenToggle
                    termId={t.id}
                    termLabel={t.label}
                    isOpen={openByTerm.get(t.id) ?? false}
                    canToggle={canToggle}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <ClipboardCheck className="size-3" strokeWidth={2.25} />
        <span>KD #49 — Evaluation owns the FCA write-up · PTC dates pulled from the school calendar (KD #76)</span>
      </div>
    </PageShell>
  );
}

// Plain-English countdown for the alert title — keeps the dashboard copy
// readable to a non-technical school admin (per ops feedback memory).
function formatPtcCountdown(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// Inline "PTC: 8–9 Apr · in 12 days" cell rendered next to the virtue
// theme. Tone escalates with proximity. Hidden entirely on T4 (no writeup
// per KD #49 → no PTC discussion). When no PTC is scheduled for this AY,
// renders a muted "No PTC scheduled" so registrars notice the gap.
//
// `tentative=true` events render with a "(tentative)" suffix and a
// neutralised tone — the date is on the calendar but pending registrar
// confirmation, so we shouldn't escalate to amber/destructive just yet.
function PtcInlineLabel({ ptc }: { ptc: PtcEvent | null }) {
  if (!ptc) {
    return (
      <span className="text-muted-foreground">PTC not scheduled</span>
    );
  }
  const days = daysUntilPtc(ptc.startDate);
  const range = formatPtcRangeDisplay(ptc.startDate, ptc.endDate);
  const tone = ptc.tentative
    ? "text-muted-foreground"
    : days < 0
      ? "text-destructive"
      : days <= 3
        ? "text-destructive"
        : days <= 14
          ? "text-brand-amber"
          : "text-muted-foreground";
  const suffix =
    days === 0
      ? "today"
      : days === 1
        ? "tomorrow"
        : days > 0
          ? `in ${days} days`
          : `${Math.abs(days)} days ago`;
  return (
    <span className={cn("inline-flex items-center gap-1", tone)}>
      <span className="font-semibold uppercase tracking-[0.14em]">PTC</span>
      <span>·</span>
      <span>{range}</span>
      <span>·</span>
      <span>{suffix}</span>
      {ptc.tentative && (
        <>
          <span>·</span>
          <span className="italic">tentative</span>
        </>
      )}
    </span>
  );
}

// Same range-formatting recipe as `lib/evaluation/dashboard.ts::formatPtcRangeLabel`
// (kept inline here so the server-component renderer doesn't have to import
// from a `'server-only'` module just for a date string).
function formatPtcRangeDisplay(startIso: string, endIso: string): string {
  try {
    const start = new Date(`${startIso}T00:00:00+08:00`);
    const end = new Date(`${endIso}T00:00:00+08:00`);
    const sameDay = startIso === endIso;
    if (sameDay) {
      return start.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
    }
    const sameMonth =
      start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
    if (sameMonth) {
      return `${start.toLocaleDateString("en-SG", { day: "numeric" })}–${end.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`;
    }
    return `${start.toLocaleDateString("en-SG", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`;
  } catch {
    return startIso;
  }
}

function HubCard({
  href,
  icon: Icon,
  eyebrow,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link href={href}>
      <Card className="@container/card h-full transition-all hover:-translate-y-0.5 hover:border-brand-indigo/40 hover:shadow-md">
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            {eyebrow}
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">{title}</CardTitle>
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
            {cta}
            <ArrowUpRight className="size-3.5" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
