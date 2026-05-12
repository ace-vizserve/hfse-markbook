'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownAZ, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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

// Pain point #9: re-assign section_students.index_number 1..N alphabetically.
// Mounted on the SIS Admin section detail page (/sis/sections/[id]) so the
// registrar can clean up index ordering after a batch of late enrolments
// pushed new students to the bottom.
//
// Confirm dialog because this RENUMBERS every active row — registrars
// reading a printed roster with the old indexes would see all the numbers
// shift. Index numbers don't FK anywhere (they're display labels only),
// so the operation is safe internally; the dialog just makes the impact
// explicit.
export function RealphabetizeRosterButton({
  sectionId,
  sectionName,
}: {
  sectionId: string;
  sectionName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sections/${sectionId}/realphabetize`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows_renumbered?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Re-numbering failed.');
        return;
      }
      toast.success(
        `Re-numbered ${data.rows_renumbered ?? 0} student${
          data.rows_renumbered === 1 ? '' : 's'
        } in ${sectionName} alphabetically.`,
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-numbering failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <ArrowDownAZ className="mr-1 h-3.5 w-3.5" />
          Re-number alphabetically
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-number {sectionName} alphabetically?</AlertDialogTitle>
          <AlertDialogDescription>
            Every student in this section will be re-assigned an index number
            in alphabetical order (last name, first name). Active and
            late-enrolled students come first; withdrawn students keep their
            relative order at the bottom of the roster.
            <br />
            <br />
            Existing grade entries, attendance, and evaluations are{' '}
            <strong>not affected</strong> — they reference each student
            internally, not by index number. The change is logged in the
            audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Re-number
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
