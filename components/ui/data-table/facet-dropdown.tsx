'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type FacetDropdownProps = {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
};

export function FacetDropdown({
  label,
  options,
  selected,
  onChange,
  searchable = true,
}: FacetDropdownProps) {
  const selectedSet = new Set(selected);
  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {label}
          {selected.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-mono text-[10px]"
              >
                {selected.length}
              </Badge>
            </>
          )}
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={label} />}
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isOn = selectedSet.has(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => toggle(opt.value)}
                  >
                    <span
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        isOn
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50'
                      )}
                    >
                      {isOn && <Check className="h-3 w-3" />}
                    </span>
                    <span>{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center text-xs"
                  >
                    <X className="mr-1 h-3 w-3" /> Clear
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
