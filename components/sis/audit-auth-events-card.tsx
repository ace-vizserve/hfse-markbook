import { KeyRound, LogIn, Users } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AuthEventCounts } from '@/lib/sis/dashboard';

export function AuditAuthEventsCard({ counts }: { counts: AuthEventCounts }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Sessions
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Login &amp; session activity
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <KeyRound className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-hairline">
          <AuthRow
            icon={LogIn}
            label="Staff sign-ins"
            description="Times staff signed in via the login page"
            count={counts.staffLogins}
            tileClass="bg-gradient-to-b from-brand-indigo/20 to-brand-navy/10 text-brand-indigo"
          />
          <AuthRow
            icon={Users}
            label="Parent sessions started"
            description="SSO handoffs issued from the parent portal"
            count={counts.parentSessionsIssued}
            tileClass="bg-gradient-to-b from-brand-mint/20 to-chart-5/10 text-brand-mint"
          />
          <AuthRow
            icon={KeyRound}
            label="Parent sessions ended"
            description="Sessions cleared on sign-out or expiry"
            count={counts.parentSessionsCleared}
            tileClass="bg-gradient-to-b from-ink-4/30 to-ink-3/15 text-muted-foreground"
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function AuthRow({
  icon: Icon,
  label,
  description,
  count,
  tileClass,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  description: string;
  count: number;
  tileClass: string;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-xl',
          tileClass
        )}
      >
        <Icon className="size-[17px]" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[14px] font-semibold leading-snug text-foreground">
          {label}
        </p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <span className="shrink-0 font-mono text-xl font-bold tabular-nums text-foreground">
        {count.toLocaleString('en-SG')}
      </span>
    </li>
  );
}
