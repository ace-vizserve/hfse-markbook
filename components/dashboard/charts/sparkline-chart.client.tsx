'use client';

import * as React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export type SparkPoint = { x: string; y: number };

function SparklineChartImpl({ points }: { points: SparkPoint[] }) {
  const gradientId = `spark-${points.length}-${points[0]?.x ?? 'n'}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 1, right: 1, left: 1, bottom: 1 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="y"
          stroke="var(--color-chart-1)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export const SparklineChart = React.memo(SparklineChartImpl);
SparklineChart.displayName = 'SparklineChart';
