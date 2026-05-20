import { AlertTriangle, ArrowLeft, CalendarClock, ClipboardList, MessageCircle, Sparkle, SquarePen } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChecklistRosterClient } from "@/components/evaluation/checklist-roster-client";
import { PtcRosterClient } from "@/components/evaluation/ptc-roster-client";
import { TermSwitcher } from "@/components/evaluation/term-switcher";
import { WriteupRosterClient } from "@/components/evaluation/writeup-roster-client";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/ui/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPtcFeedbackBySectionTerm,
  getResponsesBySectionTerm,
  getSectionsTeacherCanCopyFrom,
  getSubjectCommentsBySectionTerm,
  listChecklistItems,
  listTeacherSubjectsForSection,
} from "@/lib/evaluation/checklist";
import { getEvaluationTermConfig, getSectionRoster, listFormAdviserSectionIds } from "@/lib/evaluation/queries";
import { daysUntilPtc, findPtcForWriteupTerm, getPtcEventsForAy } from "@/lib/evaluation/ptc-resolver";
import { sowExistsForSection } from "@/lib/sis/sow/queries";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export default async function EvaluationSectionRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<{ term_id?: string; tab?: string; subject_id?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  if (
    sessionUser.role !== "teacher" &&
    sessionUser.role !== "registrar" &&
    sessionUser.role !== "school_admin" &&
    sessionUser.role !== "superadmin"
  ) {
    redirect("/");
  }

  const { sectionId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  // Section + level + AY.
  const { data: section } = await supabase
    .from("sections")
    .select(
      "id, name, academic_year_id, curriculum_track, level:levels(id, label, level_type), academic_year:academic_years(id, ay_code, label)",
    )
    .eq("id", sectionId)
    .single();
  if (!section) notFound();

  // Teacher access gate: must be form_adviser OR subject_teacher on this
  // section. Writeups tab is adviser-only; Checklists tab is open to
  // either role (subject-scoped for subject teachers).
  let teacherIsFormAdviser = false;
  let teacherSubjectIds: string[] = [];
  if (sessionUser.role === "teacher") {
    const [adviserSet, subjects] = await Promise.all([
      listFormAdviserSectionIds(sessionUser.id),
      listTeacherSubjectsForSection(sessionUser.id, sectionId),
    ]);
    teacherIsFormAdviser = adviserSet.has(sectionId);
    teacherSubjectIds = subjects;
    if (!teacherIsFormAdviser && teacherSubjectIds.length === 0) {
      redirect("/evaluation/sections");
    }
  }

  // Terms in this AY, excluding T4 (no comment on the final card per KD #49).
  const { data: termsRaw } = await supabase
    .from("terms")
    .select("id, label, term_number, is_current")
    .eq("academic_year_id", section.academic_year_id)
    .neq("term_number", 4)
    .order("term_number", { ascending: true });

  type TermLite = { id: string; label: string; term_number: number; is_current: boolean };
  const terms = (termsRaw ?? []) as TermLite[];
  const defaultTermId = sp.term_id ?? terms.find((t) => t.is_current)?.id ?? terms[0]?.id ?? "";
  const selectedTerm = terms.find((t) => t.id === defaultTermId) ?? null;
  if (!selectedTerm) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No T1–T3 term configured for this AY.</div>
      </PageShell>
    );
  }

  const config = await getEvaluationTermConfig(selectedTerm.id);
  const roster = await getSectionRoster(sectionId, selectedTerm.id);

  const level = (Array.isArray(section.level) ? section.level[0] : section.level) as {
    id: string;
    label: string;
    level_type: string;
  } | null;
  const ay = (Array.isArray(section.academic_year) ? section.academic_year[0] : section.academic_year) as {
    ay_code: string;
    label: string;
  } | null;

  const canEdit = sessionUser.role !== "teacher" || !!config?.virtueTheme;
  const submittedCount = roster.filter((r) => r.submitted).length;
  const totalCount = roster.length;

  // PTC awareness for the term being viewed. The audience filter prevents a
  // secondary-only PTC from leaking into a primary section's deadline (and
  // vice versa) — see KD #76 calendar audience scope. Preschool sections
  // (level_type unset / 'preschool') fall back to 'all'.
  const audience: 'all' | 'primary' | 'secondary' | undefined =
    level?.level_type === 'primary'
      ? 'primary'
      : level?.level_type === 'secondary'
        ? 'secondary'
        : undefined;
  const ptcEvents = ay ? await getPtcEventsForAy(ay.ay_code, audience ? { audience } : {}) : [];
  const ptcForTerm = findPtcForWriteupTerm(selectedTerm.id, ptcEvents);
  const ptcDays = ptcForTerm ? daysUntilPtc(ptcForTerm.startDate) : null;
  const ptcIsTentative = ptcForTerm?.tentative === true;
  const pendingWriteups = Math.max(0, totalCount - submittedCount);
  // Tentative PTC dates show as an info pill (so the adviser knows it's
  // pencilled in) but don't trigger the urgent/overdue banner — the
  // registrar hasn't locked the date in yet, so escalation would be
  // premature pressure on the adviser.
  const ptcUrgent = !ptcIsTentative && ptcDays != null && ptcDays >= 0 && ptcDays <= 30;
  const ptcOverdue = !ptcIsTentative && ptcDays != null && ptcDays < 0 && pendingWriteups > 0;
  const ptcTentativeNote = ptcIsTentative && ptcForTerm;

  // Writeups tab is only available to form_adviser + registrar+.
  // Checklists tab is available to form_adviser + subject_teacher + registrar+.
  const canAccessWriteups = sessionUser.role !== "teacher" || teacherIsFormAdviser;
  const canAccessChecklists = sessionUser.role !== "teacher" || teacherIsFormAdviser || teacherSubjectIds.length > 0;

  // Load the level's subjects so the Checklists tab has a subject picker.
  // Teachers with subject assignments see only their subjects; form_adviser
  // + registrar+ see all subjects enabled for this level × AY.
  const { data: configRows } = level
    ? await supabase
        .from("subject_configs")
        .select("subject:subjects(id, code, name)")
        .eq("academic_year_id", section.academic_year_id)
        .eq("level_id", level.id)
    : { data: [] };
  type CfgRow = {
    subject: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  };
  const levelSubjects = ((configRows ?? []) as CfgRow[])
    .map((c) => (Array.isArray(c.subject) ? c.subject[0] : c.subject))
    .filter((s): s is { id: string; code: string; name: string } => !!s)
    .sort((a, b) => a.name.localeCompare(b.name));

  const visibleSubjects =
    sessionUser.role === "teacher" && !teacherIsFormAdviser
      ? levelSubjects.filter((s) => teacherSubjectIds.includes(s.id))
      : levelSubjects;

  const selectedSubjectId =
    sp.subject_id && visibleSubjects.some((s) => s.id === sp.subject_id)
      ? sp.subject_id
      : (visibleSubjects[0]?.id ?? "");

  // Topics are admin-prescribed via the SOW builder (KD #107). Teachers see
  // the topic list read-only; no add/edit/delete/reorder affordances.
  const teacherCanEditTopics = false;
  const sectionCurriculumTrack = (section as { curriculum_track?: string }).curriculum_track ?? 'singapore_inspired';
  const [items, responseMap, commentMap, copyFromOptions, sowCheck] = selectedSubjectId
    ? await Promise.all([
        listChecklistItems(selectedTerm.id, selectedSubjectId, level?.id ?? '', sectionCurriculumTrack),
        getResponsesBySectionTerm(sectionId, selectedTerm.id),
        getSubjectCommentsBySectionTerm(sectionId, selectedTerm.id, selectedSubjectId),
        Promise.resolve([] as Awaited<ReturnType<typeof getSectionsTeacherCanCopyFrom>>),
        sowExistsForSection(sectionId, selectedSubjectId, selectedTerm.id),
      ])
    : [[], new Map(), new Map(), [] as Awaited<ReturnType<typeof getSectionsTeacherCanCopyFrom>>, { exists: false, version: null }];
  const sowVersionNumber = (sowCheck as { exists: boolean; version: { version_number: number } | null }).version?.version_number ?? null;

  const responsesForClient = new Map<string, number | null>();
  for (const [k, row] of responseMap.entries()) {
    responsesForClient.set(k, row.rating);
  }
  const commentsForClient = new Map<string, string>();
  for (const [studentId, row] of commentMap.entries()) {
    commentsForClient.set(studentId, row.comment ?? "");
  }

  // PTC feedback is registrar+ only; teachers don't see the tab.
  const canAccessPtc =
    sessionUser.role === "registrar" || sessionUser.role === "school_admin" || sessionUser.role === "superadmin";
  const ptcMap = canAccessPtc ? await getPtcFeedbackBySectionTerm(sectionId, selectedTerm.id) : new Map();
  const ptcForClient = new Map<string, string>();
  for (const [studentId, row] of ptcMap.entries()) {
    ptcForClient.set(studentId, row.feedback ?? "");
  }

  const initialTab =
    sp.tab === "checklists" && canAccessChecklists
      ? "checklists"
      : sp.tab === "ptc" && canAccessPtc
        ? "ptc"
        : canAccessWriteups
          ? "writeups"
          : canAccessChecklists
            ? "checklists"
            : "ptc";

  return (
    <PageShell>
      <Link
        href={`/evaluation/sections?term_id=${selectedTerm.id}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Sections
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Evaluation · Write-ups
          </p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
              {section.name}
            </h1>
            {level && (
              <Badge
                variant="outline"
                className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                {level.label}
              </Badge>
            )}
            {ay && (
              <Badge
                variant="outline"
                className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
                {ay.ay_code}
              </Badge>
            )}
          </div>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {submittedCount} of {totalCount} write-ups submitted. Autosaves per keystroke; Submit stamps a write-up as
            finalised (edits stay possible).
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Term
          </span>
          <TermSwitcher current={defaultTermId} options={terms} />
        </div>
      </header>

      {/* Virtue theme banner */}
      {config?.virtueTheme ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Sparkle className="size-4 text-primary" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Virtue theme · {selectedTerm.label}
            </span>
          </div>
          <p className="mt-1 font-serif text-lg font-semibold tracking-tight text-foreground">{config.virtueTheme}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Write about each student through the lens of this theme. Appears as &ldquo;Form Class Adviser&rsquo;s
            Comments (HFSE Virtues: {config.virtueTheme})&rdquo; on the {selectedTerm.label} report card.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-medium">Virtue theme not set for {selectedTerm.label}.</p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-200/80">
            {sessionUser.role === "teacher" ? (
              <>Write-up fields are locked until Joann sets the theme in SIS Admin.</>
            ) : (
              <>
                Set it in{" "}
                <Link href="/sis/ay-setup" className="font-medium underline underline-offset-2">
                  SIS Admin → AY Setup → Dates
                </Link>
                . Editing stays possible for registrar+ in the meantime.
              </>
            )}
          </p>
        </div>
      )}

      {/* Tentative PTC info pill — fires when a date is pencilled in but
          not yet confirmed by the registrar. Calm tone, informational
          only; never escalates. Replaced by the urgent banner below once
          the registrar flips tentative=false. */}
      {ptcTentativeNote && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {selectedTerm.label} PTC is pencilled in for{" "}
            <span className="font-medium text-foreground">
              {formatPtcRangeForBanner(ptcForTerm!.startDate, ptcForTerm!.endDate)}
            </span>
            {" "}
            <span className="italic">(tentative — date not yet confirmed by the registrar)</span>
          </span>
        </div>
      )}

      {/* PTC awareness banner — fires when the term's discussion meeting is
          within 30 days (urgent), or past with writeups still unsubmitted
          (overdue). Hidden otherwise so the page stays calm in normal
          conditions. PTC date comes from the school calendar (KD #76);
          audience-scoped so primary sections don't see secondary-only
          events as their deadline and vice versa. Skipped when the PTC is
          marked tentative — the info pill above covers that case. */}
      {(ptcUrgent || ptcOverdue) && ptcForTerm && (
        <div
          className={
            ptcOverdue
              ? "rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              : ptcDays != null && ptcDays <= 3
                ? "rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
                : "rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100"
          }
        >
          <div className="flex items-start gap-3">
            <div
              className={
                ptcOverdue || (ptcDays != null && ptcDays <= 3)
                  ? "flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-destructive to-rose-700 text-white shadow-brand-tile-destructive"
                  : "flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-amber to-amber-600 text-white shadow-brand-tile-amber"
              }
            >
              {ptcOverdue ? <AlertTriangle className="size-4" /> : <CalendarClock className="size-4" />}
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {ptcOverdue
                  ? `${selectedTerm.label} PTC was ${formatPtcRangeForBanner(ptcForTerm.startDate, ptcForTerm.endDate)} — ${pendingWriteups} writeup${pendingWriteups === 1 ? "" : "s"} still unsubmitted`
                  : ptcDays === 0
                    ? `${selectedTerm.label} PTC is today (${formatPtcRangeForBanner(ptcForTerm.startDate, ptcForTerm.endDate)})`
                    : ptcDays === 1
                      ? `${selectedTerm.label} PTC is tomorrow (${formatPtcRangeForBanner(ptcForTerm.startDate, ptcForTerm.endDate)})`
                      : `${selectedTerm.label} PTC is in ${ptcDays} days (${formatPtcRangeForBanner(ptcForTerm.startDate, ptcForTerm.endDate)})`}
              </p>
              <p className="text-xs text-muted-foreground">
                {pendingWriteups === 0
                  ? "All writeups submitted — parents will see the finalised report card."
                  : `Parents will review this term's report card at the meeting. ${pendingWriteups} writeup${pendingWriteups === 1 ? " is" : "s are"} still pending.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue={initialTab}>
        <TabsList>
          {canAccessWriteups && (
            <TabsTrigger value="writeups">
              <SquarePen className="h-3.5 w-3.5" />
              Write-ups
              <span className="ml-1 font-mono text-[10px]">
                {submittedCount}/{totalCount}
              </span>
            </TabsTrigger>
          )}
          {canAccessChecklists && (
            <TabsTrigger value="checklists">
              <ClipboardList className="h-3.5 w-3.5" />
              Checklists
            </TabsTrigger>
          )}
          {canAccessPtc && (
            <TabsTrigger value="ptc">
              <MessageCircle className="h-3.5 w-3.5" />
              PTC
            </TabsTrigger>
          )}
        </TabsList>

        {canAccessWriteups && (
          <TabsContent value="writeups" className="mt-4">
            <WriteupRosterClient termId={selectedTerm.id} sectionId={section.id} roster={roster} canEdit={canEdit} />
          </TabsContent>
        )}

        {canAccessChecklists && (
          <TabsContent value="checklists" className="mt-4">
            {visibleSubjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No subjects enabled for this level × AY. Configure via{" "}
                <span className="whitespace-nowrap font-mono text-[11px]">SIS Admin → Subject Weights</span>.
              </div>
            ) : (
              <ChecklistRosterClient
                termId={selectedTerm.id}
                sectionId={section.id}
                subjects={visibleSubjects}
                initialSubjectId={selectedSubjectId}
                items={items.map((i) => ({
                  id: i.id,
                  item_text: i.item_text,
                  sort_order: i.sort_order,
                }))}
                roster={roster.map((r) => ({
                  section_student_id: r.section_student_id,
                  student_id: r.student_id,
                  index_number: r.index_number,
                  student_number: r.student_number,
                  student_name: r.student_name,
                }))}
                initialResponses={responsesForClient}
                initialComments={commentsForClient}
                canEdit={canEdit}
                canEditTopics={teacherCanEditTopics}
                copyFromOptions={copyFromOptions}
                sowVersionNumber={sowVersionNumber}
              />
            )}
          </TabsContent>
        )}

        {canAccessPtc && (
          <TabsContent value="ptc" className="mt-4">
            <PtcRosterClient
              termId={selectedTerm.id}
              sectionId={section.id}
              roster={roster.map((r) => ({
                student_id: r.student_id,
                index_number: r.index_number,
                student_number: r.student_number,
                student_name: r.student_name,
              }))}
              initialFeedback={ptcForClient}
            />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}

// Inline PTC date-range formatter for the banner copy. "8 Apr" for a
// single day, "8–9 Apr" for same-month, "29 Apr – 2 May" for cross-month.
// Mirrors the recipe in the registrar dashboard so both surfaces read the
// same way to parents-of-staff who toggle between them.
function formatPtcRangeForBanner(startIso: string, endIso: string): string {
  try {
    const start = new Date(`${startIso}T00:00:00+08:00`);
    const end = new Date(`${endIso}T00:00:00+08:00`);
    if (startIso === endIso) {
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
