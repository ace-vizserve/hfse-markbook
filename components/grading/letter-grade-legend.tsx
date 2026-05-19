import { LEGEND_LEFT, LEGEND_RIGHT } from '@/lib/compute/letter-grade';

export function LetterGradeLegend() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
      <p className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Legend — Non-Examinable Subjects
      </p>
      <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        <div className="space-y-1">
          {LEGEND_LEFT.map(({ code, desc, range }) => (
            <div key={code} className="flex items-baseline gap-2 text-xs">
              <span className="w-6 shrink-0 font-mono font-semibold text-foreground">{code}</span>
              <span className="text-muted-foreground">{desc}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70">({range})</span>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {LEGEND_RIGHT.map(({ code, desc }) => (
            <div key={code} className="flex items-baseline gap-2 text-xs">
              <span className="w-6 shrink-0 font-mono font-semibold text-foreground">{code}</span>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
