import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Check,
  FileCheck2,
  FileX,
  Tag,
  UserCircle2,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import type { RecentActivityRow } from '@/lib/sis/dashboard';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function RecentActivityFeed({ rows }: { rows: RecentActivityRow[] }) {
  const empty = rows.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Activity · Last {rows.length || 0} updates
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Recent records activity
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Activity className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center">
            <Activity className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium text-foreground">
              No recent activity
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Edits to profiles, family, pipeline stages, and documents appear
              here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {rows.map((r) => {
              const { Icon, label, tint } = describeAction(r.action);
              return (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${tint}`}
                  >
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm text-foreground">
                      <span className="font-medium">{label}</span>
                      {r.entityId && (
                        <>
                          {' · '}
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {r.entityId}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {r.actorEmail ?? 'system'} · {formatRelative(r.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {!empty && (
        <CardFooter className="flex items-center justify-end border-t border-border px-5 py-3 text-xs">
          <Link
            href="/records/audit-log"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-indigo-deep"
          >
            Full audit log
            <ArrowRight className="size-3" />
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

const ACTION_MAP: Record<
  string,
  { label: string; Icon: LucideIcon; tint: string }
> = {
  'sis.profile.update': {
    label: 'Profile updated',
    Icon: UserCircle2,
    tint: 'bg-accent text-brand-indigo-deep',
  },
  'sis.family.update': {
    label: 'Family updated',
    Icon: Users,
    tint: 'bg-accent text-brand-indigo-deep',
  },
  'sis.stage.update': {
    label: 'Stage advanced',
    Icon: Workflow,
    tint: 'bg-accent text-brand-indigo-deep',
  },
  'sis.document.approve': {
    label: 'Document approved',
    Icon: FileCheck2,
    tint: 'bg-brand-mint/30 text-ink',
  },
  'sis.document.reject': {
    label: 'Document rejected',
    Icon: FileX,
    tint: 'bg-destructive/10 text-destructive',
  },
  'sis.discount_code.create': {
    label: 'Discount code created',
    Icon: Tag,
    tint: 'bg-accent text-brand-indigo-deep',
  },
  'sis.discount_code.update': {
    label: 'Discount code updated',
    Icon: Tag,
    tint: 'bg-accent text-brand-indigo-deep',
  },
  'sis.discount_code.expire': {
    label: 'Discount code expired',
    Icon: Tag,
    tint: 'bg-muted text-muted-foreground',
  },
};

function describeAction(action: string) {
  return (
    ACTION_MAP[action] ?? {
      label: action.replace(/^sis\./, '').replace(/\./g, ' '),
      Icon: Check,
      tint: 'bg-muted text-muted-foreground',
    }
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-SG', {
    month: 'short',
    day: 'numeric',
  });
}
