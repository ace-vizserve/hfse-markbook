import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type LevelLite = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };

export default async function ReportCardsListPage({
  searchParams,
}: {
  searchParams: Promise<{ section_id?: string }>;
}) {
  const q = await searchParams;
  const supabase = await createClient();

  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, label')
    .eq('is_current', true)
    .single();

  const { data: sections } = ay
    ? await supabase
        .from('sections')
        .select('id, name, level:levels(id, code, label, level_type)')
        .eq('academic_year_id', ay.id)
    : { data: [] };

  const first = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? v[0] ?? null : v ?? null;

  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  for (const s of sections ?? []) {
    const lvl = first(s.level as LevelLite | LevelLite[] | null);
    const key = lvl?.label ?? 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ id: s.id, name: s.name });
  }
  const sortedLevels = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  let selectedRows: Array<{
    enrolment_id: string;
    index_number: number;
    student_id: string;
    student_number: string;
    name: string;
    withdrawn: boolean;
  }> = [];
  let selectedLabel: string | null = null;
  if (q.section_id) {
    const { data: sec } = await supabase
      .from('sections')
      .select('id, name, level:levels(label)')
      .eq('id', q.section_id)
      .single();
    if (sec) {
      const lvl = first(sec.level as { label: string } | { label: string }[] | null);
      selectedLabel = `${lvl?.label ?? ''} ${sec.name}`.trim();
    }
    const { data: enrolments } = await supabase
      .from('section_students')
      .select(
        'id, index_number, enrollment_status, student:students(id, student_number, last_name, first_name, middle_name)',
      )
      .eq('section_id', q.section_id)
      .order('index_number');
    type Row = {
      id: string;
      index_number: number;
      enrollment_status: string;
      student:
        | { id: string; student_number: string; last_name: string; first_name: string; middle_name: string | null }
        | { id: string; student_number: string; last_name: string; first_name: string; middle_name: string | null }[]
        | null;
    };
    selectedRows = ((enrolments ?? []) as Row[]).map((e) => {
      const s = first(e.student);
      return {
        enrolment_id: e.id,
        index_number: e.index_number,
        student_id: s?.id ?? '',
        student_number: s?.student_number ?? '',
        name: s ? [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(', ') : '(missing)',
        withdrawn: e.enrollment_status === 'withdrawn',
      };
    });
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Report Cards"
        title="Report Cards"
        description={`${ay?.label ?? 'No current academic year'} · Preview per student before printing.`}
      />

      <Surface>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pick a section
        </h2>
        <div className="mt-4 space-y-5">
          {sortedLevels.map(([levelLabel, sects]) => (
            <div key={levelLabel} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {levelLabel}
              </div>
              <div className="flex flex-wrap gap-2">
                {sects
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((s) => {
                    const active = s.id === q.section_id;
                    return (
                      <Link
                        key={s.id}
                        href={`/report-cards?section_id=${s.id}`}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-foreground hover:bg-accent',
                        )}
                      >
                        {s.name}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </Surface>

      {selectedLabel && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {selectedLabel} roster
          </h2>
          <Surface padded={false} className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>Student #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No students.
                    </TableCell>
                  </TableRow>
                )}
                {selectedRows.map((r) => (
                  <TableRow
                    key={r.enrolment_id}
                    className={r.withdrawn ? 'text-muted-foreground line-through' : ''}
                  >
                    <TableCell className="text-right tabular-nums">{r.index_number}</TableCell>
                    <TableCell className="tabular-nums">{r.student_number}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/report-cards/${r.student_id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Preview
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Surface>
        </div>
      )}
    </PageShell>
  );
}
