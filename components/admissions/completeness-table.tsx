'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Mail,
  Search,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BulkNotifyDialog, type BulkNotifyItem } from '@/components/p-files/bulk-notify-dialog';
import type { AdmissionsCompleteness } from '@/lib/admissions/dashboard';
import { DOCUMENT_SLOTS, type DocumentStatus } from '@/lib/p-files/document-config';

// Admissions chase variant of the P-Files completeness table. Same UX
// (filterable, sortable, paged roster of applicants × document slots)
// but scoped to the un-enrolled funnel and surfacing the 3 admissions
// chase signals (To follow / Rejected / Pending review) instead of
// P-Files' renewal lens (Expired / expiring soon).
//
// `module="admissions"` is threaded through to the Bulk + per-row
// dialogs so all writes land on the admissions audit + email tone.
export type StatusFilter = 'all' | 'to-follow' | 'rejected' | 'uploaded' | 'expired';

function StatusDot({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'valid':
      return <span className="inline-block size-2.5 rounded-full bg-brand-mint" title="On file" />;
    case 'uploaded':
      return <span className="inline-block size-2.5 rounded-full bg-brand-amber" title="Pending review" />;
    case 'rejected':
      return <span className="inline-block size-2.5 rounded-full bg-destructive" title="Rejected" />;
    case 'to-follow':
      return <span className="inline-block size-2.5 rounded-full bg-primary" title="To follow" />;
    case 'expired':
      // Un-enrolled applicant whose passport / pass / guardian doc lapsed
      // mid-pipeline — chase trigger (parent must re-upload before
      // enrollment can finish).
      return <span className="inline-block size-2.5 rounded-full bg-destructive" title="Expired" />;
    case 'missing':
      return <span className="inline-block size-2.5 rounded-full border border-border bg-muted" title="Missing" />;
    case 'na':
      return <span className="inline-block size-2.5 rounded-full bg-muted" title="N/A" />;
  }
}

function completenessPercent(s: AdmissionsCompleteness): number {
  return s.total > 0 ? Math.round((s.complete / s.total) * 100) : 0;
}

// Build the bulk-reminder targets for a single row. The admissions
// initial-chase lens fires reminders on the 4 chase-actionable statuses:
//   - To follow (parent committed but file not sent)
//   - Rejected (parent uploaded but registrar bounced)
//   - Expired (passport / pass / guardian doc lapsed mid-pipeline)
//   - Uploaded (parent uploaded, awaiting validation — included so the
//     admissions team can ping if the upload sat unattended on the
//     parent's side; the runNotify gate may still skip these as
//     "no_actionable_status" when the slot transitions before send,
//     which the bulk dialog's `skipped` counts surface to the user).
//
// Missing slots (no upload + no commitment) are deliberately excluded —
// the chase strip uses the "Awaiting promised" + "Awaiting validation"
// + "Awaiting revalidation" buckets for the visible signals; chasing
// an applicant on a slot they have no commitment for is the parent
// portal's job, not bulk reminders.
function targetsForRow(student: AdmissionsCompleteness): BulkNotifyItem[] {
  const slotMeta = new Map(DOCUMENT_SLOTS.map((s) => [s.key, s]));
  const out: BulkNotifyItem[] = [];
  for (const slot of student.slots) {
    if (
      slot.status === 'to-follow' ||
      slot.status === 'rejected' ||
      slot.status === 'uploaded' ||
      slot.status === 'expired'
    ) {
      out.push({
        enroleeNumber: student.enroleeNumber,
        studentName: student.fullName,
        slotKey: slot.key,
        slotLabel: slotMeta.get(slot.key)?.label ?? slot.label,
      });
    }
  }
  return out;
}

export function AdmissionsCompletenessTable({
  students,
  ayCode,
  initialStatusFilter,
  bulkRemindEnabled = false,
}: {
  students: AdmissionsCompleteness[];
  /**
   * AY threaded through to the applicant detail page so historical-AY
   * browsing on the dashboard resolves against the right admissions
   * tables on the detail page.
   */
  ayCode?: string;
  /**
   * Preset status filter from a sidebar Quicklink (`?status=to-follow` /
   * `?status=rejected` / `?status=uploaded`). The user can change it via
   * the toolbar Select; this just seeds the initial state.
   */
  initialStatusFilter?: StatusFilter;
  /**
   * When true, render the row-selection checkbox column + sticky bulk
   * "Send reminders" footer. Page enables this on the focused-view
   * branches so the admissions team can fan out reminders in one go.
   */
  bulkRemindEnabled?: boolean;
}) {
  const querySuffix = ayCode ? `?ay=${encodeURIComponent(ayCode)}` : '';
  const [search, setSearch] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatusFilter ?? 'all');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(25);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const levels = React.useMemo(
    () => [...new Set(students.map((s) => s.level).filter((l): l is string => !!l))].sort(),
    [students],
  );

  const filtered = React.useMemo(() => {
    return students.filter((s) => {
      if (levelFilter !== 'all' && s.level !== levelFilter) return false;
      if (search) {
        const needle = search.toLowerCase();
        const haystack = `${s.fullName} ${s.studentNumber ?? ''} ${s.enroleeNumber}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (statusFilter === 'to-follow' && s.toFollow === 0) return false;
      if (statusFilter === 'rejected' && s.rejected === 0) return false;
      if (statusFilter === 'uploaded' && s.uploaded === 0) return false;
      if (statusFilter === 'expired' && s.expired === 0) return false;
      return true;
    });
  }, [students, search, levelFilter, statusFilter]);

  // Reset to page 0 when filters change
  React.useEffect(() => {
    setPageIndex(0);
  }, [search, levelFilter, statusFilter]);

  // Drop selections that no longer match the visible filtered set.
  React.useEffect(() => {
    setSelected((prev) => {
      const visibleIds = new Set(filtered.map((s) => s.enroleeNumber));
      const next = new Set<string>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next;
    });
  }, [filtered]);

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const paged = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const pageIds = React.useMemo(() => paged.map((s) => s.enroleeNumber), [paged]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = !allPageSelected && pageIds.some((id) => selected.has(id));

  function togglePage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Expand selected applicants into BulkNotifyItem[] (one entry per
  // chaseable slot per applicant under the active filter scope).
  const bulkItems = React.useMemo(() => {
    if (!bulkRemindEnabled || selected.size === 0) return [] as BulkNotifyItem[];
    const idSet = selected;
    const out: BulkNotifyItem[] = [];
    for (const s of filtered) {
      if (!idSet.has(s.enroleeNumber)) continue;
      out.push(...targetsForRow(s));
    }
    return out;
  }, [bulkRemindEnabled, selected, filtered]);

  const hasFilter = search.length > 0 || levelFilter !== 'all' || statusFilter !== 'all';

  const slotHeaders = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      for (const slot of s.slots) {
        if (!seen.has(slot.key)) seen.set(slot.key, slot.label);
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [students]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Applicant Document Completeness</CardTitle>
        <CardDescription>
          Pre-enrolment scope — Submitted / Ongoing Verification / Processing. Click a row to view
          the application.
        </CardDescription>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto sm:min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or number…"
              className="pl-8"
            />
          </div>

          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="to-follow">Has To follow</SelectItem>
              <SelectItem value="rejected">Has rejected</SelectItem>
              <SelectItem value="uploaded">Pending review</SelectItem>
              <SelectItem value="expired">Has expired</SelectItem>
            </SelectContent>
          </Select>

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setLevelFilter('all');
                setStatusFilter('all');
              }}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}

          <div className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {filtered.length} of {students.length}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {bulkRemindEnabled && (
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => togglePage(v === true)}
                    />
                  </TableHead>
                )}
                <TableHead className="sticky left-0 bg-muted/40 px-4">Applicant</TableHead>
                <TableHead className="whitespace-nowrap px-2">Level</TableHead>
                <TableHead className="whitespace-nowrap px-2">Status</TableHead>
                {slotHeaders.map((h) => (
                  <TableHead key={h.key} className="px-1 text-center" title={h.label}>
                    <span className="inline-block max-w-[60px] truncate text-[10px]">
                      {h.label
                        .replace('Mother ', 'M/')
                        .replace('Father ', 'F/')
                        .replace('Guardian ', 'G/')
                        .replace('Passport', 'PP')
                        .replace('Student ', 'S/')}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="px-2 text-center">%</TableHead>
                <TableHead className="px-2 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={slotHeaders.length + 5 + (bulkRemindEnabled ? 1 : 0)}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No applicants match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((s) => {
                  const pct = completenessPercent(s);
                  const slotMap = new Map(s.slots.map((sl) => [sl.key, sl.status]));
                  const isSelected = selected.has(s.enroleeNumber);
                  return (
                    <TableRow key={s.enroleeNumber} data-selected={isSelected || undefined}>
                      {bulkRemindEnabled && (
                        <TableCell className="px-2">
                          <Checkbox
                            aria-label={`Select ${s.fullName}`}
                            checked={isSelected}
                            onCheckedChange={(v) => toggleRow(s.enroleeNumber, v === true)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="sticky left-0 bg-background px-4">
                        <div className="text-sm font-medium">{s.fullName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {s.studentNumber ?? s.enroleeNumber}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-xs text-muted-foreground">
                        {s.level ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-xs text-muted-foreground">
                        {s.applicationStatus ?? '—'}
                      </TableCell>
                      {slotHeaders.map((h) => {
                        const status = slotMap.get(h.key);
                        return (
                          <TableCell key={h.key} className="px-1 text-center">
                            {status ? (
                              <StatusDot status={status} />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-2 text-center">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] tabular-nums ${
                            pct === 100
                              ? 'border-brand-mint bg-brand-mint/20 text-ink'
                              : pct >= 70
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : pct >= 40
                                  ? 'border-brand-amber/40 bg-brand-amber/10 text-brand-amber'
                                  : 'border-destructive/30 bg-destructive/10 text-destructive'
                          }`}
                        >
                          {pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 text-right">
                        <Link
                          href={`/admissions/applications/${s.enroleeNumber}${querySuffix}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          View
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Pagination */}
      <div className="flex flex-col-reverse items-start gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'applicant' : 'applicants'}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Rows per page
            </span>
            <Select
              value={`${pageSize}`}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={`${n}`}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex(0)}
              disabled={pageIndex === 0}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex(pageCount - 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {bulkRemindEnabled && selected.size > 0 && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-card px-6 py-3 shadow-[0_-4px_6px_-2px_oklch(0_0_0/0.04)]">
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-brand-amber" />
            <span className="text-sm">
              {selected.size} applicant{selected.size === 1 ? '' : 's'} selected
              {' · '}
              <span className="font-mono text-[11px] text-muted-foreground">
                {bulkItems.length} reminder{bulkItems.length === 1 ? '' : 's'} queued
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={bulkItems.length === 0}
            >
              <Mail className="size-3.5" />
              Send reminders
            </Button>
          </div>
        </div>
      )}

      {bulkRemindEnabled && (
        <BulkNotifyDialog
          items={bulkItems}
          module="admissions"
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          onSuccess={() => setSelected(new Set())}
        />
      )}
    </Card>
  );
}
