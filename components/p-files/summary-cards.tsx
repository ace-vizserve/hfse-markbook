import { CheckCircle2, CalendarClock, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { DashboardSummary } from '@/lib/p-files/queries';

export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  // Phase 2B (subtractive): "Has Missing" replaced with "Expiring ≤90d" and
  // "Has Expired" dropped — that count is already covered by the "Awaiting
  // revalidation" tile in the chase strip + the Expiring KPIs above the
  // fold. P-Files is renewal-lens only; missing docs are admissions-side.
  const cards = [
    { label: 'Total Students', value: summary.totalStudents, icon: Users },
    { label: 'Fully Complete', value: summary.fullyComplete, icon: CheckCircle2 },
    { label: 'Expiring ≤90d', value: summary.expiringSoon90, icon: CalendarClock },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="gap-0 py-0">
            <CardContent className="flex items-center gap-4 px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                <Icon className="size-5" />
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                  {c.value}
                </div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {c.label}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
