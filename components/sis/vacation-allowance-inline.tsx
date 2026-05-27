'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// KD #94 — vacation-leave per-term allowance override.
// `initial = null` means the student is on the school-wide default; we display
// the school default as the seed value but the Save action only sends when the
// user types a different number. Reset writes `null` back, removing the
// override so any future change to the school default propagates automatically.
export function VacationAllowanceInline({
  enroleeNumber,
  initial,
  schoolDefault,
  disabled,
  disabledReason,
}: {
  enroleeNumber: string;
  initial: number | null;
  schoolDefault: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const effective = initial ?? schoolDefault;
  const [value, setValue] = useState<string>(String(effective));
  const [saving, setSaving] = useState(false);

  const numeric = Number(value);
  const valid = /^\d+$/.test(value) && numeric >= 0 && numeric <= 10;
  const dirty = valid && numeric !== effective;
  const hasOverride = initial !== null;

  async function persist(vlAllowance: number | null) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sis/students/${encodeURIComponent(enroleeNumber)}/vl-allowance`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ vlAllowance }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      if (vlAllowance === null) {
        toast.success(
          `Reset — now using school default (${schoolDefault} per term)`
        );
      } else {
        toast.success(`Vacation leave set to ${vlAllowance} per term`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!valid) {
      toast.error('Enter a whole number between 0 and 10');
      return;
    }
    persist(numeric);
  }

  function resetToSchoolDefault() {
    setValue(String(schoolDefault));
    void persist(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
      <div className="flex-1 min-w-[220px]">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Vacation leave quota
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Vacation leave days per term. School default is {schoolDefault}.
          {hasOverride && (
            <span className="ml-1 font-medium text-foreground">
              · Custom override
            </span>
          )}
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
          aria-label="Allowance days per term"
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          days / term
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
        {hasOverride && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || saving}
            onClick={resetToSchoolDefault}
            title={`Reset to school default (${schoolDefault})`}
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
