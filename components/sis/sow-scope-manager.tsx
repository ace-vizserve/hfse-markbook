'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CURRICULUM_TRACK_LABELS, type CurriculumTrack } from '@/lib/schemas/section';

export type ScopeEntry = {
  id: string;
  level_id: string;
  curriculum_track: string;
  subject_id: string;
  sort_order: number;
};

export type LevelOption = { id: string; code: string; label: string; level_type: string };
export type SubjectOption = { id: string; code: string; name: string };

type TrackGroup = {
  levelId: string;
  levelCode: string;
  levelLabel: string;
  levelType: string;
  track: CurriculumTrack;
  subjects: Array<{ scopeId: string; subjectId: string; subjectCode: string; subjectName: string }>;
};

function buildGroups(
  scopes: ScopeEntry[],
  levels: LevelOption[],
  subjects: SubjectOption[],
): TrackGroup[] {
  const levelMap = new Map(levels.map((l) => [l.id, l]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const groupMap = new Map<string, TrackGroup>();
  for (const scope of scopes) {
    const level = levelMap.get(scope.level_id);
    if (!level) continue;
    const key = `${scope.level_id}:${scope.curriculum_track}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        levelId: scope.level_id,
        levelCode: level.code,
        levelLabel: level.label,
        levelType: level.level_type,
        track: scope.curriculum_track as CurriculumTrack,
        subjects: [],
      });
    }
    const sub = subjectMap.get(scope.subject_id);
    if (sub) {
      groupMap.get(key)!.subjects.push({
        scopeId: scope.id,
        subjectId: scope.subject_id,
        subjectCode: sub.code,
        subjectName: sub.name,
      });
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.levelCode !== b.levelCode) return a.levelCode.localeCompare(b.levelCode);
    return a.track.localeCompare(b.track);
  });
}

export function SowScopeManager({
  initialScopes,
  levels,
  subjects,
}: {
  initialScopes: ScopeEntry[];
  levels: LevelOption[];
  subjects: SubjectOption[];
}) {
  const [scopes, setScopes] = useState<ScopeEntry[]>(initialScopes);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const groups = buildGroups(scopes, levels, subjects);

  const addSubject = (levelId: string, track: CurriculumTrack, subjectId: string) => {
    startTransition(async () => {
      const res = await fetch('/api/sis/admin/sow/scopes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level_id: levelId, curriculum_track: track, subject_id: subjectId }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; id?: string };
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to add subject');
        return;
      }
      const sub = subjects.find((s) => s.id === subjectId)!;
      const key = `${levelId}:${track}`;
      const existingGroup = groups.find((g) => `${g.levelId}:${g.track}` === key);
      const newEntry: ScopeEntry = {
        id: json.id!,
        level_id: levelId,
        curriculum_track: track,
        subject_id: subjectId,
        sort_order: existingGroup ? existingGroup.subjects.length : 0,
      };
      setScopes((prev) => [...prev, newEntry]);
      toast.success(`${sub.name} added to scope`);
    });
  };

  const removeSubject = (scopeId: string, levelId: string, track: CurriculumTrack, subjectId: string) => {
    startTransition(async () => {
      const res = await fetch('/api/sis/admin/sow/scopes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level_id: levelId, curriculum_track: track, subject_id: subjectId }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        toast.error(json.error ?? 'Failed to remove subject');
        return;
      }
      setScopes((prev) => prev.filter((s) => s.id !== scopeId));
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="space-y-0.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Curriculum setup
          </p>
          <p className="text-sm font-medium text-foreground">
            Subject scope by level &amp; track
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </Badge>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Declare which subjects each level and track combination teaches. The SOW builder filters
            its subject list based on this when you pick a section.
          </p>

          <div className="space-y-4">
            {groups.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No scope entries yet. Add subjects below.
              </p>
            ) : (
              groups.map((group) => (
                <TrackGroupRow
                  key={`${group.levelId}:${group.track}`}
                  group={group}
                  allSubjects={subjects}
                  onAdd={(subjectId) => addSubject(group.levelId, group.track, subjectId)}
                  onRemove={(scopeId, subjectId) => removeSubject(scopeId, group.levelId, group.track, subjectId)}
                  isPending={isPending}
                />
              ))
            )}
          </div>

          {/* Add a new scope group (level + track combination not yet present) */}
          <AddScopeGroupRow
            levels={levels}
            subjects={subjects}
            existingGroups={groups}
            onAdd={addSubject}
            isPending={isPending}
          />
        </div>
      )}
    </div>
  );
}

function TrackGroupRow({
  group,
  allSubjects,
  onAdd,
  onRemove,
  isPending,
}: {
  group: TrackGroup;
  allSubjects: SubjectOption[];
  onAdd: (subjectId: string) => void;
  onRemove: (scopeId: string, subjectId: string) => void;
  isPending: boolean;
}) {
  const [addValue, setAddValue] = useState('');
  const usedIds = new Set(group.subjects.map((s) => s.subjectId));
  const available = allSubjects.filter((s) => !usedIds.has(s.id));

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Badge
          variant="outline"
          className="h-5 border-border bg-card px-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground"
        >
          {group.levelCode}
        </Badge>
        <span className="text-[13px] font-medium text-foreground">{group.levelLabel}</span>
        <span className="text-[11px] text-muted-foreground">
          · {CURRICULUM_TRACK_LABELS[group.track]}
        </span>
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {group.subjects.length === 0 ? (
          <span className="text-xs text-muted-foreground">No subjects — add one below</span>
        ) : (
          group.subjects.map((s) => (
            <span
              key={s.scopeId}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground"
            >
              {s.subjectCode}
              <button
                type="button"
                disabled={isPending}
                onClick={() => onRemove(s.scopeId, s.subjectId)}
                className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                aria-label={`Remove ${s.subjectName}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))
        )}
      </div>

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={addValue}
            onValueChange={setAddValue}
            disabled={isPending}
          >
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue placeholder="Add subject…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  <span className="font-mono">{s.code}</span>
                  <span className="ml-1.5">{s.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={!addValue || isPending}
            onClick={() => {
              if (!addValue) return;
              onAdd(addValue);
              setAddValue('');
            }}
          >
            <Plus className="size-3" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

const CURRICULUM_TRACKS_LIST: CurriculumTrack[] = ['singapore_inspired', 'cambridge', 'o_level'];

function AddScopeGroupRow({
  levels,
  subjects,
  existingGroups,
  onAdd,
  isPending,
}: {
  levels: LevelOption[];
  subjects: SubjectOption[];
  existingGroups: TrackGroup[];
  onAdd: (levelId: string, track: CurriculumTrack, subjectId: string) => void;
  isPending: boolean;
}) {
  const [levelId, setLevelId] = useState('');
  const [track, setTrack] = useState<CurriculumTrack | ''>('');
  const [subjectId, setSubjectId] = useState('');

  const existingKey = levelId && track ? `${levelId}:${track}` : null;
  const groupAlreadyExists = existingKey
    ? existingGroups.some((g) => `${g.levelId}:${g.track}` === existingKey)
    : false;

  if (groupAlreadyExists) return null;

  const nonPreschoolLevels = levels.filter((l) => l.level_type !== 'preschool');

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Add new scope group
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={levelId} onValueChange={(v) => { setLevelId(v); setSubjectId(''); }}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Level…" />
          </SelectTrigger>
          <SelectContent>
            {nonPreschoolLevels.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">
                <span className="font-mono">{l.code}</span>
                <span className="ml-1.5">{l.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={track} onValueChange={(v) => setTrack(v as CurriculumTrack)}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Curriculum track…" />
          </SelectTrigger>
          <SelectContent>
            {CURRICULUM_TRACKS_LIST.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {CURRICULUM_TRACK_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={subjectId} onValueChange={setSubjectId} disabled={!levelId || !track}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="First subject…" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                <span className="font-mono">{s.code}</span>
                <span className="ml-1.5">{s.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          disabled={!levelId || !track || !subjectId || isPending}
          onClick={() => {
            if (!levelId || !track || !subjectId) return;
            onAdd(levelId, track as CurriculumTrack, subjectId);
            setSubjectId('');
          }}
        >
          <Plus className="size-3" />
          Create group
        </Button>
      </div>
    </div>
  );
}
