'use client';

import { CalendarRange, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { CompareInput } from '@/lib/dashboard/compare';

export type CompareToolbarProps = {
  kind: 'term' | 'month';
  ayCodes: readonly string[];
  initial: CompareInput | null;
  /** When kind='month', this many months back from today are listed. Default 24. */
  monthLookback?: number;
};

export function CompareToolbar({
  kind,
  ayCodes,
  initial,
  monthLookback = 24,
}: CompareToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [selectedAys, setSelectedAys] = useState<string[]>(initial?.ays ?? []);
  const [selectedCells, setSelectedCells] = useState<string[]>(() => {
    if (!initial) return [];
    if (initial.kind === 'term') return initial.terms.map((t) => `T${t}`);
    return initial.months;
  });

  const monthOptions = (() => {
    if (kind !== 'month') return [];
    const out: string[] = [];
    const t = new Date();
    for (let i = 0; i < monthLookback; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  })();

  function applyParams() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('ays', selectedAys.join(','));
    if (kind === 'term') {
      params.set('terms', selectedCells.join(','));
      params.delete('months');
    } else {
      params.set('months', selectedCells.join(','));
      params.delete('terms');
    }
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  function toggle(arr: string[], v: string): string[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  const canApply = selectedAys.length > 0 && selectedCells.length > 0;

  const cellOptions = kind === 'term' ? ['T1', 'T2', 'T3', 'T4'] : monthOptions;
  const cellLabel = (v: string) => {
    if (kind === 'term') return v;
    const [y, m] = v.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {/* AY multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-10 min-w-[10rem] justify-between gap-2 font-normal"
          >
            <CalendarRange className="size-4 text-muted-foreground" />
            <span className="font-mono text-[12px]">
              {selectedAys.length === 0
                ? 'Pick AYs…'
                : `${selectedAys.length} AY${selectedAys.length === 1 ? '' : 's'}`}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder="Filter AYs…" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {ayCodes.map((code) => {
                  const selected = selectedAys.includes(code);
                  return (
                    <CommandItem
                      key={code}
                      value={code}
                      onSelect={() => setSelectedAys((cur) => toggle(cur, code))}
                    >
                      <span
                        className={cn(
                          'mr-2 size-4 rounded border',
                          selected ? 'bg-primary border-primary' : 'border-border',
                        )}
                      />
                      <span className="font-mono">{code}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Term or Month multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-10 min-w-[10rem] justify-between gap-2 font-normal"
          >
            <span className="font-mono text-[12px]">
              {selectedCells.length === 0
                ? kind === 'term'
                  ? 'Pick terms…'
                  : 'Pick months…'
                : `${selectedCells.length} ${kind === 'term' ? 'term' : 'month'}${selectedCells.length === 1 ? '' : 's'}`}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command>
            {kind === 'month' && <CommandInput placeholder="Filter months…" />}
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {cellOptions.map((v) => {
                  const selected = selectedCells.includes(v);
                  return (
                    <CommandItem
                      key={v}
                      value={v}
                      onSelect={() => setSelectedCells((cur) => toggle(cur, v))}
                    >
                      <span
                        className={cn(
                          'mr-2 size-4 rounded border',
                          selected ? 'bg-primary border-primary' : 'border-border',
                        )}
                      />
                      <span className="font-mono">{cellLabel(v)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button size="sm" disabled={!canApply || pending} onClick={applyParams}>
        {pending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
        Apply
      </Button>
    </div>
  );
}
