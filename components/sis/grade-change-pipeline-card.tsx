import { CheckCircle2, GitBranch, RotateCcw, XCircle, Zap } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GradeChangePipeline } from '@/lib/sis/dashboard';

const PIPELINE_ROWS: Array<{
  key: keyof GradeChangePipeline;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tileClass: string;
}> = [
  {
    key: 'submitted',
    label: 'Submitted',
    description: 'Change requests raised by teachers',
    icon: GitBranch,
    tileClass: 'bg-gradient-to-b from-brand-indigo/20 to-brand-navy/10 text-brand-indigo',
  },
  {
    key: 'approved',
    label: 'Approved',
    description: 'Approved by a designated school admin',
    icon: CheckCircle2,
    tileClass: 'bg-gradient-to-b from-brand-mint/20 to-chart-5/10 text-brand-mint',
  },
  {
    key: 'rejected',
    label: 'Rejected',
    description: 'Rejected and returned to the teacher',
    icon: XCircle,
    tileClass: 'bg-gradient-to-b from-destructive/20 to-destructive/10 text-destructive',
  },
  {
    key: 'applied',
    label: 'Applied',
    description: 'Grade entry updated on the locked sheet',
    icon: Zap,
    tileClass: 'bg-gradient-to-b from-brand-mint/30 to-chart-5/15 text-brand-mint',
  },
  {
    key: 'undoneRejections',
    label: 'Rejections undone',
    description: 'Reversals within the 2-hour undo window',
    icon: RotateCcw,
    tileClass: 'bg-gradient-to-b from-brand-amber/20 to-brand-amber/10 text-brand-amber',
  },
];

export function GradeChangePipelineCard({ pipeline }: { pipeline: GradeChangePipeline }) {
  const hasActivity = Object.values(pipeline).some((v) => v > 0);

  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Grade change requests
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Approval pipeline
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <GitBranch className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {!hasActivity ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No grade change requests in this range.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {PIPELINE_ROWS.map(({ key, label, description, icon: Icon, tileClass }) => (
              <li key={key} className="flex items-center gap-4 px-5 py-3.5">
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl',
                    tileClass,
                  )}
                >
                  <Icon className="size-[17px]" strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-[14px] font-semibold leading-snug text-foreground">
                    {label}
                  </p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{description}</p>
                </div>
                <span className="shrink-0 font-mono text-xl font-bold tabular-nums text-foreground">
                  {pipeline[key].toLocaleString('en-SG')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
