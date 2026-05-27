'use client';

import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const REJECT_MIN_CHARS = 20;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotLabel: string;
  studentName: string;
  onConfirm: (reason: string) => Promise<void> | void;
};

export function RejectDialog({
  open,
  onOpenChange,
  slotLabel,
  studentName,
  onConfirm,
}: Props) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setReason('');
      setBusy(false);
    }
  }, [open]);

  const canConfirm = reason.trim().length >= REJECT_MIN_CHARS;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject {slotLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {studentName} will be notified by email with the reason below. The
            parent can re-upload after seeing the message.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you rejecting this document?"
            rows={4}
          />
          <p
            className={cn(
              'text-[11px]',
              canConfirm ? 'text-brand-mint' : 'text-muted-foreground'
            )}
          >
            {reason.trim().length} / {REJECT_MIN_CHARS} min characters
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={!canConfirm || busy}
          >
            {busy ? 'Rejecting…' : 'Reject document'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
