import { CalendarDays } from 'lucide-react';
import Link from 'next/link';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { UpcomingCalendarEvent } from '@/lib/sis/dashboard';

const CATEGORY_LABELS: Record<string, string> = {
  term_exam: 'Term Exam',
  term_break: 'Term Break',
  start_of_term: 'Start of Term',
  parents_dialogue: 'Parents Dialogue',
  subject_week: 'Subject Week',
  school_event: 'School Event',
  pfe: 'PFE',
  ptc: 'PTC',
  other: 'Other',
};

function formatEventDate(startDate: string, endDate: string | null): string {
  try {
    const start = new Date(startDate);
    const startFmt = start.toLocaleString('en-SG', {
      month: 'short',
      day: 'numeric',
    });
    if (!endDate || endDate === startDate) return startFmt;
    const end = new Date(endDate);
    if (end.getMonth() === start.getMonth()) {
      return `${startFmt}–${end.getDate()}`;
    }
    return `${startFmt} – ${end.toLocaleString('en-SG', { month: 'short', day: 'numeric' })}`;
  } catch {
    return startDate;
  }
}

export function HubUpcomingEventsCard({
  events,
}: {
  events: UpcomingCalendarEvent[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          School calendar
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Upcoming events
        </CardTitle>
        <CardAction>
          <Link href="/sis/calendar" tabIndex={-1}>
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <CalendarDays className="size-4" />
            </div>
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {events.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No upcoming events in the school calendar.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3.5 px-5 py-3.5"
              >
                <div className="mt-[7px] flex size-2 shrink-0 rounded-full bg-brand-indigo/50" />
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[14px] font-semibold leading-snug text-foreground">
                    {event.label}
                    {event.tentative && (
                      <span className="ml-1.5 font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground/60">
                        tentative
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">
                    {CATEGORY_LABELS[event.category] ?? event.category}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  {formatEventDate(event.startDate, event.endDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
