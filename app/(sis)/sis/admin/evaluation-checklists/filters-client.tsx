"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// URL-driven Select trio for the read-only checklist audit view. Radix
// SelectItem doesn't compose with `asChild` — its internal ItemText +
// indicator span fight the user's child element — so navigation runs
// via `onValueChange` + `router.replace` instead of <Link> children.

type Option = { id: string; label: string; subLabel?: string | null };

export function ChecklistFilters({
  termOptions,
  subjectOptions,
  sectionOptions,
  selectedTermId,
  selectedSubjectId,
  selectedSectionId,
}: {
  termOptions: Option[];
  subjectOptions: Option[];
  sectionOptions: Option[];
  selectedTermId: string;
  selectedSubjectId: string;
  selectedSectionId: string;
}) {
  const router = useRouter();

  function navigate(next: { termId?: string; subjectId?: string; sectionId?: string }) {
    const params = new URLSearchParams();
    const term_id = next.termId ?? selectedTermId;
    const subject_id = next.subjectId ?? selectedSubjectId;
    const section_id = next.sectionId ?? selectedSectionId;
    if (term_id) params.set("term_id", term_id);
    if (subject_id) params.set("subject_id", subject_id);
    if (section_id) params.set("section_id", section_id);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Term
        </label>
        <Select
          value={selectedTermId || undefined}
          onValueChange={(v) => navigate({ termId: v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select a term" />
          </SelectTrigger>
          <SelectContent>
            {termOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Subject
        </label>
        <Select
          value={selectedSubjectId || undefined}
          onValueChange={(v) => navigate({ subjectId: v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select a subject" />
          </SelectTrigger>
          <SelectContent>
            {subjectOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
                {s.subLabel && (
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {s.subLabel}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Section
        </label>
        <Select
          value={selectedSectionId || undefined}
          onValueChange={(v) => navigate({ sectionId: v })}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select a section" />
          </SelectTrigger>
          <SelectContent>
            {sectionOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
                {s.subLabel && (
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {s.subLabel}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
