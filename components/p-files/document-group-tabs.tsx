'use client';

import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Tab wrapper for the three P-Files document groups (student-expiring,
// parent, student) — STP slots removed in migration 050 per KD #96.
// Each tab's content is server-rendered and passed in as ReactNode —
// the tabs themselves are client-side state (Radix Tabs needs
// interactivity), but the DocumentCard grid inside each panel stays
// in the RSC tree.
//
// Per-trigger badge surfaces the "need action" count so the registrar
// sees which group has work waiting without flipping through every tab.

export type DocumentGroupTab = {
  /** Stable id used as the Tabs value. */
  group: string;
  /** Human label in the trigger. */
  label: string;
  /** Total slot count for the group. Drives "X / N valid" in the panel. */
  total: number;
  /** Count of slots in 'valid' state. Drives the panel meta line. */
  validCount: number;
  /** Count of slots that need action (urgency-classified). Drives the
   *  trigger badge + the panel meta line. */
  actionableCount: number;
  /** Pre-rendered grid of <DocumentCard> for this group, supplied by
   *  the parent server component. */
  content: React.ReactNode;
};

type Props = {
  groups: DocumentGroupTab[];
};

export function DocumentGroupTabs({ groups }: Props) {
  // Default to the first group with actionable work, otherwise the first
  // group overall — admins typically want to start where there's
  // something to do.
  const defaultGroup =
    groups.find((g) => g.actionableCount > 0)?.group ?? groups[0]?.group ?? '';

  if (groups.length === 0) return null;

  return (
    <Tabs defaultValue={defaultGroup} className="space-y-4">
      <TabsList>
        {groups.map((g) => (
          <TabsTrigger key={g.group} value={g.group} className="gap-2">
            {g.label}
            {g.actionableCount > 0 && (
              <Badge
                variant="blocked"
                className="font-mono text-[10px] tabular-nums"
              >
                {g.actionableCount}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((g) => (
        <TabsContent key={g.group} value={g.group} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {g.validCount}/{g.total} valid
            </Badge>
            {g.actionableCount > 0 && (
              <Badge variant="blocked">
                {g.actionableCount} need{g.actionableCount === 1 ? 's' : ''}{' '}
                action
              </Badge>
            )}
          </div>
          {g.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
