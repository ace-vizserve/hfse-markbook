'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_VALUES,
  WITHDRAWAL_REASON_MAX,
  type EnrollmentStatus,
} from '@/lib/schemas/enrolment';

type MidTermPayload = {
  termNumber: number;
  termLabel: string;
  sectionId: string;
  sectionStudentId: string;
};

export function EnrolmentEditSheet({
  sectionId,
  enrolmentId,
  initial,
  studentName,
  indexNumber,
  children,
}: {
  sectionId: string;
  enrolmentId: string;
  initial: {
    bus_no: string | null;
    classroom_officer_role: string | null;
    enrollment_status: EnrollmentStatus;
  };
  studentName: string;
  indexNumber: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busNo, setBusNo] = useState(initial.bus_no ?? '');
  const [officer, setOfficer] = useState(initial.classroom_officer_role ?? '');
  const [status, setStatus] = useState<EnrollmentStatus>(
    initial.enrollment_status
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [confirmReEnrol, setConfirmReEnrol] = useState(false);
  const [pendingMidTerm, setPendingMidTerm] = useState<MidTermPayload | null>(
    null
  );
  const [markAsLate, setMarkAsLate] = useState(true);
  const [applyingLate, setApplyingLate] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setBusNo(initial.bus_no ?? '');
      setOfficer(initial.classroom_officer_role ?? '');
      setStatus(initial.enrollment_status);
      setReason('');
      setPendingMidTerm(null);
    }
  }

  const isWithdrawing =
    status === 'withdrawn' && initial.enrollment_status !== 'withdrawn';
  const isReEnrolling =
    status !== 'withdrawn' && initial.enrollment_status === 'withdrawn';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isWithdrawing) {
      setConfirmWithdraw(true);
      return;
    }
    if (isReEnrolling) {
      setConfirmReEnrol(true);
      return;
    }
    void doSave();
  }

  async function doSave() {
    setConfirmWithdraw(false);
    setConfirmReEnrol(false);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        bus_no: busNo,
        classroom_officer_role: officer,
        enrollment_status: status,
      };
      if (isWithdrawing && reason.trim()) {
        body.reason = reason.trim();
      }
      const res = await fetch(
        `/api/sections/${sectionId}/students/${enrolmentId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resBody?.error ?? 'save failed');

      const lateTerm = (
        resBody as { lateEnrolleeTerm?: { termLabel: string } | null }
      ).lateEnrolleeTerm;
      const admissionsCascade = (
        resBody as {
          admissionsCascade?: { enroleeNumber: string; ayCode: string } | null;
        }
      ).admissionsCascade;
      const reEnrolment = (resBody as { reEnrolment?: boolean }).reEnrolment;

      const midTermPayload =
        (resBody as { midTermEnrolment?: MidTermPayload | null })
          .midTermEnrolment ?? null;

      if (reEnrolment) {
        toast.success(`Restored ${studentName} to active enrolment`);
      } else if (lateTerm?.termLabel) {
        toast.success(
          `Tagged ${studentName} as late enrollee · ${lateTerm.termLabel}`
        );
      } else if (status === 'late_enrollee') {
        toast.success(`Tagged ${studentName} as late enrollee · between terms`);
      } else if (admissionsCascade) {
        toast.success(
          `Withdrew ${studentName} · admissions also marked Withdrawn`
        );
      } else {
        toast.success(`Updated ${studentName}`);
      }

      if (reEnrolment && midTermPayload?.sectionId) {
        setPendingMidTerm(midTermPayload);
        setMarkAsLate(true);
        return;
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <ScrollArea className="h-full">
          <SheetHeader className="space-y-2 border-b border-border p-6">
            <SheetTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
              Edit enrolment
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">#{indexNumber}</span> ·{' '}
              {studentName}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="busNo">Bus number</Label>
                <Input
                  id="busNo"
                  value={busNo}
                  onChange={(e) => setBusNo(e.target.value)}
                  placeholder="e.g. SVC7"
                  maxLength={40}
                />
                <p className="text-[11px] text-muted-foreground">
                  Shown on the attendance sheet header. Leave blank if not
                  applicable.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="officer">Classroom officer role</Label>
                <Input
                  id="officer"
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder="e.g. HAPI HAUS"
                  maxLength={80}
                />
                <p className="text-[11px] text-muted-foreground">
                  Display-only. No reporting impact.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Enrolment status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as EnrollmentStatus)}
                >
                  <SelectTrigger id="status" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENROLLMENT_STATUS_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ENROLLMENT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Withdrawing sets the withdrawal date to today. Restoring to
                  Active reverses the admissions withdrawal. Pre-enrolment /
                  post-withdrawal scores stay as N/A.
                </p>
              </div>
            </div>

            <SheetFooter className="flex-row justify-end gap-2 border-t border-border p-6">
              <SheetClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Cancel
                </Button>
              </SheetClose>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </SheetFooter>
          </form>
        </ScrollArea>
      </SheetContent>

      {/* Withdrawal confirmation — includes optional reason textarea */}
      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw {studentName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the section roster and marks them as
              Withdrawn in admissions. Their grades, attendance, and history
              remain on file. To move them to another section instead, cancel
              and use the Move action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-1.5">
            <Label htmlFor="withdrawReason" className="text-sm font-medium">
              Reason{' '}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="withdrawReason"
              value={reason}
              onChange={(e) =>
                setReason(e.target.value.slice(0, WITHDRAWAL_REASON_MAX))
              }
              placeholder="e.g. Family relocation to another country"
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {reason.length} / {WITHDRAWAL_REASON_MAX} · Optional. Captured in
              the movements log for future reference.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void doSave()}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-enrolment confirmation */}
      <AlertDialog open={confirmReEnrol} onOpenChange={setConfirmReEnrol}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {studentName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the student to active enrolment and reverses the
              admissions withdrawal. Their grades and attendance history remain
              unchanged. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSave()}>
              Restore enrolment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mid-term late-enrollee prompt — fires after a successful re-enrolment
          in T2/T3/T4 where the registrar restored to 'active'. */}
      <AlertDialog
        open={pendingMidTerm !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPendingMidTerm(null);
            setOpen(false);
            router.refresh();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enrolling mid-year</AlertDialogTitle>
            <AlertDialogDescription>
              Today falls in <strong>{pendingMidTerm?.termLabel}</strong>. Most
              students who rejoin in {pendingMidTerm?.termLabel} are marked as
              late enrollees so the system knows to skip assessments that
              happened before they came back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <Checkbox
                checked={markAsLate}
                onCheckedChange={(v) => setMarkAsLate(v === true)}
                className="mt-0.5"
              />
              <span>
                Mark as <strong>late enrollee</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Assessments dated before today will be marked N/A on the
                  student&apos;s grading sheets.
                </span>
              </span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={applyingLate}
              onClick={() => {
                setPendingMidTerm(null);
                setOpen(false);
                router.refresh();
              }}
            >
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={applyingLate}
              onClick={async () => {
                if (!markAsLate || !pendingMidTerm) {
                  setPendingMidTerm(null);
                  setOpen(false);
                  router.refresh();
                  return;
                }
                setApplyingLate(true);
                try {
                  const res = await fetch(
                    `/api/sections/${pendingMidTerm.sectionId}/students/${pendingMidTerm.sectionStudentId}`,
                    {
                      method: 'PATCH',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({
                        enrollment_status: 'late_enrollee',
                      }),
                    }
                  );
                  if (!res.ok)
                    throw new Error('Failed to mark as late enrollee');
                  toast.success(
                    `Marked ${studentName} as late enrollee · ${pendingMidTerm.termLabel}`
                  );
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : 'Could not mark as late enrollee'
                  );
                } finally {
                  setApplyingLate(false);
                  setPendingMidTerm(null);
                  setOpen(false);
                  router.refresh();
                }
              }}
            >
              {applyingLate && <Loader2 className="size-3.5 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
