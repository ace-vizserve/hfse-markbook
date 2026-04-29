import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  GraduationCap,
  Heart,
  Lock,
  ShieldCheck,
  Sparkles,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react';

import { EditStageDialog } from '@/components/sis/edit-stage-dialog';
import { FieldGrid, type Field } from '@/components/sis/field-grid';
import { StageStatusBadge } from '@/components/sis/status-badge';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ENROLLED_PREREQ_STAGES,
  STAGE_COLUMN_MAP,
  STAGE_LABELS,
  STAGE_TERMINAL_STATUS,
  type StageKey,
} from '@/lib/schemas/sis';
import { isFieldEmpty } from '@/lib/sis/field-helpers';
import type { ApplicationRow, StatusRow } from '@/lib/sis/queries';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentTab — pipeline + decision gate + phase cards + medical/billing.
//
// Top-level shape (post-redesign):
//   1. Pipeline header — 9-stage horizontal indicator with "next action"
//      summary + progress bar. Click a step to scroll to its phase card.
//   2. Decision gate — state-aware tile + hero block (mint = enrolled,
//      amber = conditional, indigo = ready, muted = blocked,
//      destructive = cancelled / withdrawn).
//   3. Phase 1 · Intake — Registration, Documents, Assessment.
//   4. Phase 2 · Commitments — Contract, Fees.
//   5. Phase 3 · Start — Class, Supplies, Orientation (post-enrollment).
//   6. Medical + Billing — 2-col side cards.
//
// Behaviour preserved exactly:
//   - Enrolled-prereq gate is server-side; UI shows blockers as advisory.
//   - Documents-stage Verified/Finished gate (KD #60) — handled by
//     EditStageDialog's existing 422 branch.
//   - All EditStageDialog wiring is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  status: StatusRow | null;
  app: ApplicationRow;
  ayCode: string;
  enroleeNumber: string;
  statusFetchError: boolean;
};

type StepStage = {
  key: StageKey;
  label: string;
  status: string | null;
  remarks: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  extras?: Field[];
  extrasInitial: Record<string, string | null>;
};

type LockState = 'done' | 'cancelled' | 'unlocked';

type DecisionState =
  | 'enrolled'
  | 'enrolledConditional'
  | 'ready'
  | 'blocked'
  | 'cancelled'
  | 'withdrawn';

const DECISION_TILE: Record<
  DecisionState,
  { gradient: string; bandTint: string; bandBorder: string; icon: LucideIcon }
> = {
  enrolled: {
    gradient: 'from-brand-mint to-brand-sky',
    bandTint: 'bg-brand-mint/10',
    bandBorder: 'border-brand-mint/30',
    icon: CheckCircle2,
  },
  enrolledConditional: {
    gradient: 'from-brand-amber to-brand-amber/80',
    bandTint: 'bg-brand-amber/10',
    bandBorder: 'border-brand-amber/40',
    icon: ShieldCheck,
  },
  ready: {
    gradient: 'from-brand-indigo to-brand-navy',
    bandTint: 'bg-brand-indigo/10',
    bandBorder: 'border-brand-indigo/30',
    icon: ArrowRight,
  },
  blocked: {
    gradient: 'from-ink-4 to-ink-3',
    bandTint: 'bg-muted/40',
    bandBorder: 'border-hairline',
    icon: Lock,
  },
  cancelled: {
    gradient: 'from-destructive to-destructive/80',
    bandTint: 'bg-destructive/10',
    bandBorder: 'border-destructive/30',
    icon: X,
  },
  withdrawn: {
    gradient: 'from-destructive to-destructive/80',
    bandTint: 'bg-destructive/10',
    bandBorder: 'border-destructive/30',
    icon: X,
  },
};

// ─── helpers ────────────────────────────────────────────────────────────────

function stageCompleted(status: string | null): boolean {
  return !!status && /^(finished|valid|signed|paid|claimed)$/i.test(status.trim());
}

function stagePending(status: string | null): boolean {
  return !!status && /^(pending|incomplete|unpaid)$/i.test(status.trim());
}

function stageRejected(status: string | null): boolean {
  return !!status && /^(rejected|expired)$/i.test(status.trim());
}

function stageMarkerElement(
  status: string | null,
  className = 'size-4',
): React.ReactElement | null {
  const v = (status ?? '').trim();
  if (stageCompleted(v)) return <Check className={className} />;
  if (stageRejected(v)) return <X className={className} />;
  if (stagePending(v)) return <Clock className={className} />;
  if (v && /invoic|upload|sent|generated|ongoing/i.test(v)) return <Circle className={className} />;
  return null;
}

function stageTone(status: string | null): { border: string; bg: string; text: string } {
  const v = (status ?? '').trim();
  if (stageCompleted(v))
    return {
      border: 'border-brand-mint',
      bg: 'bg-brand-mint/20',
      text: 'text-brand-indigo-deep',
    };
  if (stageRejected(v))
    return {
      border: 'border-destructive/50',
      bg: 'bg-destructive/10',
      text: 'text-destructive',
    };
  if (stagePending(v))
    return {
      border: 'border-brand-amber/60',
      bg: 'bg-brand-amber-light/40',
      text: 'text-brand-amber',
    };
  if (v && /invoic|upload|sent|generated|ongoing/i.test(v))
    return {
      border: 'border-brand-indigo/40',
      bg: 'bg-accent',
      text: 'text-brand-indigo-deep',
    };
  return { border: 'border-border', bg: 'bg-muted/40', text: 'text-muted-foreground' };
}

function stripeForPrereqLock(lock: LockState, isActive: boolean, hasStatus: boolean): string {
  if (lock === 'done') return 'bg-brand-mint';
  if (lock === 'cancelled') return 'bg-destructive/70';
  if (isActive) return 'bg-brand-indigo';
  if (hasStatus) return 'bg-brand-amber';
  return 'bg-border';
}

function stripeForPostStage(stage: StepStage): string {
  if (stageCompleted(stage.status)) return 'bg-brand-mint';
  if (stageRejected(stage.status) || stage.status === 'Cancelled') return 'bg-destructive/70';
  if (stagePending(stage.status)) return 'bg-brand-amber';
  if (stage.status) return 'bg-brand-indigo';
  return 'bg-border';
}

// ─── main component ─────────────────────────────────────────────────────────

export function EnrollmentTab({ status, app, ayCode, enroleeNumber, statusFetchError }: Props) {
  // `status` may be null either because the row is legitimately missing OR
  // because the status fetch errored (typically duplicate rows). The amber
  // alert below signals the latter; the timeline still renders.
  const s = status ?? ({} as StatusRow);

  const stages: StepStage[] = [
    {
      key: 'application',
      label: 'Application',
      status: s.applicationStatus,
      remarks: s.applicationRemarks,
      updatedAt: s.applicationUpdatedDate,
      updatedBy: s.applicationUpdatedBy,
      extras: [
        { label: 'Enrolment date', value: s.enrolmentDate, asDate: true },
        { label: 'Enrolee type', value: s.enroleeType },
      ],
      extrasInitial: {},
    },
    {
      key: 'registration',
      label: 'Registration',
      status: s.registrationStatus,
      remarks: s.registrationRemarks,
      updatedAt: s.registrationUpdatedDate,
      updatedBy: s.registrationUpdatedBy,
      extras: [
        { label: 'Invoice', value: s.registrationInvoice },
        { label: 'Payment date', value: s.registrationPaymentDate, asDate: true },
      ],
      extrasInitial: {
        invoice: s.registrationInvoice,
        paymentDate: s.registrationPaymentDate,
      },
    },
    {
      key: 'documents',
      label: 'Documents',
      status: s.documentStatus,
      remarks: s.documentRemarks,
      updatedAt: s.documentUpdatedDate,
      updatedBy: s.documentUpdatedBy,
      extrasInitial: {},
    },
    {
      key: 'assessment',
      label: 'Assessment',
      status: s.assessmentStatus,
      remarks: s.assessmentRemarks,
      updatedAt: s.assessmentUpdatedDate,
      updatedBy: s.assessmentUpdatedBy,
      extras: [
        { label: 'Schedule', value: s.assessmentSchedule, asDate: true },
        { label: 'Math', value: s.assessmentGradeMath as string | number | null },
        { label: 'English', value: s.assessmentGradeEnglish as string | number | null },
        { label: 'Medical', value: s.assessmentMedical },
      ],
      extrasInitial: {
        schedule: s.assessmentSchedule,
        math: s.assessmentGradeMath != null ? String(s.assessmentGradeMath) : null,
        english: s.assessmentGradeEnglish != null ? String(s.assessmentGradeEnglish) : null,
        medical: s.assessmentMedical,
      },
    },
    {
      key: 'contract',
      label: 'Contract',
      status: s.contractStatus,
      remarks: s.contractRemarks,
      updatedAt: s.contractUpdatedDate,
      updatedBy: s.contractUpdatedBy,
      extrasInitial: {},
    },
    {
      key: 'fees',
      label: 'Fees',
      status: s.feeStatus,
      remarks: s.feeRemarks,
      updatedAt: s.feeUpdatedDate,
      updatedBy: s.feeUpdatedBy,
      extras: [
        { label: 'Invoice', value: s.feeInvoice },
        { label: 'Payment date', value: s.feePaymentDate, asDate: true },
        { label: 'Start date', value: s.feeStartDate, asDate: true },
      ],
      extrasInitial: {
        invoice: s.feeInvoice,
        paymentDate: s.feePaymentDate,
        startDate: s.feeStartDate,
      },
    },
    {
      key: 'class',
      label: 'Class assignment',
      status: s.classStatus,
      remarks: s.classRemarks,
      updatedAt: s.classUpdatedDate,
      updatedBy: s.classUpdatedBy,
      extras: [
        { label: 'Class AY', value: s.classAY },
        { label: 'Level', value: s.classLevel },
        { label: 'Section', value: s.classSection },
      ],
      extrasInitial: {
        classAY: s.classAY,
        classLevel: s.classLevel,
        classSection: s.classSection,
      },
    },
    {
      key: 'supplies',
      label: 'Supplies',
      status: s.suppliesStatus,
      remarks: s.suppliesRemarks,
      updatedAt: s.suppliesUpdatedDate,
      updatedBy: s.suppliesUpdatedBy,
      extras: [{ label: 'Claimed date', value: s.suppliesClaimedDate, asDate: true }],
      extrasInitial: { claimedDate: s.suppliesClaimedDate },
    },
    {
      key: 'orientation',
      label: 'Orientation',
      status: s.orientationStatus,
      remarks: s.orientationRemarks,
      updatedAt: s.orientationUpdatedDate,
      updatedBy: s.orientationUpdatedBy,
      extras: [{ label: 'Schedule', value: s.orientationScheduleDate, asDate: true }],
      extrasInitial: { scheduleDate: s.orientationScheduleDate },
    },
  ];

  const stageByKey = new Map(stages.map((st) => [st.key, st]));
  const prereqSequence: StageKey[] = [...ENROLLED_PREREQ_STAGES];
  const applicationStage = stageByKey.get('application')!;
  const prereqStatusesForApplication: Partial<Record<StageKey, string | null>> = {};
  for (const k of ENROLLED_PREREQ_STAGES) {
    prereqStatusesForApplication[k] = stageByKey.get(k)?.status ?? null;
  }
  const postList = (['class', 'supplies', 'orientation'] as StageKey[]).map(
    (k) => stageByKey.get(k)!,
  );

  const intakeKeys: StageKey[] = ['registration', 'documents', 'assessment'];
  const commitmentsKeys: StageKey[] = ['contract', 'fees'];
  const intakeList = intakeKeys.map((k) => stageByKey.get(k)!);
  const commitmentsList = commitmentsKeys.map((k) => stageByKey.get(k)!);

  function lockFor(key: StageKey): LockState {
    const cur = (s as Record<string, string | null>)[STAGE_COLUMN_MAP[key].statusCol] ?? null;
    if (cur === 'Cancelled') return 'cancelled';
    const terminal = STAGE_TERMINAL_STATUS[key];
    if (terminal && cur === terminal) return 'done';
    return 'unlocked';
  }
  const prereqLocks = prereqSequence.map((k) => lockFor(k));
  const activeIndex = prereqLocks.findIndex((l) => l === 'unlocked');
  const prereqDoneCount = prereqLocks.filter((l) => l === 'done').length;
  const prereqPct = Math.round((prereqDoneCount / prereqSequence.length) * 100);
  const allPrereqsDone = prereqDoneCount === prereqSequence.length;

  const applicationStatusValue = s.applicationStatus ?? null;
  const isEnrolled =
    applicationStatusValue === 'Enrolled' || applicationStatusValue === 'Enrolled (Conditional)';

  const decisionState: DecisionState =
    applicationStatusValue === 'Enrolled'
      ? 'enrolled'
      : applicationStatusValue === 'Enrolled (Conditional)'
        ? 'enrolledConditional'
        : applicationStatusValue === 'Cancelled'
          ? 'cancelled'
          : applicationStatusValue === 'Withdrawn'
            ? 'withdrawn'
            : allPrereqsDone
              ? 'ready'
              : 'blocked';

  const blockers = prereqSequence
    .map((k, i) => ({ key: k, lock: prereqLocks[i] }))
    .filter((b) => b.lock !== 'done' && b.lock !== 'cancelled');
  const nextActionKey = activeIndex >= 0 ? prereqSequence[activeIndex] : null;

  return (
    <div className="space-y-5">
      {statusFetchError && (
        <div className="flex items-start gap-3 rounded-xl border border-brand-amber/40 bg-brand-amber-light/40 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <div className="space-y-1 text-xs leading-relaxed">
            <p className="font-medium text-foreground">Status row lookup returned an error.</p>
            <p className="text-muted-foreground">
              This usually means multiple rows exist in{' '}
              <code className="font-mono">{ayCode.toLowerCase()}_enrolment_status</code> for this
              enrolee — the schema allows duplicates. The timeline below may not reflect reality;
              contact an engineer to dedupe before using this pipeline.
            </p>
          </div>
        </div>
      )}

      {/* Pipeline header — 9-stage horizontal indicator */}
      <PipelineHeader
        stages={stages}
        prereqSequence={prereqSequence}
        prereqLocks={prereqLocks}
        activeIndex={activeIndex}
        prereqDoneCount={prereqDoneCount}
        prereqPct={prereqPct}
        allPrereqsDone={allPrereqsDone}
        nextActionKey={nextActionKey}
      />

      {/* Decision gate — state-aware tile + hero block */}
      <DecisionGate
        decisionState={decisionState}
        applicationStage={applicationStage}
        prereqStatusesForApplication={prereqStatusesForApplication}
        blockers={blockers}
        nextActionKey={nextActionKey}
        s={s}
        ayCode={ayCode}
        enroleeNumber={enroleeNumber}
      />

      {/* Phase 1 — Intake */}
      <PhaseStepCard
        eyebrow="Phase 1 · Intake"
        title="Qualification"
        subtitle="Registration, documents & assessment — verifying the applicant."
        icon={ClipboardList}
        stages={intakeList}
        stageIndices={intakeKeys.map((k) => prereqSequence.indexOf(k))}
        prereqLocks={prereqLocks}
        activeIndex={activeIndex}
        progressLabel={`${prereqDoneCount} of ${prereqSequence.length} prereqs`}
        progressPct={prereqPct}
        allPrereqsDone={allPrereqsDone}
        ayCode={ayCode}
        enroleeNumber={enroleeNumber}
      />

      {/* Phase 2 — Commitments */}
      <PhaseStepCard
        eyebrow="Phase 2 · Commitments"
        title="Contract & payment"
        subtitle="Binding decisions — sign the contract and clear fees."
        icon={ShieldCheck}
        stages={commitmentsList}
        stageIndices={commitmentsKeys.map((k) => prereqSequence.indexOf(k))}
        prereqLocks={prereqLocks}
        activeIndex={activeIndex}
        ayCode={ayCode}
        enroleeNumber={enroleeNumber}
      />

      {/* Phase 3 — Start */}
      <Card
        id="phase-start"
        className={cn('scroll-mt-20 gap-0 overflow-hidden p-0', !isEnrolled && 'opacity-60')}
      >
        <CardHeader className="border-b border-border px-5 py-4">
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Phase 3 · Start
          </CardDescription>
          <CardTitle className="flex flex-wrap items-baseline gap-2 font-serif text-[18px] font-semibold tracking-tight text-foreground">
            Class, supplies &amp; orientation
            {isEnrolled ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="muted">Activates after Enrolled</Badge>
            )}
          </CardTitle>
          <CardAction>
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <GraduationCap className="size-5" />
            </div>
          </CardAction>
        </CardHeader>
        <ol className="divide-y divide-border">
          {postList.map((stage) => (
            <PostStepRow
              key={stage.key}
              stage={stage}
              isClassStage={stage.key === 'class'}
              isEnrolled={isEnrolled}
              ayCode={ayCode}
              enroleeNumber={enroleeNumber}
            />
          ))}
        </ol>
      </Card>

      {/* Medical + Billing */}
      <div className="grid gap-4 md:grid-cols-2">
        <MedicalCard app={app} />
        <BillingCard app={app} />
      </div>
    </div>
  );
}

// ─── pipeline header ────────────────────────────────────────────────────────

function PipelineHeader({
  stages,
  prereqSequence,
  prereqLocks,
  activeIndex,
  prereqDoneCount,
  prereqPct,
  allPrereqsDone,
  nextActionKey,
}: {
  stages: StepStage[];
  prereqSequence: StageKey[];
  prereqLocks: LockState[];
  activeIndex: number;
  prereqDoneCount: number;
  prereqPct: number;
  allPrereqsDone: boolean;
  nextActionKey: StageKey | null;
}) {
  // Map a stage to its scroll target — application + prereqs go to their
  // phase card (Intake / Commitments). Class/Supplies/Orientation go to
  // the Start phase card.
  function scrollTargetFor(key: StageKey): string {
    if (key === 'class' || key === 'supplies' || key === 'orientation') return '#phase-start';
    if (key === 'contract' || key === 'fees') return '#phase-commitments';
    return '#phase-intake';
  }

  return (
    <Card className="@container/pipeline gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Pipeline · 9 stages
        </CardDescription>
        <CardTitle className="font-serif text-[18px] font-semibold tracking-tight text-foreground">
          Enrollment progress
        </CardTitle>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <ClipboardList className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-4">
        <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
          {stages.map((stage, idx) => {
            const inPrereq = prereqSequence.includes(stage.key);
            const prereqIdx = inPrereq ? prereqSequence.indexOf(stage.key) : -1;
            const prereqLock = inPrereq ? prereqLocks[prereqIdx] : null;
            const isActive = inPrereq && prereqIdx === activeIndex;
            const isLast = idx === stages.length - 1;
            return (
              <li key={stage.key} className="flex shrink-0 items-start">
                <a
                  href={scrollTargetFor(stage.key)}
                  className="group flex flex-col items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/40"
                  title={`${stage.label} · ${stage.status ?? '—'}`}
                >
                  <PrereqMarker
                    index={idx + 1}
                    lock={prereqLock}
                    status={stage.status}
                    isActive={isActive}
                  />
                  <div className="flex max-w-[88px] flex-col items-center text-center">
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Step {idx + 1}
                    </span>
                    <span className="font-serif text-[11px] font-semibold leading-tight tracking-tight text-foreground">
                      {stage.label}
                    </span>
                  </div>
                </a>
                {!isLast && (
                  <div
                    aria-hidden="true"
                    className={cn(
                      'mt-4 h-0.5 w-3 shrink-0 sm:w-5',
                      prereqLock === 'done' ? 'bg-brand-mint' : 'bg-border',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-2 border-t border-hairline pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-2">
            {nextActionKey ? (
              <>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active prereq
                </span>
                <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
                  {STAGE_LABELS[nextActionKey]}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  → mark as {STAGE_TERMINAL_STATUS[nextActionKey]}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-mint">
                All prereqs complete
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {prereqDoneCount} of {prereqSequence.length} prereqs
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full transition-all',
                  allPrereqsDone
                    ? 'bg-gradient-to-r from-brand-mint to-brand-mint/70'
                    : 'bg-gradient-to-r from-brand-indigo to-brand-indigo/70',
                )}
                style={{ width: `${prereqPct}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
              {prereqPct}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── decision gate ──────────────────────────────────────────────────────────

function DecisionGate({
  decisionState,
  applicationStage,
  prereqStatusesForApplication,
  blockers,
  nextActionKey,
  s,
  ayCode,
  enroleeNumber,
}: {
  decisionState: DecisionState;
  applicationStage: StepStage;
  prereqStatusesForApplication: Partial<Record<StageKey, string | null>>;
  blockers: Array<{ key: StageKey; lock: LockState }>;
  nextActionKey: StageKey | null;
  s: StatusRow;
  ayCode: string;
  enroleeNumber: string;
}) {
  const tile = DECISION_TILE[decisionState];
  const TileIcon = tile.icon;

  const titleByState: Record<DecisionState, string> = {
    enrolled: 'Enrolled',
    enrolledConditional: 'Enrolled (Conditional)',
    ready: 'Ready to enroll',
    blocked: `${blockers.length} prereq${blockers.length === 1 ? '' : 's'} remaining`,
    cancelled: 'Application cancelled',
    withdrawn: 'Application withdrawn',
  };

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className={cn('border-b px-5 py-4', tile.bandBorder)}>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Enrollment gate
        </CardDescription>
        <CardTitle className="font-serif text-[18px] font-semibold tracking-tight text-foreground">
          {titleByState[decisionState]}
        </CardTitle>
        <CardAction>
          <div
            className={cn(
              'flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand-tile',
              tile.gradient,
            )}
          >
            <TileIcon className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className={cn('space-y-4 px-5 py-4', tile.bandTint)}>
        {(decisionState === 'enrolled' || decisionState === 'enrolledConditional') && (
          <DecisionHero
            tileGradient={tile.gradient}
            icon={GraduationCap}
            eyebrow={
              s.classLevel && s.classSection
                ? 'Class assigned'
                : decisionState === 'enrolled'
                  ? 'Enrolled'
                  : 'Enrolled (Conditional)'
            }
            title={
              s.classLevel && s.classSection
                ? `${s.classLevel} · ${s.classSection}`
                : 'Class placement pending'
            }
            footer={
              applicationStage.updatedAt
                ? `${decisionState === 'enrolled' ? 'Enrolled' : 'Marked conditional'} ${formatDate(applicationStage.updatedAt)}${applicationStage.updatedBy ? ` by ${applicationStage.updatedBy}` : ''}`
                : null
            }
            cta={
              <EditStageDialog
                ayCode={ayCode}
                enroleeNumber={enroleeNumber}
                stageKey="application"
                initialStatus={applicationStage.status}
                initialRemarks={applicationStage.remarks}
                initialExtras={applicationStage.extrasInitial}
                prereqStatuses={prereqStatusesForApplication}
              />
            }
          />
        )}
        {decisionState === 'enrolledConditional' && (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Registrar override — the standard prereq gate was bypassed. Finish the remaining
            prereqs to drop the conditional tag.
          </p>
        )}

        {decisionState === 'ready' && (
          <DecisionHero
            tileGradient={tile.gradient}
            icon={Sparkles}
            eyebrow="All 5 prerequisites complete"
            title={
              <>
                Flip application status to{' '}
                <span className="text-brand-indigo-deep">Enrolled</span> — a class section will be
                auto-assigned.
              </>
            }
            cta={
              <EditStageDialog
                ayCode={ayCode}
                enroleeNumber={enroleeNumber}
                stageKey="application"
                initialStatus={applicationStage.status}
                initialRemarks={applicationStage.remarks}
                initialExtras={applicationStage.extrasInitial}
                prereqStatuses={prereqStatusesForApplication}
              />
            }
          />
        )}

        {decisionState === 'blocked' && (
          <>
            {nextActionKey && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-card p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                  <ArrowRight className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Next action
                  </p>
                  <p className="font-serif text-sm font-semibold leading-tight text-foreground">
                    {STAGE_LABELS[nextActionKey]}
                    <span className="ml-2 font-sans text-[11px] font-normal text-muted-foreground">
                      → mark as{' '}
                      <span className="font-medium text-foreground">
                        {STAGE_TERMINAL_STATUS[nextActionKey]}
                      </span>
                    </span>
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-3 rounded-xl border border-hairline bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {blockers.length} step{blockers.length === 1 ? '' : 's'} remaining
                </p>
                <EditStageDialog
                  ayCode={ayCode}
                  enroleeNumber={enroleeNumber}
                  stageKey="application"
                  initialStatus={applicationStage.status}
                  initialRemarks={applicationStage.remarks}
                  initialExtras={applicationStage.extrasInitial}
                  prereqStatuses={prereqStatusesForApplication}
                />
              </div>
              <ul className="space-y-1.5">
                {blockers.map((b) => {
                  const isNext = b.key === nextActionKey;
                  return (
                    <li key={b.key} className="flex items-center gap-2.5 text-sm">
                      <Circle
                        className={cn(
                          'size-3.5 shrink-0',
                          isNext ? 'text-brand-indigo' : 'text-muted-foreground',
                        )}
                      />
                      <span className="font-medium text-foreground">{STAGE_LABELS[b.key]}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        → needs {STAGE_TERMINAL_STATUS[b.key]}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Finish every prereq to unlock <strong className="text-foreground">Enrolled</strong>
                , or use <strong className="text-foreground">Enrolled (Conditional)</strong> as the
                registrar override.
              </p>
            </div>
          </>
        )}

        {(decisionState === 'cancelled' || decisionState === 'withdrawn') && (
          <DecisionHero
            tileGradient={tile.gradient}
            icon={X}
            eyebrow={`Application ${decisionState}`}
            title={null}
            footer={
              applicationStage.updatedAt
                ? `${formatDate(applicationStage.updatedAt)}${applicationStage.updatedBy ? ` by ${applicationStage.updatedBy}` : ''}`
                : null
            }
            cta={
              <EditStageDialog
                ayCode={ayCode}
                enroleeNumber={enroleeNumber}
                stageKey="application"
                initialStatus={applicationStage.status}
                initialRemarks={applicationStage.remarks}
                initialExtras={applicationStage.extrasInitial}
                prereqStatuses={prereqStatusesForApplication}
              />
            }
          />
        )}

        {applicationStage.extras && applicationStage.extras.some((e) => !isFieldEmpty(e)) && (
          <div className="rounded-lg border border-hairline bg-card px-3 py-2.5">
            <FieldGrid fields={applicationStage.extras} />
          </div>
        )}
        {applicationStage.remarks && (
          <p className="whitespace-pre-line rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
            {applicationStage.remarks}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionHero({
  tileGradient,
  icon: Icon,
  eyebrow,
  title,
  footer,
  cta,
}: {
  tileGradient: string;
  icon: LucideIcon;
  eyebrow: string;
  title: React.ReactNode;
  footer?: string | null;
  cta: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-card p-4">
      <div
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand-tile',
          tileGradient,
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        {title && (
          <p className="font-serif text-base font-semibold leading-snug text-foreground">{title}</p>
        )}
        {footer && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider tabular-nums text-muted-foreground">
            {footer}
          </p>
        )}
      </div>
      {cta}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── phase card ─────────────────────────────────────────────────────────────

function PhaseStepCard({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  stages,
  stageIndices,
  prereqLocks,
  activeIndex,
  progressLabel,
  progressPct,
  allPrereqsDone,
  ayCode,
  enroleeNumber,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  stages: StepStage[];
  stageIndices: number[];
  prereqLocks: LockState[];
  activeIndex: number;
  progressLabel?: string;
  progressPct?: number;
  allPrereqsDone?: boolean;
  ayCode: string;
  enroleeNumber: string;
}) {
  const phaseId = eyebrow.toLowerCase().includes('intake')
    ? 'phase-intake'
    : eyebrow.toLowerCase().includes('commitments')
      ? 'phase-commitments'
      : 'phase-card';

  return (
    <Card id={phaseId} className="scroll-mt-20 gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {eyebrow}
        </CardDescription>
        <CardTitle className="font-serif text-[18px] font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-3">
            {progressPct !== undefined && (
              <Badge variant={allPrereqsDone ? 'success' : 'muted'}>
                {progressPct}%
              </Badge>
            )}
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <Icon className="size-5" />
            </div>
          </div>
        </CardAction>
      </CardHeader>
      <div className="space-y-3 px-5 py-3">
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {progressLabel !== undefined && progressPct !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {progressLabel}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full transition-all',
                  allPrereqsDone
                    ? 'bg-gradient-to-r from-brand-mint to-brand-mint/70'
                    : 'bg-gradient-to-r from-brand-indigo to-brand-indigo/70',
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <ol className="divide-y divide-border border-t border-border">
        {stages.map((stage, localIdx) => {
          const globalIdx = stageIndices[localIdx];
          const lock = prereqLocks[globalIdx];
          const isActive = globalIdx === activeIndex;
          return (
            <StepRow
              key={stage.key}
              index={globalIdx + 1}
              lock={lock}
              isActive={isActive}
              stage={stage}
              ayCode={ayCode}
              enroleeNumber={enroleeNumber}
            />
          );
        })}
      </ol>
    </Card>
  );
}

// ─── prereq marker ──────────────────────────────────────────────────────────

function PrereqMarker({
  index,
  lock,
  status,
  isActive,
}: {
  index: number;
  lock: LockState | null;
  status: string | null;
  isActive: boolean;
}) {
  const base =
    'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background';
  if (lock === 'done') {
    return (
      <div className={cn(base, 'border-brand-mint bg-brand-mint/20 text-brand-indigo-deep')}>
        <Check className="size-4" />
      </div>
    );
  }
  if (lock === 'cancelled') {
    return (
      <div className={cn(base, 'border-destructive/50 bg-destructive/10 text-destructive')}>
        <X className="size-4" />
      </div>
    );
  }
  if (isActive) {
    return (
      <div
        className={cn(base, 'border-brand-indigo bg-brand-indigo text-white ring-4 ring-brand-indigo/20')}
      >
        <span className="font-mono text-[11px] font-semibold tabular-nums">{index}</span>
      </div>
    );
  }
  const tone = stageTone(status);
  const marker = stageMarkerElement(status, 'size-4');
  return (
    <div className={cn(base, tone.border, tone.bg, tone.text)}>
      {marker ?? <span className="font-mono text-[11px] font-semibold tabular-nums">{index}</span>}
    </div>
  );
}

// ─── extras chips ───────────────────────────────────────────────────────────

function ExtrasChips({ fields }: { fields: Field[] }) {
  const nonEmpty = fields.filter((f) => !isFieldEmpty(f));
  if (nonEmpty.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nonEmpty.map((f) => {
        const value =
          f.asDate && typeof f.value === 'string'
            ? new Date(f.value).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })
            : String(f.value ?? '—');
        return (
          <span
            key={f.label}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {f.label}
            </span>
            <span className="font-medium tabular-nums">{value}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─── step rows ──────────────────────────────────────────────────────────────

function StepRow({
  index,
  lock,
  isActive,
  stage,
  ayCode,
  enroleeNumber,
}: {
  index: number;
  lock: LockState;
  isActive: boolean;
  stage: StepStage;
  ayCode: string;
  enroleeNumber: string;
}) {
  const stripe = stripeForPrereqLock(lock, isActive, !!stage.status);
  return (
    <li
      className={cn(
        'group relative flex items-center gap-3 px-5 py-3 transition-colors',
        isActive && 'bg-brand-indigo/5',
        !isActive && 'hover:bg-muted/40',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', stripe)} />
      <PrereqMarker index={index} lock={lock} status={stage.status} isActive={isActive} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-sm font-semibold tracking-tight text-foreground">
            {stage.label}
          </h3>
          <StageStatusBadge status={stage.status} />
          {isActive && (
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3" />
              Next action
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {stage.updatedAt && (
            <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums">
              {new Date(stage.updatedAt).toLocaleDateString('en-SG', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              {stage.updatedBy && (
                <span className="ml-1.5 normal-case text-muted-foreground/80">
                  by {stage.updatedBy}
                </span>
              )}
            </span>
          )}
          {stage.extras && <ExtrasChips fields={stage.extras} />}
          {stage.remarks && <span className="line-clamp-1 max-w-md italic">&ldquo;{stage.remarks}&rdquo;</span>}
        </div>
      </div>
      <div
        className={cn(
          'shrink-0 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        <EditStageDialog
          ayCode={ayCode}
          enroleeNumber={enroleeNumber}
          stageKey={stage.key}
          initialStatus={stage.status}
          initialRemarks={stage.remarks}
          initialExtras={stage.extrasInitial}
        />
      </div>
    </li>
  );
}

function PostStepRow({
  stage,
  isClassStage,
  isEnrolled,
  ayCode,
  enroleeNumber,
}: {
  stage: StepStage;
  isClassStage: boolean;
  isEnrolled: boolean;
  ayCode: string;
  enroleeNumber: string;
}) {
  const stripe = stripeForPostStage(stage);
  const tone = stageTone(stage.status);
  const marker = stageMarkerElement(stage.status, 'size-4');
  return (
    <li className="group relative flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', stripe)} />
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
          tone.border,
          tone.bg,
          tone.text,
        )}
      >
        {marker ?? <Circle className="size-3" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-sm font-semibold tracking-tight text-foreground">
            {stage.label}
          </h3>
          <StageStatusBadge status={stage.status} />
          {isClassStage && !isEnrolled && (
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3" />
              Auto on Enrolled
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {stage.updatedAt && (
            <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums">
              {new Date(stage.updatedAt).toLocaleDateString('en-SG', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
              {stage.updatedBy && (
                <span className="ml-1.5 normal-case text-muted-foreground/80">
                  by {stage.updatedBy}
                </span>
              )}
            </span>
          )}
          {stage.extras && <ExtrasChips fields={stage.extras} />}
          {stage.remarks && <span className="line-clamp-1 max-w-md italic">&ldquo;{stage.remarks}&rdquo;</span>}
        </div>
      </div>
      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <EditStageDialog
          ayCode={ayCode}
          enroleeNumber={enroleeNumber}
          stageKey={stage.key}
          initialStatus={stage.status}
          initialRemarks={stage.remarks}
          initialExtras={stage.extrasInitial}
        />
      </div>
    </li>
  );
}

// ─── medical + billing ──────────────────────────────────────────────────────

const MEDICAL_FLAGS: Array<{ key: keyof ApplicationRow; label: string }> = [
  { key: 'allergies', label: 'Allergies' },
  { key: 'foodAllergies', label: 'Food allergies' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'heartConditions', label: 'Heart conditions' },
  { key: 'epilepsy', label: 'Epilepsy' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'eczema', label: 'Eczema' },
];

const MEDICAL_DETAILS: Array<{ key: keyof ApplicationRow; label: string }> = [
  { key: 'allergyDetails', label: 'Allergy details' },
  { key: 'foodAllergyDetails', label: 'Food allergy details' },
  { key: 'otherMedicalConditions', label: 'Other conditions' },
  { key: 'dietaryRestrictions', label: 'Dietary restrictions' },
];

function MedicalCard({ app }: { app: ApplicationRow }) {
  const raisedFlags = MEDICAL_FLAGS.filter((f) => app[f.key] === true);
  const detailEntries = MEDICAL_DETAILS.filter((f) => {
    const v = app[f.key] as string | null | undefined;
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
  const paracetamolConsent = app.paracetamolConsent;
  const hasAnyContent =
    raisedFlags.length > 0 || detailEntries.length > 0 || paracetamolConsent !== null;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Health profile
        </CardDescription>
        <CardTitle className="flex flex-wrap items-baseline gap-2 font-serif text-[18px] font-semibold tracking-tight text-foreground">
          Medical
          {raisedFlags.length > 0 && (
            <Badge variant="warning">
              {raisedFlags.length} flag{raisedFlags.length === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Heart className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4">
        {!hasAnyContent && (
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-brand-mint" />
            No medical conditions on file.
          </div>
        )}

        {raisedFlags.length > 0 && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Conditions declared
            </p>
            <div className="flex flex-wrap gap-1.5">
              {raisedFlags.map((f) => (
                <Badge key={String(f.key)} variant="warning" className="gap-1">
                  <AlertTriangle className="size-3" />
                  {f.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {detailEntries.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Details
            </p>
            <dl className="space-y-3">
              {detailEntries.map((f) => (
                <div key={String(f.key)}>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {String(app[f.key] ?? '')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {paracetamolConsent !== null && (
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs',
              paracetamolConsent
                ? 'border-brand-mint/50 bg-brand-mint/10'
                : 'border-hairline bg-muted/20',
            )}
          >
            {paracetamolConsent ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-brand-mint" />
            ) : (
              <X className="size-3.5 shrink-0 text-destructive" />
            )}
            <span className="text-foreground">
              Paracetamol consent:{' '}
              <span className="font-medium">{paracetamolConsent ? 'Granted' : 'Withheld'}</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillingCard({ app }: { app: ApplicationRow }) {
  const discountSlots = [
    { label: 'Discount 1', value: app.discount1 },
    { label: 'Discount 2', value: app.discount2 },
    { label: 'Discount 3', value: app.discount3 },
  ];
  const consents: Array<{ label: string; value: boolean | null }> = [
    { label: 'Social media consent', value: app.socialMediaConsent ?? null },
    { label: 'Feedback consent', value: app.feedbackConsent ?? null },
  ];
  const activeDiscounts = discountSlots.filter((d) => d.value && String(d.value).trim() !== '');

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Billing &amp; consents
        </CardDescription>
        <CardTitle className="flex flex-wrap items-baseline gap-2 font-serif text-[18px] font-semibold tracking-tight text-foreground">
          Discounts &amp; consents
          {activeDiscounts.length > 0 && (
            <Badge variant="default">
              {activeDiscounts.length} discount{activeDiscounts.length === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Tags className="size-5" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4">
        <div className="space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Discount slots
          </p>
          <ul className="space-y-1.5">
            {discountSlots.map((d) => {
              const filled = !!d.value && String(d.value).trim() !== '';
              return (
                <li
                  key={d.label}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs',
                    filled
                      ? 'border-brand-indigo/30 bg-brand-indigo/5'
                      : 'border-hairline bg-muted/20',
                  )}
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {d.label}
                  </span>
                  {filled ? (
                    <span className="font-mono font-medium tabular-nums text-brand-indigo-deep">
                      {String(d.value)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Empty</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Consents
          </p>
          <ul className="space-y-1.5">
            {consents.map((c) => {
              const Icon = c.value === true ? CheckCircle2 : c.value === false ? X : Circle;
              const iconClass =
                c.value === true
                  ? 'text-brand-mint'
                  : c.value === false
                    ? 'text-destructive'
                    : 'text-muted-foreground';
              const bgClass =
                c.value === true
                  ? 'border-brand-mint/40 bg-brand-mint/10'
                  : c.value === false
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-hairline bg-muted/20';
              const valueLabel =
                c.value === true ? 'Granted' : c.value === false ? 'Withheld' : 'Not answered';
              return (
                <li
                  key={c.label}
                  className={cn('flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs', bgClass)}
                >
                  <Icon className={cn('size-3.5 shrink-0', iconClass)} />
                  <span className="text-foreground">{c.label}</span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {valueLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
