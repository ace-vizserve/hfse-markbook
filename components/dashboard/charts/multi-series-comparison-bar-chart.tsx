'use client';

import {
  Bar,
  BarChart,
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

export type MultiSeriesBarPoint = {
  category: string;
  [seriesKey: string]: string | number;
};

export type MultiSeriesBarSeries = {
  key: string;
  label: string;
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

export type MultiSeriesComparisonBarChartProps = {
  data: MultiSeriesBarPoint[];
  series: MultiSeriesBarSeries[];
  height?: number;
  yFormat?: YFormat;
};

export function MultiSeriesComparisonBarChart({
  data,
  series,
  height = 260,
  yFormat,
}: MultiSeriesComparisonBarChartProps) {
  const yFormatter = formatterFor(yFormat);
  const palette = Object.fromEntries(series.map((s) => [s.key, s.color])) as Record<
    string,
    ChartLegendChipColor
  >;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="20%"
      >
        <CartesianGrid
          strokeDasharray="2 4"
          stroke="var(--color-border)"
          horizontal
          vertical={false}
          opacity={0.6}
        />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yFormatter}
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 11,
            padding: '8px 10px',
          }}
          cursor={{ fill: 'var(--color-accent)', opacity: 0.5 }}
        />
        <Legend content={chartLegendContent(palette)} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={`var(--color-${s.color})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
