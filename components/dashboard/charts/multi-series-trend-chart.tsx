'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  chartLegendContent,
  type ChartLegendChipColor,
} from '@/components/dashboard/chart-legend-chip';

export type MultiSeriesTrendPoint = { x: string; [seriesKey: string]: string | number };

export type MultiSeriesTrendSeries = {
  key: string;
  label: string;
  /** Token from the chart palette — `chart-1` through `chart-5`. */
  color: ChartLegendChipColor;
};

export type YFormat = 'number' | 'percent' | 'days';

function formatterFor(format: YFormat | undefined): ((n: number) => string) | undefined {
  switch (format) {
    case 'percent':
      return (n) => `${Math.round(n)}%`;
    case 'days':
      return (n) => `${Math.round(n)}d`;
    case 'number':
      return (n) => n.toLocaleString('en-SG');
    default:
      return undefined;
  }
}

export type MultiSeriesTrendChartProps = {
  series: MultiSeriesTrendSeries[];
  data: MultiSeriesTrendPoint[];
  height?: number;
  yFormat?: YFormat;
};

function MultiSeriesTrendChartImpl({
  series,
  data,
  height = 240,
  yFormat,
}: MultiSeriesTrendChartProps) {
  const yFormatter = formatterFor(yFormat);
  const palette = Object.fromEntries(series.map((s) => [s.key, s.color])) as Record<
    string,
    ChartLegendChipColor
  >;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="var(--color-border)"
          vertical={false}
          opacity={0.6}
        />
        <XAxis
          dataKey="x"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={32}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yFormatter}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }}
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
            return yFormatter ? yFormatter(v) : v;
          }}
        />
        <Legend content={chartLegendContent(palette)} />
        {series.map((s, idx) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={`var(--color-${s.color})`}
            strokeWidth={1.75}
            fill="transparent"
            dot={false}
            isAnimationActive={false}
            strokeDasharray={idx === 0 ? undefined : '4 4'}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const MultiSeriesTrendChart = React.memo(MultiSeriesTrendChartImpl);
MultiSeriesTrendChart.displayName = 'MultiSeriesTrendChart';
