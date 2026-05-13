'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { GraduationCap, Loader2, Users } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type LevelOption = { id: string; label: string };
type SectionOption = { id: string; name: string };

export function MasterfileToolbar({
  levels,
  selectedLevelId,
  sections,
  selectedSectionId,
}: {
  levels: LevelOption[];
  selectedLevelId: string | null;
  sections: SectionOption[];
  selectedSectionId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onLevelChange(levelId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('level', levelId);
    // Reset class filter — sections are level-scoped, the previous class
    // wouldn't exist at the new level.
    next.delete('class');
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  function onClassChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === '__all__') {
      next.delete('class');
    } else {
      next.set('class', value);
    }
    startTransition(() => {
      router.push(`?${next.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Level
        </span>
        <Select value={selectedLevelId ?? ''} onValueChange={onLevelChange}>
          <SelectTrigger className="h-9 w-[180px]">
            <div className="flex items-center gap-2">
              {pending ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <GraduationCap className="size-4 text-muted-foreground" />
              )}
              <SelectValue placeholder="Pick a level" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Class
        </span>
        <Select
          value={selectedSectionId ?? '__all__'}
          onValueChange={onClassChange}
          disabled={sections.length === 0}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <SelectValue
                placeholder={sections.length === 0 ? 'No classes' : 'All classes'}
              />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All classes</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
