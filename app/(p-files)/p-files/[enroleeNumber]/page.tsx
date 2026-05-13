import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  History as HistoryIcon,
  Mail,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { DocumentCard } from '@/components/p-files/document-card';
import { ActionQueueCard, type ActionQueueRow } from '@/components/p-files/action-queue-card';
import { FamilyContactCard } from '@/components/p-files/family-contact-card';
import { RecentActivityStrip } from '@/components/p-files/recent-activity-strip';
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { getCurrentAcademicYear, listAyCodes } from '@/lib/academic-year';
import { DOCUMENT_SLOTS, GROUP_LABELS, type DocumentGroup } from '@/lib/p-files/document-config';
import { getStudentDocumentDetail, isStudentEnrolled } from '@/lib/p-files/queries';
import { compareSlotsByUrgency, isActionable, classifyUrgency } from '@/lib/p-files/urgency';
import { freshenAyDocuments } from '@/lib/p-files/freshen-document-statuses';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const ACTION_QUEUE_VISIBLE = 5;

export default async function StudentDocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ enroleeNumber: string }>;
  searchParams: Promise<{ ay?: string }>;
}) {
  const { enroleeNumber } = await params;
  const { ay: ayParam } = await searchParams;
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (
    sessionUser.role !== 'p-file' &&
    sessionUser.role !== 'school_admin' &&
    sessionUser.role !== 'superadmin'
  ) {
    redirect('/');
  }

  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  if (!currentAy) notFound();

  const ayCodes = await listAyCodes(service);
  const selectedAy = ayParam && ayCodes.includes(ayParam) ? ayParam : currentAy.ay_code;

  // Auto-flip + the enrollment whitelist run in parallel — both are
  // gating the detail render and have no shared state. Cached 60s.
  // P-Files is enrolled-only (KD #31). Hide pre-enrolment applicants from
  // the detail surface entirely — they belong on /admissions during the
  // initial-chase phase. Strict whitelist (Enrolled / Enrolled (Conditional)
  // + classSection set) — admissions surfaces show the rest.
  const [, enrolled] = await Promise.all([
    freshenAyDocuments(selectedAy),
    isStudentEnrolled(selectedAy, enroleeNumber),
  ]);
  if (!enrolled) notFound();

  const student = await getStudentDocumentDetail(selectedAy, enroleeNumber);
  if (!student) notFound();

  const docRow = student.rawDocRow;
  const canWrite = sessionUser.role === 'p-file' || sessionUser.role === 'superadmin';

  const pct = student.total > 0 ? Math.round((student.complete / student.total) * 100) : 0;

  // Per-slot meta lookup so we don't repeat .find inside the render loops.
  const slotConfigByKey = new Map(DOCUMENT_SLOTS.map((s) => [s.key, s]));

  // Multi-status counts for the hero pill row. Only render the pill when
  // count > 0 — avoids painting a row of zero-state chips that don't help
  // the registrar triage.
  const promisedCount = student.slots.filter((s) => {
    const o = student.outreach[s.key];
    return o?.activePromise != null;
  }).length;
  const remindedCount = student.slots.filter((s) => {
    const o = student.outreach[s.key];
    if (!o?.lastReminderAt) return false;
    // This is a force-dynamic server component (cookies + searchParams);
    // calling Date.now() at render time is intentional — the page renders
    // fresh on every request, no client-side re-render to worry about.
    // eslint-disable-next-line react-hooks/purity
    const days = (Date.now() - new Date(o.lastReminderAt).getTime()) / 86_400_000;
    return days < 30;
  }).length;
  const rejectedCount = student.slots.filter((s) => s.status === 'rejected').length;

  // ── Action queue: top N actionable slots ranked by urgency.
  const actionableSlots = student.slots
    .filter((s) => isActionable(classifyUrgency(s)))
    .slice()
    .sort(compareSlotsByUrgency);
  const totalActionable = actionableSlots.length;
  const actionRows: ActionQueueRow[] = actionableSlots.slice(0, ACTION_QUEUE_VISIBLE).map((s) => {
    const config = slotConfigByKey.get(s.key);
    const url = (docRow[s.key] as string | null | undefined) ?? null;
    return {
      slotKey: s.key,
      slotLabel: s.label,
      status: s.status,
      expiryDate: s.expiryDate,
      url,
      meta: config?.meta ?? null,
      expires: config?.expires ?? false,
      lastReminderAt: student.outreach[s.key]?.lastReminderAt ?? null,
    };
  });

  // ── Document groups (existing layout) — slots within each group are
  //    re-sorted by urgency so the most pressing ones appear first.
  const groups: { group: DocumentGroup; label: string; slots: typeof student.slots }[] = [];
  const groupOrder: DocumentGroup[] = ['student-expiring', 'parent', 'student', 'stp'];
  for (const g of groupOrder) {
    const groupSlots = student.slots
      .filter((slot) => slotConfigByKey.get(slot.key)?.group === g)
      .slice()
      .sort(compareSlotsByUrgency);
    if (groupSlots.length > 0) {
      groups.push({ group: g, label: GROUP_LABELS[g], slots: groupSlots });
    }
  }

  return (
    <PageShell>
      {/* Top strip — back + eyebrow, full width */}
      <div className="space-y-2">
        <Link
          href={{ pathname: '/p-files', query: { ay: selectedAy } }}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All students · {selectedAy}
        </Link>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {canWrite ? 'P-Files · Student documents' : 'P-Files · Read-only oversight'}
        </p>
      </div>

      {/* Two-pane layout on lg+: sticky summary rail (name + pills + progress
          + action queue + family) on the left, scrolling document groups on
          the right. On smaller screens the rail collapses to a normal stacked
          section above the docs. Per skill §9 (nav-hierarchy) + §5
          (content-priority) — the always-relevant context stays in view
          while the doc list (large, repeated structure) scrolls beside it. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,360px)_1fr]">
        {/* ── Sticky summary rail ─────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {/* Identity */}
          <div className="space-y-2">
            <h1 className="font-serif text-[26px] font-semibold leading-[1.1] tracking-tight text-foreground">
              {student.fullName}.
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
              {student.studentNumber && (
                <>
                  <span className="font-mono tabular-nums">{student.studentNumber}</span>
                  <span className="text-hairline-strong">·</span>
                </>
              )}
              {student.level && (
                <>
                  <span>{student.level}</span>
                  <span className="text-hairline-strong">·</span>
                </>
              )}
              {student.section && (
                <>
                  <span>{student.section}</span>
                  <span className="text-hairline-strong">·</span>
                </>
              )}
              <span className="font-mono tabular-nums">{selectedAy}</span>
            </div>
          </div>

          {/* Status pill cluster — wraps tight in the narrow rail. Order
              matches operational priority: completion → blockers → pending
              chase. */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={pct === 100 ? 'success' : 'outline'}>
              <CheckCircle2 />
              {student.complete}/{student.total} · {pct}%
            </Badge>
            {student.expired > 0 && (
              <Badge variant="blocked">
                <ShieldAlert />
                {student.expired} expired
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge variant="blocked">
                <XCircle />
                {rejectedCount} rejected
              </Badge>
            )}
            {student.missing > 0 && (
              <Badge variant="outline" className="border-dashed text-muted-foreground">
                <FileWarning />
                {student.missing} missing
              </Badge>
            )}
            {promisedCount > 0 && (
              <Badge variant="default">
                <CalendarClock />
                {promisedCount} promised
              </Badge>
            )}
            {remindedCount > 0 && (
              <Badge variant="warning">
                <Mail />
                {remindedCount} reminded
              </Badge>
            )}
          </div>

          {/* Slim progress — replaces the heroic h-1.5 bar. The pill above
              already carries the percent number; the bar is just the
              spatial signal. */}
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${pct === 100 ? 'bg-brand-mint' : 'bg-primary'}`}
              style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
            />
          </div>

          <ActionQueueCard
            enroleeNumber={enroleeNumber}
            rows={actionRows}
            recipients={student.recipients}
            canWrite={canWrite}
            totalActionable={totalActionable}
          />

          <FamilyContactCard
            family={student.family}
            recipients={student.recipients}
            stpApplicationType={student.stpApplicationType}
          />
        </aside>

        {/* ── Right column — banners, activity, document groups ─────── */}
        <div className="space-y-6 min-w-0">
          {/* Surface a soft warning when the student is enrolled but has no
              class section assigned. Lives at the top of the right column
              so it's prominent the moment the page loads. */}
          {!student.section && (
            <Alert variant="warning">
              <AlertIcon variant="warning">
                <AlertTriangle className="size-4" />
              </AlertIcon>
              <AlertTitle>This student has no class section assigned.</AlertTitle>
              <AlertDescription>
                They&apos;re enrolled and their documents are tracked here, but
                they haven&apos;t been placed in a class yet. Assign a section
                from{' '}
                <Link
                  href={`/admissions/applications/${enroleeNumber}?ay=${selectedAy}&tab=enrollment`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  the enrolment record
                </Link>{' '}
                so they appear on rosters, attendance, and other class-scoped
                surfaces.
              </AlertDescription>
            </Alert>
          )}

          {student.recentEvents.length > 0 && (
            <RecentActivityStrip events={student.recentEvents} />
          )}

          {groups.map((g) => {
            const groupActionable = g.slots.filter((s) => isActionable(classifyUrgency(s))).length;
            const groupValid = g.slots.filter((s) => s.status === 'valid').length;
            return (
              <section key={g.group} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                    {g.label}
                  </h2>
                  <Badge variant="outline">
                    {groupValid}/{g.slots.length} valid
                  </Badge>
                  {groupActionable > 0 && (
                    <Badge variant="blocked">
                      {groupActionable} need{groupActionable === 1 ? 's' : ''} action
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {g.slots.map((slot) => {
                    const config = slotConfigByKey.get(slot.key);
                    const url = docRow[slot.key] as string | null | undefined;
                    const outreach = student.outreach[slot.key];
                    return (
                      <DocumentCard
                        key={slot.key}
                        enroleeNumber={enroleeNumber}
                        slotKey={slot.key}
                        label={slot.label}
                        status={slot.status}
                        url={url ?? null}
                        expiryDate={slot.expiryDate}
                        expires={config?.expires ?? false}
                        meta={config?.meta ?? null}
                        canWrite={canWrite}
                        recipients={student.recipients}
                        lastReminderAt={outreach?.lastReminderAt ?? null}
                        activePromise={outreach?.activePromise ?? null}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Trust strip — stays in the right column so the rail's overflow-y
              scroll doesn't strand it visually. */}
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <HistoryIcon className="size-3" strokeWidth={2.25} />
            <span>{selectedAy}</span>
            <span className="text-border">·</span>
            <span>{enroleeNumber}</span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
