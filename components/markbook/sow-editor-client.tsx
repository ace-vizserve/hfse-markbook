'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import type { ImportableSource, SowLabel, SowTopic } from '@/lib/sis/sow/queries';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  sectionId: string;
  subjectId: string;
  termId: string;
  sectionName: string;
  subjectName: string;
  subjectCode: string;
  termLabel: string;
  instanceId: string | null;
  initialWwLabels: SowLabel[];
  initialPtLabels: SowLabel[];
  initialTopics: SowTopic[];
  copiedFromSectionName: string | null;
  copiedAt: string | null;
  hasGradingSheet: boolean;
  isSheetLocked: boolean;
  importableSources: ImportableSource[];
  maxWwSlots: number;
  maxPtSlots: number;
};

type EditableLabel = { label: string; page: string };

function toEditable(labels: SowLabel[]): EditableLabel[] {
  return labels.map((l) => ({ label: l.label, page: l.page ?? '' }));
}

export function SowEditorClient({
  sectionId,
  subjectId,
  termId,
  instanceId,
  initialWwLabels,
  initialPtLabels,
  initialTopics,
  copiedFromSectionName,
  copiedAt,
  hasGradingSheet,
  isSheetLocked,
  importableSources,
  maxWwSlots,
  maxPtSlots,
}: Props) {
  const [wwLabels, setWwLabels] = useState<EditableLabel[]>(toEditable(initialWwLabels));
  const [ptLabels, setPtLabels] = useState<EditableLabel[]>(toEditable(initialPtLabels));
  const [topics, setTopics] = useState<string[]>(
    initialTopics.sort((a, b) => a.sort_order - b.sort_order).map((t) => t.text),
  );
  const [sowId, setSowId] = useState<string | null>(instanceId);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  function markDirty() {
    setIsDirty(true);
  }

  // ── Label helpers ────────────────────────────────────────────────────────────

  function addLabel(setter: typeof setWwLabels) {
    setter((prev) => [...prev, { label: '', page: '' }]);
    markDirty();
  }

  function removeLabel(setter: typeof setWwLabels, idx: number) {
    setter((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  function updateLabel(
    setter: typeof setWwLabels,
    idx: number,
    field: keyof EditableLabel,
    value: string,
  ) {
    setter((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
    markDirty();
  }

  // ── Topic helpers ────────────────────────────────────────────────────────────

  function addTopic() {
    setTopics((prev) => [...prev, '']);
    markDirty();
  }

  function removeTopic(idx: number) {
    setTopics((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  function updateTopic(idx: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === idx ? value : t)));
    markDirty();
  }

  function moveTopic(idx: number, direction: 'up' | 'down') {
    setTopics((prev) => {
      const next = [...prev];
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
    markDirty();
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    setIsSaving(true);
    try {
      const body = {
        section_id: sectionId,
        subject_id: subjectId,
        term_id: termId,
        ww_labels: wwLabels.map((l) => ({ label: l.label, page: l.page || null })),
        pt_labels: ptLabels.map((l) => ({ label: l.label, page: l.page || null })),
        topics: topics
          .map((text, i) => ({ text, sort_order: i }))
          .filter((t) => t.text.trim()),
      };
      const res = await fetch('/api/sow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error('Failed to save SOW');
        return;
      }
      const data = (await res.json()) as { id: string };
      setSowId(data.id);
      setIsDirty(false);
      toast.success('SOW saved');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Import from peer section ─────────────────────────────────────────────────

  async function importFrom(sourceSowId: string) {
    const source = importableSources.find((s) => s.sow_id === sourceSowId);
    if (!source) return;
    const res = await fetch('/api/sow/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_section_id: sectionId,
        source_section_id: source.section_id,
        subject_id: subjectId,
        term_id: termId,
      }),
    });
    if (!res.ok) {
      toast.error('Failed to import SOW');
      return;
    }
    const data = (await res.json()) as {
      id: string;
      ww_labels: SowLabel[];
      pt_labels: SowLabel[];
      topics: SowTopic[];
    };
    setSowId(data.id);
    setWwLabels(toEditable(data.ww_labels ?? []));
    setPtLabels(toEditable(data.pt_labels ?? []));
    setTopics(
      (data.topics ?? []).sort((a, b) => a.sort_order - b.sort_order).map((t) => t.text),
    );
    setIsDirty(false);
    toast.success(`Imported from ${source.section_name}`);
  }

  // ── Sync to grading sheet ────────────────────────────────────────────────────

  async function syncToSheet() {
    if (!sowId) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/sow/${sowId}/sync-to-grading-sheet`, { method: 'POST' });
      if (res.status === 423) {
        toast.error('Grading sheet is locked and cannot be updated.');
        return;
      }
      if (!res.ok) {
        toast.error('Failed to sync labels to grading sheet');
        return;
      }
      toast.success('WW/PT labels synced to grading sheet');
    } finally {
      setIsSyncing(false);
    }
  }

  // ── Seed eval topics ─────────────────────────────────────────────────────────

  async function seedTopics() {
    if (!sowId) return;
    setIsSeeding(true);
    try {
      const res = await fetch(`/api/sow/${sowId}/sync-to-eval`, { method: 'POST' });
      if (!res.ok) {
        toast.error('Failed to seed evaluation topics');
        return;
      }
      const data = (await res.json()) as { inserted: number };
      toast.success(
        data.inserted > 0
          ? `${data.inserted} topics seeded into evaluation checklist`
          : 'Topics already up to date in evaluation checklist',
      );
    } finally {
      setIsSeeding(false);
    }
  }

  const canSyncSheet = hasGradingSheet && !!sowId && !isDirty;
  const canSeedTopics = !!sowId && !isDirty;

  return (
    <div className="space-y-6">
      {/* Provenance banner */}
      {copiedFromSectionName && (
        <Alert>
          <Info className="size-4" />
          <AlertDescription>
            Imported from <span className="font-medium">{copiedFromSectionName}</span>
            {copiedAt && (
              <>
                {' '}
                on{' '}
                {new Date(copiedAt).toLocaleDateString('en-SG', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </>
            )}
            . You can edit the content below; the original section is unaffected.
          </AlertDescription>
        </Alert>
      )}

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={isSaving || !isDirty} className="gap-2">
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          Save SOW
        </Button>

        {importableSources.length > 0 && (
          <Select onValueChange={importFrom}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Import from section…" />
            </SelectTrigger>
            <SelectContent>
              {importableSources.map((src) => (
                <SelectItem key={src.sow_id} value={src.sow_id}>
                  {src.section_name}
                  <span className="ml-1.5 text-muted-foreground">
                    ({src.ww_count}WW · {src.pt_count}PT · {src.topic_count} topics)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasGradingSheet && (
          <Button
            variant="outline"
            onClick={syncToSheet}
            disabled={!canSyncSheet || isSyncing || isSheetLocked}
            title={isSheetLocked ? 'Grading sheet is locked' : isDirty ? 'Save first' : undefined}
            className="gap-2"
          >
            {isSyncing && <Loader2 className="size-3.5 animate-spin" />}
            Sync labels to grading sheet
          </Button>
        )}

        {sowId && (
          <Button
            variant="outline"
            onClick={seedTopics}
            disabled={!canSeedTopics || isSeeding}
            title={isDirty ? 'Save first' : undefined}
            className="gap-2"
          >
            {isSeeding && <Loader2 className="size-3.5 animate-spin" />}
            Seed eval topics
          </Button>
        )}
      </div>

      {isDirty && (
        <p className="text-xs text-muted-foreground">
          You have unsaved changes. Save before syncing to grading sheet or seeding topics.
        </p>
      )}

      {/* Written Works */}
      <LabelEditor
        title="Written Works"
        labels={wwLabels}
        maxSlots={maxWwSlots}
        onAdd={() => addLabel(setWwLabels)}
        onRemove={(i) => removeLabel(setWwLabels, i)}
        onUpdate={(i, f, v) => updateLabel(setWwLabels, i, f, v)}
      />

      {/* Performance Tasks */}
      <LabelEditor
        title="Performance Tasks"
        labels={ptLabels}
        maxSlots={maxPtSlots}
        onAdd={() => addLabel(setPtLabels)}
        onRemove={(i) => removeLabel(setPtLabels, i)}
        onUpdate={(i, f, v) => updateLabel(setPtLabels, i, f, v)}
      />

      {/* Evaluation Topics */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-lg">Evaluation Topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map((text, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <Input
                value={text}
                onChange={(e) => updateTopic(idx, e.target.value)}
                placeholder="Topic description"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => moveTopic(idx, 'up')}
                disabled={idx === 0}
                aria-label="Move up"
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => moveTopic(idx, 'down')}
                disabled={idx === topics.length - 1}
                aria-label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => removeTopic(idx)}
                aria-label="Remove topic"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTopic} className="gap-1.5">
            <Plus className="size-3.5" />
            Add topic
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function LabelEditor({
  title,
  labels,
  maxSlots,
  onAdd,
  onRemove,
  onUpdate,
}: {
  title: string;
  labels: EditableLabel[];
  maxSlots: number;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, field: keyof EditableLabel, value: string) => void;
}) {
  const canAdd = labels.length < maxSlots;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {labels.length === 0 && (
          <p className="text-sm text-muted-foreground">No {title.toLowerCase()} added yet.</p>
        )}
        {labels.map((lbl, idx) => (
          <div key={idx} className="flex items-end gap-3">
            <span className="mb-2 w-6 shrink-0 font-mono text-[10px] text-muted-foreground">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={lbl.label}
                onChange={(e) => onUpdate(idx, 'label', e.target.value)}
                placeholder={`${title.slice(0, 2)}${idx + 1} activity name`}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Page #</Label>
              <Input
                value={lbl.page}
                onChange={(e) => onUpdate(idx, 'page', e.target.value)}
                placeholder="e.g. 42"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="mb-0.5 size-9 shrink-0 text-destructive hover:text-destructive"
              onClick={() => onRemove(idx)}
              aria-label={`Remove ${title} ${idx + 1}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {canAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="gap-1.5">
            <Plus className="size-3.5" />
            Add {title === 'Written Works' ? 'WW' : 'PT'} activity
          </Button>
        )}
        {!canAdd && (
          <p className="text-xs text-muted-foreground">Maximum {maxSlots} activities reached.</p>
        )}
      </CardContent>
    </Card>
  );
}
