"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TermOption = {
  id: string;
  label: string;
  term_number: number;
  is_current: boolean;
};

export function TermSwitcher({ current, options }: { current: string; options: readonly TermOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(termId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("term_id", termId);
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-max">
        <div className="flex items-center gap-2">
          {pending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <CalendarDays className="size-4 text-muted-foreground" />
          )}
          <SelectValue placeholder="Select term" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <SelectItem value={current} disabled>
            No terms
          </SelectItem>
        ) : (
          options.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.label}
              {t.is_current ? " (current)" : ""}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
