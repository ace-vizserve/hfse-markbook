'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { SowReviewRow } from '@/lib/sis/sow/queries';

type SowStatus = 'all' | 'empty' | 'partial' | 'complete';

function rowStatus(row: SowReviewRow): SowStatus {
  const hasLabels = row.ww_labels.length > 0 || row.pt_labels.length > 0;
  const hasTopics = row.topic_count > 0;
  if (!hasLabels && !hasTopics) return 'empty';
  if (hasLabels && hasTopics) return 'complete';
  return 'partial';
}

type AyOption = { id: string; ay_code: string; label: string; is_current: boolean };
type TermOption = { id: string; academic_year_id: string; label: string; term_number: number };
type SubjectOption = { id: string; code: string; name: string };

type Props = {
  ays: AyOption[];
  terms: TermOption[];
  subjects: SubjectOption[];
  initialAyCode: string;
  initialTermId: string;
  initialSubjectId: string;
};

export function SowReviewTable({
  ays,
  terms,
  subjects,
  initialAyCode,
  initialTermId,
  initialSubjectId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [ayCode, setAyCode] = useState(initialAyCode);
  const [termId, setTermId] = useState(initialTermId);
  const [subjectId, setSubjectId] = useState(initialSubjectId);

  const [rows, setRows] = useState<SowReviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SowStatus>('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');

  async function loadReview(tId: string, sId: string, ayC: string) {
    if (!tId || !sId || !ayC) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sis/admin/sow?termId=${encodeURIComponent(tId)}&subjectId=${encodeURIComponent(sId)}&ayCode=${encodeURIComponent(ayC)}`,
      );
      if (res.ok) {
        setRows(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }

  function handleAyChange(val: string) {
    setAyCode(val);
    setRows(null);
    startTransition(() => {
      router.push(`/sis/admin/sow?ayCode=${val}&termId=${termId}&subjectId=${subjectId}`);
    });
  }

  function resetTableFilters() {
    setLevelFilter('all');
    setSectionFilter('all');
    setStatusFilter('all');
  }

  function handleTermChange(val: string) {
    setTermId(val);
    setRows(null);
    resetTableFilters();
    loadReview(val, subjectId, ayCode);
  }

  function handleSubjectChange(val: string) {
    setSubjectId(val);
    setRows(null);
    resetTableFilters();
    loadReview(termId, val, ayCode);
  }

  // Load whenever the scope selectors change (and on mount).
  useEffect(() => {
    if (termId && subjectId && ayCode) {
      void loadReview(termId, subjectId, ayCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, subjectId, ayCode]);

  // Derive level + section options from loaded data (preserves P1→S4 order from API)
  const levelOptions = rows
    ? [...new Map(rows.map((r) => [r.level_code, { code: r.level_code, label: r.level_label }])).values()]
    : [];
  const sectionOptions = rows
    ? (levelFilter === 'all' ? rows : rows.filter((r) => r.level_code === levelFilter)).map((r) => ({
        id: r.section_id,
        name: r.section_name,
      }))
    : [];

  const filtered = (rows ?? []).filter((row) => {
    if (levelFilter !== 'all' && row.level_code !== levelFilter) return false;
    if (sectionFilter !== 'all' && row.section_id !== sectionFilter) return false;
    if (statusFilter !== 'all' && rowStatus(row) !== statusFilter) return false;
    return true;
  });
  const grouped = groupByLevel(filtered);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="font-serif text-lg">SOW Review</CardTitle>

        {/* Scope selectors */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Select value={ayCode} onValueChange={handleAyChange} disabled={isPending}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="AY" />
            </SelectTrigger>
            <SelectContent>
              {ays.map((a) => (
                <SelectItem key={a.ay_code} value={a.ay_code}>
                  {a.ay_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={termId} onValueChange={handleTermChange} disabled={!terms.length}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={subjectId} onValueChange={handleSubjectChange} disabled={!subjects.length}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table filters — only shown once data is loaded */}
        {rows !== null && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Select
              value={levelFilter}
              onValueChange={(v) => { setLevelFilter(v); setSectionFilter('all'); }}
            >
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {levelOptions.map((l) => (
                  <SelectItem key={l.code} value={l.code}>{l.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sectionOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SowStatus)}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} of {rows.length}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows === null || filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            {rows === null
              ? 'Select a term and subject to view SOW entries.'
              : rows.length === 0
                ? 'No sections found for this AY.'
                : 'No sections match the current filters.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Adviser</TableHead>
                <TableHead>WW labels</TableHead>
                <TableHead>PT labels</TableHead>
                <TableHead>Topics</TableHead>
                <TableHead>Copied from</TableHead>
                <TableHead>Last edited</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(({ levelLabel, rows: levelRows }) => (
                <Fragment key={levelLabel}>
                  <TableRow className="bg-muted/40">
                    <TableCell
                      colSpan={8}
                      className="py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      {levelLabel}
                    </TableCell>
                  </TableRow>
                  {levelRows.map((row) => (
                    <TableRow key={row.section_id}>
                      <TableCell className="font-medium">{row.section_name}</TableCell>
                      <TableCell>
                        <SowStatusBadge status={rowStatus(row)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.advisor_name ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] align-top">
                        <LabelChips labels={row.ww_labels.map((l) => l.label)} />
                      </TableCell>
                      <TableCell className="max-w-[200px] align-top">
                        <LabelChips labels={row.pt_labels.map((l) => l.label)} />
                      </TableCell>
                      <TableCell className="max-w-[220px] align-top">
                        <LabelChips labels={row.topic_texts} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.copied_from_section_name ? (
                          <span title={row.copied_at ? `Copied ${formatDate(row.copied_at)}` : undefined}>
                            {row.copied_from_section_name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.last_edited_at ? formatDate(row.last_edited_at) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SowStatusBadge({ status }: { status: SowStatus }) {
  if (status === 'complete')
    return (
      <Badge className="bg-gradient-to-b from-brand-mint/80 to-brand-mint/30 text-foreground border-0 shadow-none text-[10px]">
        Complete
      </Badge>
    );
  if (status === 'partial')
    return (
      <Badge className="bg-gradient-to-b from-brand-amber/80 to-brand-amber/30 text-foreground border-0 shadow-none text-[10px]">
        Partial
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground text-[10px]">
      Empty
    </Badge>
  );
}

function LabelChips({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l, i) => (
        <Badge key={i} variant="outline" className="whitespace-normal break-words text-[10px] leading-tight h-auto py-0.5">
          {l}
        </Badge>
      ))}
    </div>
  );
}

function groupByLevel(rows: SowReviewRow[]) {
  const map = new Map<string, { levelLabel: string; rows: SowReviewRow[] }>();
  for (const row of rows) {
    const key = row.level_label;
    if (!map.has(key)) map.set(key, { levelLabel: key, rows: [] });
    map.get(key)!.rows.push(row);
  }
  return [...map.values()];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
