import { redirect } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import Link from 'next/link';

import { getCurrentAcademicYear } from '@/lib/academic-year';
import { listTeacherSowItems, type SowStatusKind } from '@/lib/markbook/sow';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_BADGE: Record<SowStatusKind, { label: string; className: string }> = {
  empty: {
    label: 'Not started',
    className: 'border border-border text-muted-foreground',
  },
  drafted: {
    label: 'Drafted',
    className:
      'border border-brand-amber/30 bg-gradient-to-b from-brand-amber/15 to-brand-amber/5 text-amber-700',
  },
  synced: {
    label: 'Synced',
    className:
      'border border-brand-mint/40 bg-gradient-to-b from-brand-mint/20 to-brand-mint/7 text-emerald-700',
  },
};

export default async function SowIndexPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  if (!['teacher', 'registrar', 'school_admin', 'superadmin'].includes(sessionUser.role ?? '')) {
    redirect('/markbook');
  }

  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  const ayCode = currentAy?.ay_code ?? '';

  const isRegistrarPlus = ['registrar', 'school_admin', 'superadmin'].includes(sessionUser.role ?? '');
  const items = ayCode ? await listTeacherSowItems(sessionUser.id, ayCode, isRegistrarPlus) : [];

  const grouped = groupByLevel(items);

  return (
    <PageShell>
      <header className="space-y-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Markbook · Planning
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
            <ScrollText className="h-5 w-5 text-white" />
          </div>
          <h1 className="font-serif text-[32px] font-semibold leading-[1.1] tracking-tight text-foreground">
            Scheme of Work.
          </h1>
        </div>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Author and maintain your SOW for each section and subject. WW/PT labels and evaluation topics flow into grading sheets and evaluation checklists when you sync.
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {ayCode
              ? 'No subject assignments found for this academic year.'
              : 'No active academic year found.'}
          </CardContent>
        </Card>
      ) : (
        grouped.map(({ levelLabel, items: levelItems }) => (
          <Card key={levelLabel}>
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {levelLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead className="w-14 text-center">WW</TableHead>
                    <TableHead className="w-14 text-center">PT</TableHead>
                    <TableHead className="w-16 text-center">Topics</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {levelItems.map((item) => {
                    const badge = STATUS_BADGE[item.status];
                    const editorHref = `/markbook/sow/${item.section_id}/${item.subject_id}/${item.term_id}`;
                    return (
                      <TableRow key={`${item.section_id}:${item.subject_id}:${item.term_id}`}>
                        <TableCell className="font-medium">{item.section_name}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {item.subject_code}
                          </span>{' '}
                          {item.subject_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.term_label}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.ww_count > 0 ? (
                            <Badge variant="secondary">{item.ww_count}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.pt_count > 0 ? (
                            <Badge variant="secondary">{item.pt_count}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.topic_count > 0 ? (
                            <Badge variant="secondary">{item.topic_count}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link href={editorHref}>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              {item.status === 'empty' ? 'Start SOW' : 'Edit'}
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </PageShell>
  );
}

function groupByLevel(items: Awaited<ReturnType<typeof listTeacherSowItems>>) {
  const map = new Map<string, { levelLabel: string; items: typeof items }>();
  for (const item of items) {
    if (!map.has(item.level_label)) {
      map.set(item.level_label, { levelLabel: item.level_label, items: [] });
    }
    map.get(item.level_label)!.items.push(item);
  }
  return [...map.values()];
}
