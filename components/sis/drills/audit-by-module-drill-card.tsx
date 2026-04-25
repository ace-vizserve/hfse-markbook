'use client';

import * as React from 'react';

import { ComparisonBarChart, type ComparisonBarPoint } from '@/components/dashboard/charts/comparison-bar-chart';
import { SisAdminDrillSheet } from '@/components/sis/drills/sis-admin-drill-sheet';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';

/**
 * AuditByModuleDrillCard — wraps the existing audit-by-module bar chart on
 * /sis with a drill trigger. Clicking a bar opens the audit-events drill
 * scoped to that module's action prefix.
 */
export function AuditByModuleDrillCard({
  data,
  rangeFrom,
  rangeTo,
}: {
  data: ComparisonBarPoint[];
  rangeFrom?: string;
  rangeTo?: string;
}) {
  const [moduleSlug, setModuleSlug] = React.useState<string | null>(null);
  return (
    <Sheet open={!!moduleSlug} onOpenChange={(o) => !o && setModuleSlug(null)}>
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Audit activity by module
          </CardDescription>
          <CardTitle className="font-serif text-xl">Where the system is most active</CardTitle>
        </CardHeader>
        <CardContent>
          <ComparisonBarChart
            data={data}
            orientation="horizontal"
            height={300}
            onSegmentClick={setModuleSlug}
          />
        </CardContent>
      </Card>
      {moduleSlug && (
        <SisAdminDrillSheet
          target="audit-events"
          segment={moduleSlug}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
        />
      )}
    </Sheet>
  );
}
