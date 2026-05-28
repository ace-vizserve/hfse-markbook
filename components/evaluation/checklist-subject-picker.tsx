'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SubjectOption = { id: string; code: string; name: string };

// Standalone subject picker for the Checklists tab.
export function ChecklistSubjectPicker({
  subjects,
  selectedSubjectId,
}: {
  subjects: SubjectOption[];
  selectedSubjectId: string;
}) {
  function switchSubject(next: string) {
    if (next === selectedSubjectId) return;
    const qs = new URLSearchParams(window.location.search);
    qs.set('subject_id', next);
    qs.set('tab', 'checklists');
    window.location.search = qs.toString();
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="subject-picker-locked"
        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        Subject
      </label>
      <Select value={selectedSubjectId} onValueChange={switchSubject}>
        <SelectTrigger id="subject-picker-locked" className="h-10 w-[260px]">
          <SelectValue placeholder="Pick a subject" />
        </SelectTrigger>
        <SelectContent>
          {subjects.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                {s.code}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
