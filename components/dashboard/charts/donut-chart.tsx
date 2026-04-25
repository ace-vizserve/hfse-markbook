'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export type DonutSlice = { name: string; value: number };

export type DonutChartProps = {
  data: DonutSlice[];
  height?: number;
  colors?: string[];
  centerLabel?: string;
  centerValue?: string | number;
  onSegmentClick?: (sliceName: string) => void;
};

const DEFAULT_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-brand-mint)',
  'var(--color-brand-amber)',
];

export function DonutChart({
  data,
  height = 220,
  colors = DEFAULT_COLORS,
  centerLabel,
  centerValue,
  onSegmentClick,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="var(--color-background)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={
                onSegmentClick
                  ? (payload: { name?: string }) => {
                      if (payload?.name) onSegmentClick(payload.name);
                    }
                  : undefined
              }
              style={onSegmentClick ? { cursor: 'pointer' } : undefined}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                fontSize: 11,
                padding: '8px 10px',
              }}
              formatter={(value) => {
                const v = typeof value === 'number' ? value : Number(value);
                return [
                  `${v.toLocaleString('en-SG')} (${total ? ((v / total) * 100).toFixed(1) : '0.0'}%)`,
                  '',
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerValue !== undefined && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[26px] font-semibold leading-none tabular-nums text-foreground">
              {centerValue}
            </span>
            {centerLabel && (
              <span className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-4">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {sorted.map((slice, i) => {
          const idx = data.findIndex((d) => d.name === slice.name);
          const pct = total > 0 ? (slice.value / total) * 100 : 0;
          return (
            <li
              key={slice.name}
              className={`flex items-center gap-3${onSegmentClick ? ' cursor-pointer rounded-md transition-colors hover:bg-accent/40' : ''}`}
              onClick={onSegmentClick ? () => onSegmentClick(slice.name) : undefined}
              role={onSegmentClick ? 'button' : undefined}
              tabIndex={onSegmentClick ? 0 : undefined}
              onKeyDown={
                onSegmentClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSegmentClick(slice.name);
                      }
                    }
                  : undefined
              }
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] text-foreground">{slice.name}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-4">
                    {slice.value.toLocaleString('en-SG')}
                    <span className="ml-1.5 text-ink-5">
                      {pct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: colors[idx % colors.length],
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
