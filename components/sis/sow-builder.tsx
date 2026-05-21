"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { SowTopic } from "@/lib/schemas/sow";
import type { SowSlotDescriptor } from "@/lib/schemas/grading-sheet";

type AyRow = { id: string; ay_code: string; label: string; is_current: boolean };
type TermRow = { id: string; academic_year_id: string; label: string; term_number: number };
type SubjectRow = { id: string; code: string; name: string };
type LevelRow = { id: string; code: string; label: string };

type MasterRow = {
  id: string;
  topics: SowTopic[];
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  updated_at: string;
};

type PublishedVersion = {
  id: string;
  version_number: number;
  topics: SowTopic[];
  ww: (SowSlotDescriptor | null)[];
  pt: (SowSlotDescriptor | null)[];
  notes: string | null;
  published_at: string;
};

type Scope = {
  ay_id?: string;
  term_id?: string;
  subject_id?: string;
  level_id?: string;
};

type Props = {
  ays: AyRow[];
  terms: TermRow[];
  subjects: SubjectRow[];
  levels: LevelRow[];
  initialScope?: Scope;
};

const MAX_SLOTS = 5;
const MAX_TOPICS = 30;

function emptySlotArray(n: number): (SowSlotDescriptor | null)[] {
  return Array.from({ length: n }, () => null);
}

function buildSlotArray(
  existing: (SowSlotDescriptor | null)[],
  n: number,
): (SowSlotDescriptor | null)[] {
  const base = [...existing];
  while (base.length < n) base.push(null);
  return base.slice(0, n);
}

export function SowBuilder({ ays, terms, subjects, levels, initialScope }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Scope state
  const [ayId, setAyId] = useState(initialScope?.ay_id ?? ays.find((a) => a.is_current)?.id ?? "");
  const [termId, setTermId] = useState(initialScope?.term_id ?? "");
  const [subjectId, setSubjectId] = useState(initialScope?.subject_id ?? "");
  const [levelId, setLevelId] = useState(initialScope?.level_id ?? "");

  // Builder content state
  const [topics, setTopics] = useState<SowTopic[]>([]);
  const [ww, setWw] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [pt, setPt] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [slotLimits, setSlotLimits] = useState({ ww: MAX_SLOTS, pt: MAX_SLOTS });

  // Master + versions
  const [masterId, setMasterId] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<PublishedVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dirty, setDirty] = useState(false);

  // New topic input
  const [newTopicText, setNewTopicText] = useState("");
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const scopeComplete = !!(ayId && termId && subjectId && levelId);

  // Filter terms to selected AY
  const ayTerms = terms.filter((t) => t.academic_year_id === ayId);

  // Push scope to URL without full navigation
  const updateUrl = useCallback(
    (scope: Scope) => {
      const params = new URLSearchParams(searchParams.toString());
      if (scope.ay_id) params.set("ay_id", scope.ay_id); else params.delete("ay_id");
      if (scope.term_id) params.set("term_id", scope.term_id); else params.delete("term_id");
      if (scope.subject_id) params.set("subject_id", scope.subject_id); else params.delete("subject_id");
      if (scope.level_id) params.set("level_id", scope.level_id); else params.delete("level_id");
      params.delete("curriculum_track");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Load master template when scope is complete
  const loadScope = useCallback(async () => {
    if (!ayId || !termId || !subjectId || !levelId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ay_id: ayId,
        term_id: termId,
        subject_id: subjectId,
        level_id: levelId,
        curriculum_track: "singapore_inspired",
      });
      const res = await fetch(`/api/sis/admin/sow?${params}`);
      if (!res.ok) throw new Error("Failed to load SOW");
      const data = await res.json() as { master: MasterRow | null; versions: PublishedVersion[]; slotLimits?: { ww: number; pt: number } };
      const limits = { ww: data.slotLimits?.ww ?? MAX_SLOTS, pt: data.slotLimits?.pt ?? MAX_SLOTS };
      setSlotLimits(limits);
      if (data.master) {
        setMasterId(data.master.id);
        setTopics(data.master.topics ?? []);
        setWw(buildSlotArray(data.master.ww ?? [], limits.ww));
        setPt(buildSlotArray(data.master.pt ?? [], limits.pt));
      } else {
        setMasterId(null);
        setTopics([]);
        setWw(emptySlotArray(limits.ww));
        setPt(emptySlotArray(limits.pt));
      }
      setLatestVersion(data.versions?.[0] ?? null);
      setDirty(false);
    } catch {
      toast.error("Failed to load scheme of work");
    } finally {
      setLoading(false);
    }
  }, [ayId, termId, subjectId, levelId]);

  useEffect(() => {
    if (scopeComplete) loadScope();
  }, [scopeComplete, loadScope]);

  const handleSaveAndApply = async () => {
    if (!scopeComplete) return;
    setApplying(true);
    try {
      // Step 1: save / upsert master
      const saveRes = await fetch("/api/sis/admin/sow", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ay_id: ayId,
          term_id: termId,
          subject_id: subjectId,
          level_id: levelId,
          curriculum_track: "singapore_inspired",
          topics: topics.map((t, i) => ({ text: t.text, sort_order: i })),
          ww: ww.slice(0, slotLimits.ww),
          pt: pt.slice(0, slotLimits.pt),
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveRes.ok) throw new Error((saveJson as { error?: string }).error ?? "Save failed");
      const currentMasterId = (saveJson as { master: MasterRow }).master.id;
      setMasterId(currentMasterId);
      setDirty(false);

      // Step 2: publish a new version
      const pubRes = await fetch("/api/sis/admin/sow/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ master_id: currentMasterId }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) throw new Error((pubJson as { error?: string }).error ?? "Publish failed");
      const newVersion = (pubJson as { version: PublishedVersion }).version;
      setLatestVersion(newVersion);

      // Step 3: apply version to all matching sections
      const applyRes = await fetch("/api/sis/admin/sow/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published_version_id: newVersion.id }),
      });
      const applyJson = await applyRes.json();
      if (!applyRes.ok) throw new Error((applyJson as { error?: string }).error ?? "Apply failed");
      const r = applyJson as { sections_targeted: number; total_sheets_synced: number; total_checklist_items: number };
      toast.success(
        `Saved and applied (v${newVersion.version_number}) — ${r.total_sheets_synced} sheet${r.total_sheets_synced !== 1 ? "s" : ""} updated, ${r.total_checklist_items} evaluation topic${r.total_checklist_items !== 1 ? "s" : ""} synced`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save & Apply failed");
    } finally {
      setApplying(false);
    }
  };

  // Topic management
  const addTopic = () => {
    const text = newTopicText.trim();
    if (!text) return;
    setTopics((prev) => [...prev, { text, sort_order: prev.length }]);
    setNewTopicText("");
    setDirty(true);
    topicInputRef.current?.focus();
  };

  const removeTopic = (index: number) => {
    setTopics((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, sort_order: i })));
    setDirty(true);
  };

  const moveTopic = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= topics.length) return;
    const arr = [...topics];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    setTopics(arr.map((t, i) => ({ ...t, sort_order: i })));
    setDirty(true);
  };

  const updateSlot = (
    type: "ww" | "pt",
    index: number,
    field: keyof SowSlotDescriptor,
    value: string,
  ) => {
    const setter = type === "ww" ? setWw : setPt;
    setter((prev) => {
      const arr = [...prev];
      const existing = arr[index] ?? {};
      const trimmed = value.trim() || null;
      arr[index] = { ...existing, [field]: trimmed };
      return arr;
    });
    setDirty(true);
  };

  const clearSlot = (type: "ww" | "pt", index: number) => {
    const setter = type === "ww" ? setWw : setPt;
    setter((prev) => {
      const arr = [...prev];
      arr[index] = null;
      return arr;
    });
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      {/* Scope picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>Select the academic year, term, subject, and level to load or create a Scheme of Work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Academic Year</Label>
              <Select
                value={ayId}
                onValueChange={(v) => {
                  setAyId(v);
                  setTermId("");
                  setDirty(false);
                  updateUrl({ ay_id: v });
                }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select AY…" />
                </SelectTrigger>
                <SelectContent>
                  {ays.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                      {a.is_current && (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">(current)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Term</Label>
              <Select
                value={termId}
                onValueChange={(v) => {
                  setTermId(v);
                  setDirty(false);
                  updateUrl({ ay_id: ayId, term_id: v, subject_id: subjectId, level_id: levelId });
                }}>
                <SelectTrigger className="h-9" disabled={!ayId}>
                  <SelectValue placeholder="Select term…" />
                </SelectTrigger>
                <SelectContent>
                  {ayTerms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Select
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setDirty(false);
                  updateUrl({ ay_id: ayId, term_id: termId, subject_id: v, level_id: levelId });
                }}>
                <SelectTrigger className="h-9" disabled={!termId}>
                  <SelectValue placeholder="Select subject…" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-mono text-xs">{s.code}</span>
                      <span className="ml-1.5">{s.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Level</Label>
              <Select
                value={levelId}
                onValueChange={(v) => {
                  setLevelId(v);
                  setDirty(false);
                  updateUrl({ ay_id: ayId, term_id: termId, subject_id: subjectId, level_id: v });
                }}>
                <SelectTrigger className="h-9" disabled={!subjectId}>
                  <SelectValue placeholder="Select level…" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <span className="font-mono text-xs">{l.code}</span>
                      <span className="ml-1.5">{l.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status strip */}
      {scopeComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : masterId ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-brand-mint" />
                <span className="text-sm text-foreground">
                  SOW saved
                  {latestVersion && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      · v{latestVersion.version_number} applied{" "}
                      {new Date(latestVersion.published_at).toLocaleDateString("en-SG", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No SOW yet for this scope</span>
              </>
            )}
            {dirty && (
              <Badge variant="secondary" className="text-[10px]">Unsaved changes</Badge>
            )}
          </div>

          <Button
            size="sm"
            disabled={applying || !scopeComplete}
            onClick={handleSaveAndApply}
            className="h-8 gap-1.5 px-3 text-xs">
            {applying && <Loader2 className="h-3 w-3 animate-spin" />}
            Save & Apply
          </Button>
        </div>
      )}

      {/* Builder canvas — shown only when scope is complete */}
      {scopeComplete && !loading && (
        <div className="space-y-6">
          {/* Evaluation topics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evaluation Topics</CardTitle>
              <CardDescription>
                These topics appear on teachers' PTC evaluation checklist. Add up to {MAX_TOPICS} items; order matters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topics.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No topics yet. Add the first one below.</p>
              )}
              {topics.map((topic, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverIndex !== i) setDragOverIndex(i);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== i) {
                      const arr = [...topics];
                      const [moved] = arr.splice(dragIndex, 1);
                      arr.splice(i, 0, moved);
                      setTopics(arr.map((t, idx) => ({ ...t, sort_order: idx })));
                      setDirty(true);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={[
                    "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors select-none",
                    dragIndex === i
                      ? "opacity-40 border-border bg-muted/20"
                      : dragOverIndex === i
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/20",
                  ].join(" ")}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
                  <span className="font-mono text-[11px] text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                  <span className="flex-1 text-sm text-foreground">{topic.text}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveTopic(i, -1)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move up">
                      <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                    </button>
                    <button
                      type="button"
                      disabled={i === topics.length - 1}
                      onClick={() => moveTopic(i, 1)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move down">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTopic(i)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label="Remove topic">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {topics.length < MAX_TOPICS && (
                <div className="flex gap-2">
                  <input
                    ref={topicInputRef}
                    type="text"
                    value={newTopicText}
                    onChange={(e) => setNewTopicText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addTopic(); }
                    }}
                    placeholder="Add a topic…"
                    maxLength={200}
                    className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTopic}
                    disabled={!newTopicText.trim()}
                    className="h-9 gap-1.5 px-3">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WW slots */}
          <SlotSection
            title="Written Works (WW)"
            description={`${slotLimits.ww} slot${slotLimits.ww !== 1 ? "s" : ""} configured for this subject and level. Each slot's label and page number will pre-fill the grading sheet.`}
            slots={ww}
            prefix="W"
            onChange={(i, field, v) => updateSlot("ww", i, field, v)}
            onClear={(i) => clearSlot("ww", i)}
          />

          {/* PT slots */}
          <SlotSection
            title="Performance Tasks (PT)"
            description={`${slotLimits.pt} slot${slotLimits.pt !== 1 ? "s" : ""} configured for this subject and level.`}
            slots={pt}
            prefix="PT"
            onChange={(i, field, v) => updateSlot("pt", i, field, v)}
            onClear={(i) => clearSlot("pt", i)}
          />

          <Alert variant="default">
            <AlertIcon>
              <BookOpenCheck className="h-4 w-4" />
            </AlertIcon>
            <AlertTitle>Save & Apply pushes these settings to all matching sections</AlertTitle>
            <AlertDescription>
              Only unlocked grading sheets are updated. Locked sheets keep their current labels.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

function SlotSection({
  title,
  description,
  slots,
  prefix,
  onChange,
  onClear,
}: {
  title: string;
  description: string;
  slots: (SowSlotDescriptor | null)[];
  prefix: string;
  onChange: (index: number, field: keyof SowSlotDescriptor, value: string) => void;
  onClear: (index: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.map((slot, i) => (
          <div key={i} className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-12 shrink-0 items-center justify-center rounded border border-border bg-muted/50 font-mono text-xs font-semibold text-ink">
                  {prefix}{i + 1}
                </div>
                {slot?.label ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-brand-mint" />
                ) : (
                  <span className="text-xs text-muted-foreground">Empty slot</span>
                )}
              </div>
              {slot && (
                <button
                  type="button"
                  onClick={() => onClear(i)}
                  className="rounded p-1 text-muted-foreground/50 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Activity name
                </label>
                <input
                  type="text"
                  value={slot?.label ?? ""}
                  maxLength={120}
                  placeholder="Describe this activity…"
                  onChange={(e) => onChange(i, "label", e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Page # (optional)
                </label>
                <input
                  type="text"
                  value={slot?.page ?? ""}
                  maxLength={40}
                  placeholder="e.g. p. 45"
                  onChange={(e) => onChange(i, "page", e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
