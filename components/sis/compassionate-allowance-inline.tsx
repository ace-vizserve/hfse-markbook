'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEFAULT_ALLOWANCE = 5;

export function CompassionateAllowanceInline({
  enroleeNumber,
  initial,
  disabled,
  disabledReason,
}: {
  enroleeNumber: string;
  initial: number | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const seed = initial ?? DEFAULT_ALLOWANCE;
  const [value, setValue] = useState<string>(String(seed));
  const [saving, setSaving] = useState(false);

  const numeric = Number(value);
  const valid = /^\d+$/.test(value) && numeric >= 0 && numeric <= 30;
  const dirty = valid && numeric !== seed;

  async function save() {
    if (!valid) {
      toast.error('Enter an integer between 0 and 30');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sis/students/${encodeURIComponent(enroleeNumber)}/allowance`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ allowance: numeric }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      toast.success(
        numeric === DEFAULT_ALLOWANCE
          ? 'Reset to default (5 days/year)'
          : `Allowance set to ${numeric} day${numeric === 1 ? '' : 's'}/year`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
      <div className="flex-1 min-w-[220px]">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Urgent / compassionate leave quota
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Days per AY that count against the compassionate-leave budget. HFSE
          default is 5.
          {disabled && disabledReason && (
            <span className="ml-1 text-destructive">· {disabledReason}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
          disabled={disabled || saving}
          className="h-9 w-20 text-right font-mono tabular-nums"
          aria-label="Allowance days per year"
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          days / year
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || saving || !dirty}
          onClick={save}
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Save
        </Button>
        {seed !== DEFAULT_ALLOWANCE && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || saving}
            onClick={() => setValue(String(DEFAULT_ALLOWANCE))}
            title={`Reset to default (${DEFAULT_ALLOWANCE})`}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
