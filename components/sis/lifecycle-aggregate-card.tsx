import { ChartLegendChip } from '@/components/dashboard/chart-legend-chip';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { LifecycleBlockerBucket } from '@/lib/sis/process';
import { LifecycleAggregateRow } from '@/components/sis/lifecycle-aggregate-row';

/**
 * LifecycleAggregateCard — top-level "What's blocking the funnel" card for
 * the SIS hub. Composes off `getLifecycleAggregate()`'s 7-bucket payload from
 * `lib/sis/process.ts`.
 *
 * Visual language follows `<InsightsPanel>`: editorial rows with size-10 §7.4
 * gradient icon tile on the left, serif label + small muted body in the middle,
 * large tabular-nums count + severity ChartLegendChip on the right. Severity
 * mapping mirrors InsightsPanel so the two cards read as siblings.
 *
 * Sort: `ungated-to-enroll` (positive signal) is pinned to the top, then
 * blockers descend bad → warn → info.
 */

// Sort order after the ungated-to-enroll pin. Ordered bad → warn → info,
// roughly "most urgent funnel blocker first".
const REMAINDER_ORDER: string[] = [
  'awaiting-document-revalidation',
  'missing-class-assignment',
  'awaiting-fee-payment',
  'awaiting-document-validation',
  'awaiting-promised-documents',
  'awaiting-stp-completion',
  'awaiting-contract-signature',
  'awaiting-assessment-schedule',
  'new-applications',
];

function sortBuckets(
  buckets: LifecycleBlockerBucket[]
): LifecycleBlockerBucket[] {
  const byKey = new Map(buckets.map((b) => [b.key, b] as const));
  const ordered: LifecycleBlockerBucket[] = [];
  const ungated = byKey.get('ungated-to-enroll');
  if (ungated) ordered.push(ungated);
  for (const key of REMAINDER_ORDER) {
    const b = byKey.get(key);
    if (b) ordered.push(b);
  }
  // Append any unrecognised keys at the end so additions don't drop silently.
  for (const b of buckets) {
    if (!ordered.includes(b)) ordered.push(b);
  }
  return ordered;
}

export function LifecycleAggregateCard({
  buckets,
  ayCode,
}: {
  buckets: LifecycleBlockerBucket[];
  ayCode?: string;
}) {
  const sorted = sortBuckets(buckets);
  const totalCount = sorted.reduce((acc, b) => acc + b.count, 0);
  const allClear = sorted.every((b) => b.count === 0);
  // Only render rows with at least one student — zero-count rows add noise.
  const visible = sorted.filter((b) => b.count > 0);

  // Group visible rows into three labelled sections.
  const actionRows = visible.filter(
    (b) => b.severity === 'bad' || b.severity === 'warn'
  );
  const infoRows = visible.filter((b) => b.severity === 'info');
  const goodRows = visible.filter((b) => b.severity === 'good');

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Enrolment lifecycle
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          What&apos;s blocking enrolment
        </CardTitle>
        <CardAction>
          <ChartLegendChip
            color={allClear ? 'fresh' : 'primary'}
            label={allClear ? 'All clear' : `${totalCount} flagged`}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {allClear ? (
          <ul className="divide-y divide-hairline">
            <LifecycleAggregateRow
              bucket={{
                key: 'all-clear',
                label: 'All clear',
                description: '',
                count: 0,
                severity: 'good',
                drillTarget: 'noop',
              }}
              iconKey={'check-circle' as const}
              titleOverride="All clear"
              bodyOverride="The funnel is fully unblocked."
              hideCount
            />
          </ul>
        ) : (
          <div className="divide-y divide-hairline">
            {actionRows.length > 0 && (
              <section>
                <p className="border-b border-hairline bg-muted/40 px-5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Needs attention
                </p>
                <ul className="divide-y divide-hairline">
                  {actionRows.map((bucket) => (
                    <LifecycleAggregateRow
                      key={bucket.key}
                      bucket={bucket}
                      iconKey={bucket.key as never}
                      ayCode={ayCode}
                    />
                  ))}
                </ul>
              </section>
            )}
            {infoRows.length > 0 && (
              <section>
                <p className="border-b border-hairline bg-muted/40 px-5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  For your information
                </p>
                <ul className="divide-y divide-hairline">
                  {infoRows.map((bucket) => (
                    <LifecycleAggregateRow
                      key={bucket.key}
                      bucket={bucket}
                      iconKey={bucket.key as never}
                      ayCode={ayCode}
                    />
                  ))}
                </ul>
              </section>
            )}
            {goodRows.length > 0 && (
              <section>
                <p className="border-b border-hairline bg-muted/40 px-5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Ready
                </p>
                <ul className="divide-y divide-hairline">
                  {goodRows.map((bucket) => (
                    <LifecycleAggregateRow
                      key={bucket.key}
                      bucket={bucket}
                      iconKey={bucket.key as never}
                      ayCode={ayCode}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
