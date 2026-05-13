'use client';

import * as React from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  SkipForwardIcon,
  XIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ValidationQueueRow } from '@/lib/admissions/document-validation';
import { cn } from '@/lib/utils';

type Props = {
  rows: ValidationQueueRow[];
  ayCode: string;
  actingKey: string | null;
  onApprove: (row: ValidationQueueRow) => Promise<boolean>;
  onReject: (row: ValidationQueueRow, reason: string) => Promise<boolean>;
  onExit: () => void;
  headerToggle: React.ReactNode;
};

const REJECT_MIN_CHARS = 20;

export function TriagePane({
  rows,
  actingKey,
  onApprove,
  onReject,
  onExit,
  headerToggle,
}: Props) {
  const [index, setIndex] = React.useState(0);
  const [rejectMode, setRejectMode] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const current = rows[index];

  // Reset reject state on row change.
  React.useEffect(() => {
    setRejectMode(false);
    setRejectReason('');
  }, [current?.enroleeNumber, current?.slotKey]);

  // Keyboard handler: ←/→ navigate, A approve, R focus reject textarea.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        setIndex((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key.toLowerCase() === 'a' && current) {
        void onApprove(current);
      } else if (e.key.toLowerCase() === 'r' && current) {
        setRejectMode(true);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, rows.length, onApprove]);

  const isPdf = current?.fileUrl?.toLowerCase().endsWith('.pdf') ?? false;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline p-12 text-center">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          All documents reviewed
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing left in the queue. Switch back to the table view to look for new arrivals.
        </p>
        <Button onClick={onExit} className="mt-4">
          Back to table view
        </Button>
      </div>
    );
  }

  if (!current) {
    // index is past the end — show end state.
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline p-12 text-center">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          End of queue
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ve reached the end of the validation queue. Exit to the table view to review skipped items or refresh for new arrivals.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => setIndex(0)}>
            Back to start
          </Button>
          <Button onClick={onExit}>Back to table view</Button>
        </div>
      </div>
    );
  }

  const key = `${current.enroleeNumber}::${current.slotKey}`;
  const busy = actingKey === key;
  const canConfirmReject = rejectReason.trim().length >= REJECT_MIN_CHARS;

  return (
    <div className="space-y-4">
      {/* Header: counter + mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onExit}>
            ← Back to table
          </Button>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {index + 1} of {rows.length}
          </span>
        </div>
        {headerToggle}
      </div>

      {/* Two-pane layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Preview */}
        <div className="rounded-xl border border-hairline bg-card p-2">
          {isPdf ? (
            <iframe
              src={current.fileUrl}
              title="Document preview"
              className="h-[70vh] w-full rounded-lg"
              sandbox="allow-same-origin"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.fileUrl}
              alt="Document preview"
              className="mx-auto max-h-[70vh] w-auto object-contain"
            />
          )}
          <a
            href={current.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-center text-xs text-primary hover:underline"
          >
            Open in new tab
          </a>
        </div>

        {/* Right panel */}
        <div className="space-y-4 rounded-xl border border-hairline bg-card p-4">
          <div className="space-y-1">
            <h3 className="font-serif text-base font-semibold text-foreground">
              {current.fullName}
            </h3>
            <div className="font-mono text-[11px] text-muted-foreground">
              {current.enroleeNumber}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{current.slotLabel}</Badge>
            {current.isExpirable && <Badge variant="warning">Expires</Badge>}
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              disabled={busy}
              onClick={() => void onApprove(current)}
            >
              <CheckIcon className="mr-2 size-4" />
              Approve
            </Button>
            {!rejectMode ? (
              <Button
                className="w-full"
                size="lg"
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setRejectMode(true);
                  setTimeout(() => textareaRef.current?.focus(), 0);
                }}
              >
                <XIcon className="mr-2 size-4" />
                Reject
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-hairline bg-muted/20 p-3">
                <Textarea
                  ref={textareaRef}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why are you rejecting this document? The parent will receive this message."
                  rows={4}
                />
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={cn(
                      canConfirmReject ? 'text-brand-mint' : 'text-muted-foreground',
                    )}
                  >
                    {rejectReason.trim().length} / {REJECT_MIN_CHARS} min characters
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setRejectMode(false);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={!canConfirmReject || busy}
                    onClick={() => void onReject(current, rejectReason.trim())}
                  >
                    Confirm rejection
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-2 border-t border-hairline pt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeftIcon className="mr-1 size-3.5" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setIndex((i) => Math.min(rows.length - 1, i + 1))}
            >
              <SkipForwardIcon className="mr-1 size-3.5" />
              Skip
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={index === rows.length - 1}
              onClick={() => setIndex((i) => Math.min(rows.length - 1, i + 1))}
            >
              Next
              <ArrowRightIcon className="ml-1 size-3.5" />
            </Button>
          </div>

          {/* Keyboard hint */}
          <p className="text-[11px] text-muted-foreground">
            Keyboard: ← prev · → next · A approve · R reject
          </p>
        </div>
      </div>
    </div>
  );
}
