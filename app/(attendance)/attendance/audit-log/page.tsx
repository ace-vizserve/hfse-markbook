import Link from 'next/link';
import { AlertTriangle, ArrowLeft, History, ListChecks, Users } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { AttendanceAuditLogDataTable, type AttendanceAuditRow } from './audit-log-data-table';

// ---------------------------------------------------------------------------
// Server-side actor display-name resolution
// ---------------------------------------------------------------------------

async function buildActorDisplayMap(): Promise<Map<string, string>> {
  try {
    const service = createServiceClient();
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const map = new Map<string, string>();
    for (const u of data?.users ?? []) {
      if (!u.email) continue;
      const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
      const name = (meta.full_name ?? meta.name ?? u.email).trim();
      map.set(u.email, name);
    }
    return map;
  } catch {
    return new Map();
  }
}

export default async function AttendanceAuditLogPage() {
  const supabase = await createClient();

  // TODO(server-pagination): raise 500-row cap to true server pagination per spec §5.24 + §7.4
  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('id, actor_email, action, entity_type, entity_id, context, created_at')
    .like('action', 'attendance.%')
    .order('created_at', { ascending: false })
    .limit(500);

  type RawRow = {
    id: string;
    actor_email: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    context: Record<string, unknown>;
    created_at: string;
  };

  const rawEntries = (rows ?? []) as RawRow[];

  // Resolve actor display names server-side
  const actorMap = await buildActorDisplayMap();

  const entries: AttendanceAuditRow[] = rawEntries.map((r) => ({
    id: r.id,
    at: r.created_at,
    actor_email: r.actor_email,
    actor_display: actorMap.get(r.actor_email) ?? r.actor_email,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    context: r.context ?? {},
  }));

  const uniqueActors = new Set(entries.map((r) => r.actor_email)).size;
  const corrections = entries.filter((r) => r.action === 'attendance.daily.correct').length;

  return (
    <PageShell>
      <Link
        href="/attendance"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Attendance
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Attendance · Audit log
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Daily-attendance history.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Every attendance mark, correction, and bulk import since this section started. Corrections
            add a new entry rather than overwriting the original — past entries are kept on the record.
          </p>
        </div>
      </header>

      <div className="@container/main">
        <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-3">
          <StatCard
            description="Entries loaded"
            value={entries.length.toLocaleString('en-SG')}
            icon={ListChecks}
            footerTitle="Capped at 500 most recent"
            footerDetail="Older rows stay in the database"
          />
          <StatCard
            description="Unique actors"
            value={uniqueActors.toLocaleString('en-SG')}
            icon={Users}
            footerTitle={uniqueActors === 1 ? '1 user' : `${uniqueActors} users`}
            footerDetail="Distinct accounts in this window"
          />
          <StatCard
            description="Corrections"
            value={corrections.toLocaleString('en-SG')}
            icon={History}
            footerTitle={corrections === 0 ? 'None' : 'Historical edits'}
            footerDetail="Back-dated attendance fixes"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-brand-tile">
            <AlertTriangle className="size-4" />
          </div>
          <div className="flex-1 space-y-1.5">
            <p className="font-serif text-base font-semibold leading-tight text-foreground">
              Could not load audit entries
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{error.message}</p>
          </div>
        </div>
      )}

      <AttendanceAuditLogDataTable rows={entries} />

      {entries.length > 0 && (
        <CardContent className="border border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground rounded-lg">
          Showing {entries.length.toLocaleString('en-SG')} most recent entries.
        </CardContent>
      )}
    </PageShell>
  );
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
  icon: React.ComponentType<{ className?: string }>;
  footerTitle: string;
  footerDetail: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {description}
        </CardDescription>
        <CardTitle className="font-serif text-[28px] font-semibold leading-none tabular-nums text-foreground @[240px]/card:text-[34px]">
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
