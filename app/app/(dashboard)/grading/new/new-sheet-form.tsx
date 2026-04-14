'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Term = { id: string; term_number: number; label: string; is_current: boolean };
type Level = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };
type Section = { id: string; name: string; level: Level | Level[] | null };
type Subject = { id: string; code: string; name: string; is_examinable: boolean };
type Config = { subject_id: string; level_id: string; ww_max_slots: number; pt_max_slots: number };

const first = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? v[0] ?? null : v ?? null;

export function NewSheetForm({
  terms,
  sections,
  subjects,
  configs,
}: {
  terms: Term[];
  sections: Section[];
  subjects: Subject[];
  configs: Config[];
}) {
  const router = useRouter();
  const defaultTerm = terms.find((t) => t.is_current) ?? terms[0];

  const [termId, setTermId] = useState(defaultTerm?.id ?? '');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [wwSlots, setWwSlots] = useState(3);
  const [wwEach, setWwEach] = useState(10);
  const [ptSlots, setPtSlots] = useState(3);
  const [ptEach, setPtEach] = useState(10);
  const [qaTotal, setQaTotal] = useState(50);
  const [teacherName, setTeacherName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sectionLevelId = useMemo(() => {
    const sec = sections.find((s) => s.id === sectionId);
    return first(sec?.level ?? null)?.id ?? null;
  }, [sections, sectionId]);

  const allowedSubjectIds = useMemo(() => {
    if (!sectionLevelId) return new Set<string>();
    return new Set(configs.filter((c) => c.level_id === sectionLevelId).map((c) => c.subject_id));
  }, [configs, sectionLevelId]);

  const sectionsGrouped = useMemo(() => {
    const map = new Map<string, Section[]>();
    for (const s of sections) {
      const label = first(s.level)?.label ?? 'Unknown';
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sections]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/grading-sheets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          term_id: termId,
          section_id: sectionId,
          subject_id: subjectId,
          ww_totals: Array(wwSlots).fill(wwEach),
          pt_totals: Array(ptSlots).fill(ptEach),
          qa_total: qaTotal,
          teacher_name: teacherName.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      router.push(`/grading/${body.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="term">Term</Label>
            <Select value={termId} onValueChange={setTermId} required>
              <SelectTrigger id="term">
                <SelectValue placeholder="— pick a term —" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="section">Section</Label>
            <Select
              value={sectionId}
              onValueChange={(v) => {
                setSectionId(v);
                setSubjectId('');
              }}
              required
            >
              <SelectTrigger id="section">
                <SelectValue placeholder="— pick a section —" />
              </SelectTrigger>
              <SelectContent>
                {sectionsGrouped.map(([label, list]) => (
                  <SelectGroup key={label}>
                    <SelectLabel>{label}</SelectLabel>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Select
              value={subjectId}
              onValueChange={setSubjectId}
              required
              disabled={!sectionId}
            >
              <SelectTrigger id="subject">
                <SelectValue
                  placeholder={sectionId ? '— pick a subject —' : '— pick a section first —'}
                />
              </SelectTrigger>
              <SelectContent>
                {subjects
                  .filter((s) => allowedSubjectIds.has(s.id))
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {!s.is_examinable && '(letter grade)'}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Written Works: slots" value={wwSlots} setValue={setWwSlots} min={0} max={5} />
            <NumberField label="Written Works: max each" value={wwEach} setValue={setWwEach} min={1} />
            <NumberField label="Performance Tasks: slots" value={ptSlots} setValue={setPtSlots} min={0} max={5} />
            <NumberField label="Performance Tasks: max each" value={ptEach} setValue={setPtEach} min={1} />
            <NumberField label="Quarterly Assessment: max" value={qaTotal} setValue={setQaTotal} min={1} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="teacher">Teacher name (optional)</Label>
            <Input
              id="teacher"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Button type="submit" disabled={busy || !termId || !sectionId || !subjectId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {busy ? 'Creating…' : 'Create grading sheet'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function NumberField({
  label,
  value,
  setValue,
  min,
  max,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const id = `num-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => setValue(Number(e.target.value))}
      />
    </div>
  );
}
