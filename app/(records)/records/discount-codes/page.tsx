import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CalendarRange, Check, Tag, X } from 'lucide-react';

import { AySwitcher } from '@/components/admissions/ay-switcher';
import { DiscountCodeStatusBadge } from '@/components/sis/discount-code-status-badge';
import { DiscountCodeRowActions } from '@/components/sis/discount-code-row-actions';
import { NewDiscountCodeButton } from '@/components/sis/edit-discount-code-dialog';
import { SisEmptyState } from '@/components/sis/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentAcademicYear, listAyCodes } from '@/lib/academic-year';
import { listDiscountCodes } from '@/lib/sis/queries';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export default async function SisDiscountCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (sessionUser.role !== 'registrar' && sessionUser.role !== 'school_admin' && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
    redirect('/');
  }

  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  if (!currentAy) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No current academic year configured.</div>
      </PageShell>
    );
  }

  const { ay: ayParam } = await searchParams;
  const ayCodes = await listAyCodes(service);
  const selectedAy = ayParam && ayCodes.includes(ayParam) ? ayParam : currentAy.ay_code;

  const codes = await listDiscountCodes(selectedAy);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isActive = (start: string | null, end: string | null) => {
    if (!start || !end) return false;
    const s = new Date(start);
    const e = new Date(end);
    return today >= s && today <= e;
  };
  const isExpired = (end: string | null) => {
    if (!end) return false;
    return new Date(end) < today;
  };

  const activeCount = codes.filter((c) => isActive(c.startDate, c.endDate)).length;
  const expiredCount = codes.filter((c) => isExpired(c.endDate)).length;

  return (
    <PageShell>
      <Link
        href="/records"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Records · Discount Codes · {selectedAy}
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            Promotion codes.
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Time-bound enrolment discount codes. Per-student grants are handled in the enrolment portal.
          </p>
        </div>
        <NewDiscountCodeButton ayCode={selectedAy} />
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat label="Total codes" value={codes.length} icon={Tag} />
            <SummaryStat label="Active today" value={activeCount} icon={Check} />
            <SummaryStat label="Expired" value={expiredCount} icon={X} />
          </div>

          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-6">
                      <SisEmptyState
                        icon={Tag}
                        title="No discount codes yet."
                        body={`Nothing configured for ${selectedAy}. Codes created here are picked up by the enrolment portal immediately — use the "New code" button above to start.`}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  codes.map((c) => (
                    <TableRow key={String(c.id)}>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                          {c.discountCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        {c.enroleeType ? (
                          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
                            {c.enroleeType}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          <CalendarRange className="size-3" />
                          {formatDate(c.startDate)} → {formatDate(c.endDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DiscountCodeStatusBadge startDate={c.startDate} endDate={c.endDate} />
                      </TableCell>
                      <TableCell className="max-w-md">
                        {c.details ? (
                          <span className="text-xs leading-relaxed text-foreground">{c.details}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DiscountCodeRowActions ayCode={selectedAy} code={c} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader>
              <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                Viewing
              </CardDescription>
              <CardTitle className="font-serif text-lg font-semibold">Academic year</CardTitle>
            </CardHeader>
            <CardContent>
              <AySwitcher current={selectedAy} options={ayCodes} />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Codes live in <code className="rounded bg-muted px-1 py-0.5 text-[11px]">ay{selectedAy.slice(2)}_discount_codes</code>.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  return new Date(t).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function SummaryStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </CardDescription>
        <CardTitle className="font-serif text-[28px] font-semibold leading-none tabular-nums text-foreground @[240px]/card:text-[32px]">
          {value.toLocaleString('en-SG')}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
