import Link from 'next/link';
import {
  CheckCircle2,
  Layers,
  Lock,
  LockOpen,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface, SurfaceHeader, SurfaceTitle, SurfaceDescription } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

type LevelLite = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };
type SubjectLite = { id: string; code: string; name: string; is_examinable: boolean };
type SectionLite = { id: string; name: string; level: LevelLite | LevelLite[] | null };
type TermLite = { id: string; term_number: number; label: string };

type SheetRow = {
  id: string;
  is_locked: boolean;
  teacher_name: string | null;
  term: TermLite | TermLite[] | null;
  subject: SubjectLite | SubjectLite[] | null;
  section: SectionLite | SectionLite[] | null;
};

const first = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

export default async function GradingListPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const levelFilter = sp.level ?? 'all';
  const statusFilter = sp.status ?? 'all';

  const supabase = await createClient();

  const { data: user } = await supabase.auth.getUser();
  const role = getUserRole(user.user);
  const canCreate = role === 'registrar' || role === 'admin' || role === 'superadmin';

  const { data: sheets } = await supabase
    .from('grading_sheets')
    .select(
      `id, is_locked, teacher_name,
       term:terms(id, term_number, label),
       subject:subjects(id, code, name, is_examinable),
       section:sections(id, name, level:levels(id, code, label, level_type))`,
    );

  let advisorySections: Array<{ id: string; name: string; level_label: string | null }> = [];
  if (user.user) {
    const { data: advisorAssignments } = await supabase
      .from('teacher_assignments')
      .select('section:sections(id, name, level:levels(label))')
      .eq('teacher_user_id', user.user.id)
      .eq('role', 'form_adviser');
    type AA = {
      section:
        | { id: string; name: string; level: { label: string } | { label: string }[] | null }
        | { id: string; name: string; level: { label: string } | { label: string }[] | null }[]
        | null;
    };
    advisorySections = ((advisorAssignments ?? []) as AA[])
      .map((a) => first(a.section))
      .filter(
        (s): s is { id: string; name: string; level: { label: string } | { label: string }[] | null } =>
          !!s,
      )
      .map((s) => {
        const lvl = first(s.level);
        return { id: s.id, name: s.name, level_label: lvl?.label ?? null };
      });
  }

  const allRows = (sheets ?? []) as SheetRow[];

  const levelSet = new Map<string, string>();
  for (const s of allRows) {
    const lvl = first(first(s.section)?.level ?? null);
    if (lvl?.label) levelSet.set(lvl.label, lvl.label);
  }
  const allLevels = Array.from(levelSet.keys()).sort();

  const filtered = allRows.filter((s) => {
    const lvlLabel = first(first(s.section)?.level ?? null)?.label ?? 'Unknown';
    if (levelFilter !== 'all' && lvlLabel !== levelFilter) return false;
    if (statusFilter === 'locked' && !s.is_locked) return false;
    if (statusFilter === 'open' && s.is_locked) return false;
    return true;
  });

  const grouped = new Map<string, SheetRow[]>();
  for (const s of filtered) {
    const key = first(first(s.section)?.level ?? null)?.label ?? 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  const levels = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  const totalCount = allRows.length;
  const lockedCount = allRows.filter((s) => s.is_locked).length;
  const openCount = totalCount - lockedCount;

  const buildHref = (patch: { level?: string; status?: string }) => {
    const params = new URLSearchParams();
    const lvl = patch.level ?? levelFilter;
    const st = patch.status ?? statusFilter;
    if (lvl !== 'all') params.set('level', lvl);
    if (st !== 'all') params.set('status', st);
    const qs = params.toString();
    return qs ? `/grading?${qs}` : '/grading';
  };

  const hasFilter = levelFilter !== 'all' || statusFilter !== 'all';

  return (
    <PageShell>
      <PageHeader
        eyebrow="Grading"
        title="Grading Sheets"
        description="One sheet per subject × section × term."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/grading/new">
                <Plus className="h-4 w-4" />
                New grading sheet
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Stat cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={Layers} label="Total sheets" value={totalCount} />
        <StatCard icon={LockOpen} label="Open" value={openCount} hint="teachers can edit" />
        <StatCard
          icon={Lock}
          label="Locked"
          value={lockedCount}
          hint="registrar-only post-lock edits"
        />
      </div>

      {/* Advisory shortcut */}
      {advisorySections.length > 0 && (
        <Surface padded={false}>
          <SurfaceHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <SurfaceTitle>Sections you advise</SurfaceTitle>
            </div>
            <SurfaceDescription>
              Form Class Adviser — write the term comments that appear on report cards.
            </SurfaceDescription>
          </SurfaceHeader>
          <div className="flex flex-wrap gap-2 p-6 md:p-8">
            {advisorySections.map((s) => (
              <Button key={s.id} asChild variant="outline" size="sm">
                <Link href={`/grading/advisory/${s.id}/comments`}>
                  {s.level_label ? `${s.level_label} · ` : ''}
                  {s.name} · Comments →
                </Link>
              </Button>
            ))}
          </div>
        </Surface>
      )}

      {/* Filter bar */}
      {totalCount > 0 && (
        <Surface className="flex flex-wrap items-center gap-2 p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Level
          </span>
          <FilterChip label="All" active={levelFilter === 'all'} href={buildHref({ level: 'all' })} />
          {allLevels.map((l) => (
            <FilterChip
              key={l}
              label={l}
              active={levelFilter === l}
              href={buildHref({ level: l })}
            />
          ))}
          <Separator orientation="vertical" className="mx-2 h-5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <FilterChip
            label="All"
            active={statusFilter === 'all'}
            href={buildHref({ status: 'all' })}
          />
          <FilterChip
            label="Open"
            active={statusFilter === 'open'}
            href={buildHref({ status: 'open' })}
          />
          <FilterChip
            label="Locked"
            active={statusFilter === 'locked'}
            href={buildHref({ status: 'locked' })}
          />
          {hasFilter && (
            <Link
              href="/grading"
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <X className="h-3 w-3" />
              Clear filters
            </Link>
          )}
        </Surface>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <EmptyState
          title="No grading sheets yet"
          hint={
            canCreate
              ? 'Create the first sheet for a subject × section × term.'
              : 'Ask the registrar to create a sheet for your class.'
          }
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/grading/new">
                  <Plus className="h-4 w-4" />
                  New grading sheet
                </Link>
              </Button>
            ) : null
          }
        />
      )}

      {/* No results after filter */}
      {totalCount > 0 && levels.length === 0 && (
        <EmptyState
          title="No sheets match the current filter"
          hint="Try clearing the level or status filter."
          action={
            <Button asChild variant="outline">
              <Link href="/grading">Clear filters</Link>
            </Button>
          }
        />
      )}

      {/* Grouped tables */}
      <div className="space-y-8">
        {levels.map(([levelLabel, rows]) => (
          <section key={levelLabel} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {levelLabel}{' '}
              <span className="text-muted-foreground">· {rows.length}</span>
            </h2>
            <Surface padded={false} className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((s) => {
                    const section = first(s.section);
                    const subject = first(s.subject);
                    const term = first(s.term);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Link
                            href={`/grading/${s.id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {section?.name ?? '—'}
                          </Link>
                        </TableCell>
                        <TableCell>{subject?.name ?? '—'}</TableCell>
                        <TableCell>{term?.label ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.teacher_name ?? '—'}
                        </TableCell>
                        <TableCell>
                          {s.is_locked ? (
                            <Badge variant="secondary">
                              <Lock className="h-3 w-3" />
                              Locked
                            </Badge>
                          ) : (
                            <Badge variant="default">
                              <CheckCircle2 className="h-3 w-3" />
                              Open
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Surface>
          </section>
        ))}
      </div>
    </PageShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 font-serif text-3xl font-semibold tabular-nums text-primary">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Surface>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 py-12 text-center">
      <div className="font-serif text-base font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
      {action}
    </div>
  );
}

function FilterChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-accent'
      )}
    >
      {label}
    </Link>
  );
}

