'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type Props = {
  requestId: string;
};

// Undo a rejection within the 2-hour window. The PATCH endpoint enforces:
//   - only the rejecting approver can undo
//   - row must still be in 'rejected' status
//   - within 2 hours of primary_reviewed_at
// Server-side errors come back as plain-English text (no field names);
// the client surfaces them verbatim via toast.error.
export function UndoRejectionButton({ requestId }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function handleUndo() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/change-requests/${encodeURIComponent(requestId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'undo_rejection' }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'Could not undo the decline.', {
          description:
            res.status === 400 || res.status === 403 || res.status === 409
              ? undefined
              : 'Please try again or contact a system administrator.',
        });
        return;
      }
      toast.success('Decline undone — the request is back to Awaiting Review.');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Could not undo the decline.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo decline
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Undo this decline?</DialogTitle>
          <DialogDescription>
            The request will go back to Awaiting Review. The teacher will see
            the change. You have a 2-hour window from when you declined.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleUndo()}
            disabled={busy}
          >
            {busy ? 'Undoing…' : 'Undo decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
