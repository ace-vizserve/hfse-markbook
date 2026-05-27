import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * DashboardHero — canonical hero header per
 * `docs/context/09a-design-patterns.md` §8 "Hero header" pattern.
 *
 * Voice rules (`09-design-system.md` §3.3):
 *   eyebrow:  font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground
 *   headline: font-serif text-[38px] md:text-[44px] tracking-tight text-foreground
 *   body:     text-[15px] leading-relaxed text-muted-foreground
 */

export type HeroBadge = {
  label: string;
  tone?: 'default' | 'mint' | 'amber' | 'muted';
};

export function DashboardHero({
  eyebrow,
  title,
  description,
  badges,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  badges?: HeroBadge[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="space-y-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {(badges?.length || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {badges?.map((b, i) => (
            <HeroBadgeChip key={i} badge={b} />
          ))}
          {actions}
        </div>
      )}
    </header>
  );
}

function HeroBadgeChip({ badge }: { badge: HeroBadge }) {
  const tone = badge.tone ?? 'default';
  const className = cn(
    'h-7 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
    tone === 'mint' && 'border-brand-mint bg-brand-mint/30 text-ink',
    tone === 'amber' && 'border-brand-amber bg-brand-amber-light text-ink',
    tone === 'muted' && 'border-border bg-white text-muted-foreground',
    tone === 'default' && 'border-border bg-white text-foreground'
  );
  return (
    <Badge variant="outline" className={className}>
      {badge.label}
    </Badge>
  );
}
