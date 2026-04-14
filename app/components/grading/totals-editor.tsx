'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Minus, Pencil, Plus, Save, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Props = {
  sheetId: string;
  wwTotals: number[];
  ptTotals: number[];
  qaTotal: number | null;
  wwMaxSlots: number;
  ptMaxSlots: number;
  isLocked: boolean;
};

export function TotalsEditor({
  sheetId,
  wwTotals: initialWw,
  ptTotals: initialPt,
  qaTotal: initialQa,
  wwMaxSlots,
  ptMaxSlots,
  isLocked,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ww, setWw] = useState<number[]>(initialWw);
  const [pt, setPt] = useState<number[]>(initialPt);
  const [qa, setQa] = useState<number | null>(initialQa);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setWw(initialWw);
    setPt(initialPt);
    setQa(initialQa);
    setError(null);
  }

  function updateAt(arr: number[], setArr: (v: number[]) => void, i: number, v: number) {
    const next = arr.slice();
    next[i] = v;
    setArr(next);
  }

  function addSlot(arr: number[], setArr: (v: number[]) => void, cap: number) {
    if (arr.length >= cap) return;
    const def = arr.length > 0 ? arr[arr.length - 1] : 10;
    setArr([...arr, def]);
  }

  function removeSlot(arr: number[], setArr: (v: number[]) => void) {
    if (arr.length === 0) return;
    setArr(arr.slice(0, -1));
  }

  async function save() {
    const shrinking = ww.length < initialWw.length || pt.length < initialPt.length;
    if (shrinking) {
      const ok = confirm(
        'Removing slots will delete any scores entered in those slots for every student. Continue?',
      );
      if (!ok) return;
    }

    let approval_reference: string | undefined;
    if (isLocked) {
      const entered = window.prompt(
        'This sheet is locked. Enter the approval reference for the totals change:',
        '',
      );
      if (!entered || !entered.trim()) {
        setError('approval reference required');
        return;
      }
      approval_reference = entered.trim();
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grading-sheets/${sheetId}/totals`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ww_totals: ww,
          pt_totals: pt,
          qa_total: qa,
          ...(approval_reference ? { approval_reference } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit totals & slots
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Edit totals & slots</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <SlotSection
          label="Written Works"
          prefix="W"
          values={ww}
          onChangeAt={(i, v) => updateAt(ww, setWw, i, v)}
          onAdd={() => addSlot(ww, setWw, wwMaxSlots)}
          onRemove={() => removeSlot(ww, setWw)}
          cap={wwMaxSlots}
        />

        <SlotSection
          label="Performance Tasks"
          prefix="PT"
          values={pt}
          onChangeAt={(i, v) => updateAt(pt, setPt, i, v)}
          onAdd={() => addSlot(pt, setPt, ptMaxSlots)}
          onRemove={() => removeSlot(pt, setPt)}
          cap={ptMaxSlots}
        />

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Quarterly Assessment
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">QA max</span>
            <Input
              type="number"
              min={1}
              value={qa ?? ''}
              onChange={(e) => setQa(e.target.value === '' ? null : Number(e.target.value))}
              className="h-9 w-24 text-right tabular-nums"
            />
          </label>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            {isLocked
              ? 'Sheet is locked — you will be prompted for an approval reference.'
              : 'All students grades will be recomputed against the new denominators.'}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={busy}>
              Reset
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {busy ? 'Saving…' : 'Save totals'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SlotSection({
  label,
  prefix,
  values,
  onChangeAt,
  onAdd,
  onRemove,
  cap,
}: {
  label: string;
  prefix: string;
  values: number[];
  onChangeAt: (i: number, v: number) => void;
  onAdd: () => void;
  onRemove: () => void;
  cap: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label} ({values.length} / {cap})
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemove}
            disabled={values.length === 0}
          >
            <Minus className="h-3.5 w-3.5" />
            Remove
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAdd}
            disabled={values.length >= cap}
          >
            <Plus className="h-3.5 w-3.5" />
            Add slot
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {values.length === 0 && (
          <div className="text-xs text-muted-foreground">no slots</div>
        )}
        {values.map((v, i) => (
          <label key={i} className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">
              {prefix}
              {i + 1}
            </span>
            <Input
              type="number"
              min={1}
              value={v}
              onChange={(e) => onChangeAt(i, Number(e.target.value))}
              className="h-9 w-20 text-right tabular-nums"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
