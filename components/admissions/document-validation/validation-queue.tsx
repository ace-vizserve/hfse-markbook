'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { GalleryHorizontalEndIcon, ListIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { IdentifierLink } from '@/components/ui/identifier-link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import type {
  ValidationQueueCategory,
  ValidationQueueRow,
} from '@/lib/admissions/document-validation';

import { RejectDialog } from './reject-dialog';
import { TriagePane } from './triage-pane';

type Props = {
  rows: ValidationQueueRow[];
  ayCode: string;
};

export function ValidationQueue({ rows: initialRows, ayCode }: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'table' | 'triage'>('table');
  const [activeTab, setActiveTab] = React.useState<ValidationQueueCategory>('general');
  const [rows, setRows] = React.useState<ValidationQueueRow[]>(initialRows);
  const [actingKey, setActingKey] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<ValidationQueueRow | null>(null);

  // Sync from server when initialRows changes (router.refresh after a successful action).
  React.useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Per-tab row split + counts. Counts derive from local state so optimistic
  // removal (after Approve/Reject) ticks each tab badge down immediately.
  const generalRows = React.useMemo(
    () => rows.filter((r) => r.category === 'general'),
    [rows],
  );
  const stpRows = React.useMemo(
    () => rows.filter((r) => r.category === 'stp'),
    [rows],
  );
  const tabRows = activeTab === 'general' ? generalRows : stpRows;

  const rowKey = React.useCallback(
    (r: ValidationQueueRow) => `${r.enroleeNumber}::${r.slotKey}`,
    [],
  );

  const patchStatus = React.useCallback(
    async (
      row: ValidationQueueRow,
      body: { status: 'Valid' } | { status: 'Rejected'; rejectionReason: string },
    ): Promise<boolean> => {
      const key = rowKey(row);
      setActingKey(key);
      try {
        const res = await fetch(
          `/api/sis/students/${encodeURIComponent(row.enroleeNumber)}/document/${encodeURIComponent(row.slotKey)}?ay=${encodeURIComponent(ayCode)}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(err.error ?? 'Could not save the change.');
          return false;
        }
        // Optimistic removal — drop the row from local state.
        setRows((prev) => prev.filter((r) => rowKey(r) !== key));
        const verb = body.status === 'Valid' ? 'approved' : 'rejected';
        toast.success(`${row.slotLabel} ${verb}.`);
        // Trigger SSR refresh so the badge count updates.
        router.refresh();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save the change.');
        return false;
      } finally {
        setActingKey(null);
      }
    },
    [ayCode, router, rowKey],
  );

  const columns = React.useMemo<ColumnDef<ValidationQueueRow>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Student',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <IdentifierLink
              href={`/admissions/applications/${encodeURIComponent(row.original.enroleeNumber)}?ay=${encodeURIComponent(ayCode)}`}
            >
              {row.original.fullName}
            </IdentifierLink>
            <div className="font-mono text-[10px] text-muted-foreground">
              {row.original.enroleeNumber}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'slotLabel',
        header: 'Document',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{row.original.slotLabel}</Badge>
            {row.original.isExpirable && <Badge variant="warning">Expires</Badge>}
          </div>
        ),
      },
      {
        accessorKey: 'levelApplied',
        header: 'Level',
        cell: ({ row }) => row.original.levelApplied ?? '—',
      },
      {
        id: 'preview',
        header: 'Preview',
        cell: ({ row }) => (
          <a
            href={row.original.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Open file
          </a>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const key = rowKey(row.original);
          const busy = actingKey === key;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="default"
                disabled={busy}
                onClick={() => void patchStatus(row.original, { status: 'Valid' })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => setRejectTarget(row.original)}
              >
                Reject
              </Button>
            </div>
          );
        },
      },
    ],
    [actingKey, ayCode, patchStatus, rowKey],
  );

  // Toolbar: mode toggle.
  const modeToggle = (
    <div className="flex items-center gap-1 rounded-lg border border-hairline p-0.5">
      <Toggle
        size="sm"
        pressed={mode === 'table'}
        onPressedChange={() => setMode('table')}
        aria-label="Table view"
      >
        <ListIcon className="size-3.5" />
        <span className="ml-1.5 text-xs">Table</span>
      </Toggle>
      <Toggle
        size="sm"
        pressed={mode === 'triage'}
        onPressedChange={() => setMode('triage')}
        aria-label="Triage mode"
      >
        <GalleryHorizontalEndIcon className="size-3.5" />
        <span className="ml-1.5 text-xs">Triage</span>
      </Toggle>
    </div>
  );

  // Tabs surface (one row per category). Sticks to the same mode toggle +
  // PATCH handlers — only the row source changes per tab. The STP tab is
  // always rendered (even when empty) so the team learns where STP docs
  // would land if any showed up.
  const tabs = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as ValidationQueueCategory)}
    >
      <TabsList>
        <TabsTrigger value="general" className="gap-2">
          General
          <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
            {generalRows.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="stp" className="gap-2">
          STP
          <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
            {stpRows.length}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (mode === 'triage') {
    return (
      <div className="space-y-4">
        {tabs}
        <TriagePane
          rows={tabRows}
          ayCode={ayCode}
          actingKey={actingKey}
          onApprove={(row) => patchStatus(row, { status: 'Valid' })}
          onReject={(row, reason) =>
            patchStatus(row, { status: 'Rejected', rejectionReason: reason })
          }
          onExit={() => setMode('table')}
          headerToggle={modeToggle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabs}
      <DataTable
        columns={columns}
        data={tabRows}
        getRowId={rowKey}
        toolbarTrailing={modeToggle}
      />
      <RejectDialog
        open={rejectTarget != null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        slotLabel={rejectTarget?.slotLabel ?? ''}
        studentName={rejectTarget?.fullName ?? ''}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          const ok = await patchStatus(rejectTarget, {
            status: 'Rejected',
            rejectionReason: reason,
          });
          if (ok) setRejectTarget(null);
        }}
      />
    </div>
  );
}
