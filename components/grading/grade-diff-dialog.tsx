'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export type AlertComparison = {
  term_label: string;
  term_number: number;
  prior_grade: number;
  /** currentGrade - prior_grade */
  diff: number;
  flagged: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  currentTermLabel: string;
  currentGrade: number;
  comparisons: AlertComparison[];
};

export function GradeDiffDialog({
  open,
  onOpenChange,
  studentName,
  currentTermLabel,
  currentGrade,
  comparisons,
}: Props) {
  const flaggedCount = comparisons.filter((c) => c.flagged).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grade Difference Analysis</DialogTitle>
          <DialogDescription className="truncate">
            {studentName}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-4">
            {/* Current term */}
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {currentTermLabel} — Current
              </p>
              <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums text-foreground">
                {currentGrade}
              </p>
            </div>

            {/* Per-prior-term comparison cards */}
            {comparisons.map((c) => {
              const absDiff = Math.abs(c.diff);
              const signedDiff =
                c.diff > 0 ? `+${absDiff}` : c.diff < 0 ? `−${absDiff}` : '0';
              const isUp = c.diff > 0;
              const isDown = c.diff < 0;

              return (
                <div
                  key={c.term_number}
                  className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
                    c.flagged
                      ? 'border-brand-amber/40 bg-brand-amber/5'
                      : 'border-border bg-background'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {c.term_label}
                    </p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
                      {c.prior_grade}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums ${
                        !c.flagged
                          ? 'text-muted-foreground'
                          : isDown
                            ? 'text-destructive'
                            : 'text-brand-mint'
                      }`}
                    >
                      {isUp ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : isDown ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" />
                      )}
                      {signedDiff}
                    </span>
                    {c.flagged ? (
                      <span className="inline-flex items-center gap-1 rounded bg-brand-amber/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-foreground">
                        <AlertTriangle className="h-2.5 w-2.5 text-brand-amber" />
                        Significant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Within range
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          {flaggedCount === 0
            ? 'No significant grade changes detected.'
            : flaggedCount === 1
              ? '1 significant change detected.'
              : `${flaggedCount} significant changes detected.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
