'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  STP_APPLICATION_STATUS_OPTIONS,
  type StpApplicationStatus,
} from '@/lib/sis/queries';

// Single-Select editor for the new stpApplicationStatus column. Mounts
// inside <StpApplicationCard>. Patches the column via /api/sis/students/
// [enroleeNumber]/stp-status?ay=… on change; toast.success / toast.error
// surface the outcome and router.refresh() so the card re-renders with
// the new value baked in by the server.

export function StpStatusEditor({
  ayCode,
  enroleeNumber,
  initialStatus,
}: {
  ayCode: string;
  enroleeNumber: string;
  initialStatus: StpApplicationStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StpApplicationStatus | null>(initialStatus);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: StpApplicationStatus) {
    if (next === status) return;
    const prev = status;
    setStatus(next);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sis/students/${enroleeNumber}/stp-status?ay=${ayCode}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stpApplicationStatus: next }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      toast.success(`STP status updated to ${next}`);
      router.refresh();
    } catch (e) {
      // Roll back the optimistic update on failure.
      setStatus(prev);
      toast.error(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={status ?? undefined}
        onValueChange={(v) => void handleChange(v as StpApplicationStatus)}
        disabled={saving}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Set status…" />
        </SelectTrigger>
        <SelectContent>
          {STP_APPLICATION_STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
