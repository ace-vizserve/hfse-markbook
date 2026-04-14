'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, LockOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function LockToggle({
  sheetId,
  isLocked,
  lockedBy,
  lockedAt,
}: {
  sheetId: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const action = isLocked ? 'unlock' : 'lock';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this sheet?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grading-sheets/${sheetId}/${action}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `${action} failed`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isLocked && (
        <div className="text-xs text-muted-foreground">
          Locked {lockedAt && new Date(lockedAt).toLocaleString()} by {lockedBy ?? '—'}
        </div>
      )}
      <Button
        onClick={toggle}
        disabled={busy}
        size="sm"
        variant={isLocked ? 'outline' : 'default'}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isLocked ? (
          <LockOpen className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        {isLocked ? 'Unlock sheet' : 'Lock sheet'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
