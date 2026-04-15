'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type Action = 'approve' | 'reject';

export function ChangeRequestDecisionButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>('approve');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function openDialog(next: Action) {
    setAction(next);
    setNote('');
    setOpen(true);
  }

  const rejectNeedsNote = action === 'reject' && note.trim().length === 0;

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          decision_note: note.trim() ? note.trim() : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      toast.success(action === 'approve' ? 'Request approved' : 'Request declined');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit decision');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => openDialog('reject')}>
          <X className="size-3" />
          Decline
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => openDialog('approve')}>
          <Check className="size-3" />
          Approve
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve this request?' : 'Decline this request?'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve'
                ? 'The registrar will be notified and can apply the change on the locked sheet. The teacher is also notified.'
                : 'The teacher will be notified with the reason you provide below. This decision is terminal — the teacher will need to file a new request.'}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decision-note">
              Decision note{' '}
              <span className="text-muted-foreground">
                ({action === 'reject' ? 'required' : 'optional'})
              </span>
            </FieldLabel>
            <Textarea
              id="decision-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === 'reject'
                  ? 'Explain why this request is being declined.'
                  : 'Optional note to the teacher and registrar.'
              }
              rows={4}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || rejectNeedsNote}
              className={action === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action === 'approve' ? 'Approve' : 'Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
