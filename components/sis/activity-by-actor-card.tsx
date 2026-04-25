'use client';

import * as React from 'react';
import { UserCog } from 'lucide-react';

import { ComparisonBarChart } from '@/components/dashboard/charts/comparison-bar-chart';
import { SisAdminDrillSheet } from '@/components/sis/drills/sis-admin-drill-sheet';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import type { ActorActivityDrillRow } from '@/lib/sis/drill';

/**
 * ActivityByActorCard — top-12 users by audit-event count over the dashboard
 * range. Mirrors the audit-by-module bar shape (horizontal bars). Clicking a
 * bar opens a drill scoped to that actor's events. School_admin+ only —
 * gated at the page level.
 */
export function ActivityByActorCard({
  data,
  rangeFrom,
  rangeTo,
}: {
  data: ActorActivityDrillRow[];
  rangeFrom?: string;
  rangeTo?: string;
}) {
  const [openActor, setOpenActor] = React.useState<string | null>(null);
  const top = data.slice(0, 12);
  const chartData = top.map((r) => ({
    category: r.email ?? r.userId.slice(0, 8),
    current: r.count,
  }));
  const empty = top.length === 0;

  return (
    <Sheet open={!!openActor} onOpenChange={(o) => !o && setOpenActor(null)}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Activity by actor
          </CardDescription>
          <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Top users by audit events
          </CardTitle>
          <CardAction>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <UserCog className="size-4" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {empty ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <UserCog className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">No audit activity</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Bars appear once mutating routes start logging in this range.
              </p>
            </div>
          ) : (
            <ComparisonBarChart
              data={chartData}
              orientation="horizontal"
              height={Math.min(420, Math.max(220, top.length * 26))}
              yFormat="number"
              onSegmentClick={(label) => {
                // Match label back to actor — emails are unique; userId stubs
                // are 8 chars and might collide but practically don't.
                const actor = top.find(
                  (r) => (r.email ?? r.userId.slice(0, 8)) === label,
                );
                if (actor) {
                  // Pass actorEmail as segment when available — drill API
                  // pivots to audit-events filtered by actor email.
                  setOpenActor(actor.email ?? actor.userId);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
      {openActor && (
        <SisAdminDrillSheet
          target="activity-by-actor"
          segment={openActor}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
        />
      )}
    </Sheet>
  );
}
