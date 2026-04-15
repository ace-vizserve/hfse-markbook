'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export function MyRequestsCancelButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed to cancel');
      toast.success('Request cancelled');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
          <AlertDialogDescription>
            This will withdraw the request from the administrator&apos;s review
            queue. You can file a new one if you change your mind.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep request</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void cancel()}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
