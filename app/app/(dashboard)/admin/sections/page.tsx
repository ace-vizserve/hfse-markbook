import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';

type LevelLite = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };

export default async function SectionsListPage() {
  const supabase = await createClient();

  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('is_current', true)
    .single();

  const { data: sections } = ay
    ? await supabase
        .from('sections')
        .select('id, name, level:levels(id, code, label, level_type)')
        .eq('academic_year_id', ay.id)
    : { data: [] as Array<{ id: string; name: string; level: LevelLite | LevelLite[] | null }> };

  const ids = (sections ?? []).map((s) => s.id);
  const counts: Record<string, { active: number; withdrawn: number }> = {};
  if (ids.length > 0) {
    const { data: enrolments } = await supabase
      .from('section_students')
      .select('section_id, enrollment_status')
      .in('section_id', ids);
    for (const row of enrolments ?? []) {
      const b = (counts[row.section_id] ??= { active: 0, withdrawn: 0 });
      if (row.enrollment_status === 'withdrawn') b.withdrawn++;
      else b.active++;
    }
  }

  const getLevel = (l: LevelLite | LevelLite[] | null): LevelLite | null =>
    Array.isArray(l) ? l[0] ?? null : l;

  const grouped = new Map<
    string,
    Array<{ id: string; name: string; active: number; withdrawn: number }>
  >();
  for (const s of sections ?? []) {
    const lvl = getLevel(s.level as LevelLite | LevelLite[] | null);
    const key = lvl?.label ?? 'Unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({
      id: s.id,
      name: s.name,
      active: counts[s.id]?.active ?? 0,
      withdrawn: counts[s.id]?.withdrawn ?? 0,
    });
  }
  const sortedLevels = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Sections"
        description={ay?.label ?? 'No current academic year'}
      />

      {sortedLevels.length === 0 && (
        <Surface className="text-sm text-muted-foreground">
          No sections yet. Run the seed SQL.
        </Surface>
      )}

      <div className="space-y-8">
        {sortedLevels.map(([level, sects]) => (
          <section key={level} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {level}
            </h2>
            <Surface padded={false} className="divide-y divide-border">
              {sects
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <Link
                    key={s.id}
                    href={`/admin/sections/${s.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-serif text-base font-semibold tracking-tight text-foreground">
                        {s.name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.active} active
                        {s.withdrawn > 0 && (
                          <span className="ml-1.5 text-muted-foreground">
                            · {s.withdrawn} withdrawn
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                      {s.active}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
            </Surface>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
