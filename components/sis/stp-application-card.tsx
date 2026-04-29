import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileText,
  Globe2,
  Plane,
} from 'lucide-react';

import { ResidenceHistoryEditor } from '@/components/sis/residence-history-editor';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ApplicationRow, DocumentSlot } from '@/lib/sis/queries';
import { STP_CONDITIONAL_SLOT_KEYS } from '@/lib/sis/queries';
import { cn } from '@/lib/utils';

/**
 * StpApplicationCard — Singapore ICA Student Pass surface for foreign-student
 * applicants who opted into the STP sub-flow on the parent portal.
 *
 * Renders only when `application.stpApplicationType IS NOT NULL`. Composes
 * three sections:
 *   1. STP slot status strip — 3 status tiles for icaPhoto,
 *      financialSupportDocs, vaccinationInformation. Click to anchor-jump
 *      to the slot in the Documents tab via `#slot-{key}`.
 *   2. Residence history preview — list of parsed `residenceHistory`
 *      entries (country + cityOrTown + (fromYear → toYear) + purposeOfStay).
 *   3. Edit residence history button — opens a Dialog with a structured
 *      row editor for the 5-year history ICA expects.
 *
 * Visual language matches `components/sis/documents-viewer.tsx` — gradient
 * icon tiles per status bucket and shadcn Badge variants (success/warning/
 * blocked) so the STP card and the Documents tab below it scan with the
 * same color grammar.
 *
 * Spec: docs/context/21-stp-application.md
 */

type StatusBucket = 'valid' | 'pending' | 'rejected' | 'missing';

function statusBucket(status: string | null | undefined): StatusBucket {
  const v = (status ?? '').trim().toLowerCase();
  if (v === 'valid') return 'valid';
  if (v === 'rejected' || v === 'expired') return 'rejected';
  if (v === 'uploaded' || v === 'to follow') return 'pending';
  return 'missing';
}

const TILE_GRADIENT: Record<StatusBucket, string> = {
  valid: 'bg-gradient-to-br from-brand-mint to-brand-sky',
  pending: 'bg-gradient-to-br from-brand-amber to-brand-amber/80',
  rejected: 'bg-gradient-to-br from-destructive to-destructive/80',
  missing: 'bg-gradient-to-br from-ink-4 to-ink-3',
};

type GradientBadgeVariant = 'success' | 'warning' | 'blocked' | 'outline';
function badgeVariant(bucket: StatusBucket): GradientBadgeVariant {
  if (bucket === 'valid') return 'success';
  if (bucket === 'pending') return 'warning';
  if (bucket === 'rejected') return 'blocked';
  return 'outline';
}

const STP_SLOT_LABELS: Record<(typeof STP_CONDITIONAL_SLOT_KEYS)[number], string> = {
  icaPhoto: 'ICA Photo',
  financialSupportDocs: 'Financial Support',
  vaccinationInformation: 'Vaccination Records',
};

type ResidenceEntry = {
  country?: string | null;
  cityOrTown?: string | null;
  fromYear?: string | number | null;
  toYear?: string | number | null;
  purposeOfStay?: string | null;
};

function parseResidenceHistory(raw: unknown):
  | { ok: true; entries: ResidenceEntry[] }
  | { ok: false } {
  // The column is jsonb. Supabase returns parsed JSON, so it's typically
  // already an array — but we defensively handle string-encoded fallbacks too.
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false };
    }
  }
  if (!Array.isArray(value)) return { ok: false };
  const entries: ResidenceEntry[] = [];
  for (const e of value) {
    if (e && typeof e === 'object' && !Array.isArray(e)) {
      entries.push(e as ResidenceEntry);
    }
  }
  return { ok: true, entries };
}

function formatYearRange(
  from: ResidenceEntry['fromYear'],
  to: ResidenceEntry['toYear'],
): string {
  const fromStr = from === null || from === undefined || from === '' ? '?' : String(from);
  const toStr = to === null || to === undefined || to === '' ? '?' : String(to);
  return `${fromStr} → ${toStr}`;
}

export function StpApplicationCard({
  application,
  documents,
  ayCode,
}: {
  application: ApplicationRow;
  documents: DocumentSlot[];
  ayCode: string;
}) {
  // Gate — never render when the parent didn't opt into the STP flow.
  if (!application.stpApplicationType) return null;

  const docByKey = new Map(documents.map((d) => [d.key, d]));
  const stpDocs = STP_CONDITIONAL_SLOT_KEYS.map((key) => ({
    key,
    label: STP_SLOT_LABELS[key],
    doc: docByKey.get(key),
  }));

  const validatedCount = stpDocs.filter(({ doc }) => statusBucket(doc?.status) === 'valid').length;
  const parsed = parseResidenceHistory(application.residenceHistory);
  const residenceCount = parsed.ok ? parsed.entries.length : 0;

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* Header — gradient tile + serif title + STP application-type badge */}
      <CardHeader className="border-b border-border px-5 py-4">
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Singapore ICA · Student Pass
        </CardDescription>
        <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-foreground">
          Singapore Student Pass
        </CardTitle>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="default">{application.stpApplicationType}</Badge>
          <Badge variant={validatedCount === 3 ? 'success' : 'warning'}>
            {validatedCount} of 3 validated
          </Badge>
        </div>
        <CardAction>
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile [&>svg]:size-5">
            <Plane strokeWidth={2.25} />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-6 p-5">
        {/* Section 1 — STP slot status strip */}
        <section className="space-y-3">
          <SectionHeader
            icon={FileText}
            title="STP document slots"
            subtitle="Three ICA-required documents on top of the standard package. Click a tile to jump to the slot below."
          />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {stpDocs.map(({ key, label, doc }) => (
              <li key={key}>
                <StpSlotTile slotKey={key} label={label} status={doc?.status ?? null} />
              </li>
            ))}
          </ul>
        </section>

        {/* Section 2 — Residence history preview */}
        <section className="space-y-3">
          <SectionHeader
            icon={Globe2}
            title="Residence history"
            subtitle="ICA expects the past 5 years of residency to screen overstay risk and prior-country exposures."
            rightSlot={
              parsed.ok ? (
                <Badge variant={residenceCount > 0 ? 'default' : 'outline'}>
                  {residenceCount} {residenceCount === 1 ? 'entry' : 'entries'}
                </Badge>
              ) : (
                <Badge variant="blocked">Malformed</Badge>
              )
            }
          />

          {parsed.ok && parsed.entries.length > 0 ? (
            <ul className="space-y-1.5">
              {parsed.entries.map((entry, idx) => (
                <ResidenceRow key={idx} entry={entry} />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">
                {parsed.ok
                  ? 'Residence history not yet captured.'
                  : 'Residence history JSON is malformed.'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {parsed.ok
                  ? 'Use the editor below to add the past 5 years.'
                  : 'Open the editor below to repair or replace the value.'}
              </p>
            </div>
          )}

          {/* Section 3 — Edit residence history */}
          <div className="pt-1">
            <ResidenceHistoryEditor
              ayCode={ayCode}
              enroleeNumber={application.enroleeNumber}
              initialJson={application.residenceHistory ?? null}
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  rightSlot,
}: {
  icon: typeof Globe2;
  title: string;
  subtitle: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 border-b border-hairline pb-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground" />
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-indigo-deep">
            {title}
          </h3>
        </div>
        {rightSlot}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function StpSlotTile({
  slotKey,
  label,
  status,
}: {
  slotKey: string;
  label: string;
  status: string | null;
}) {
  const bucket = statusBucket(status);
  return (
    <a
      href={`#slot-${slotKey}`}
      className={cn(
        'group flex items-start gap-3 rounded-xl border border-hairline bg-card p-3 transition-all',
        'hover:-translate-y-0.5 hover:border-brand-indigo/30 hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/40',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-brand-tile transition-colors',
          TILE_GRADIENT[bucket],
        )}
      >
        {bucket === 'valid' && <CheckCircle2 className="size-4" />}
        {bucket === 'pending' && <FileText className="size-4" />}
        {bucket === 'rejected' && <AlertTriangle className="size-4" />}
        {bucket === 'missing' && <FileText className="size-4" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate font-serif text-sm font-semibold leading-tight tracking-tight text-foreground">
          {label}
        </p>
        {status ? (
          <Badge variant={badgeVariant(bucket)}>{status}</Badge>
        ) : (
          <Badge variant="outline">Missing</Badge>
        )}
      </div>
    </a>
  );
}

function ResidenceRow({ entry }: { entry: ResidenceEntry }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-hairline bg-card px-4 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
        <Globe2 className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-serif text-sm font-semibold leading-tight tracking-tight text-foreground">
            {entry.country ?? '(country?)'}
          </span>
          {entry.cityOrTown && (
            <span className="text-xs text-muted-foreground">{entry.cityOrTown}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <CalendarRange className="size-3" />
            {formatYearRange(entry.fromYear, entry.toYear)}
          </span>
          {entry.purposeOfStay && (
            <Badge variant="secondary">{entry.purposeOfStay}</Badge>
          )}
        </div>
      </div>
    </li>
  );
}

export default StpApplicationCard;
