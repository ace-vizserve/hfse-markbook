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
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import type { CurriculumTrack } from "@/lib/schemas/sow";
import type { SowTopic } from "@/lib/schemas/sow";
import type { SowSlotDescriptor } from "@/lib/schemas/grading-sheet";

const CURRICULUM_TRACKS: { value: CurriculumTrack; label: string }[] = [
  { value: "singapore_inspired", label: "Singapore-Inspired" },
  { value: "o_level", label: "GCE O Level" },
  { value: "cambridge", label: "Cambridge IGCSE" },
];

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
  curriculum_track?: CurriculumTrack;
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
  const [track, setTrack] = useState<CurriculumTrack>(initialScope?.curriculum_track ?? "singapore_inspired");

  // Builder content state
  const [topics, setTopics] = useState<SowTopic[]>([]);
  const [ww, setWw] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [pt, setPt] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [slotLimits, setSlotLimits] = useState({ ww: MAX_SLOTS, pt: MAX_SLOTS });

  // Master + versions
  const [masterId, setMasterId] = useState<string | null>(null);
  const [versions, setVersions] = useState<PublishedVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Publish dialog
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNotes, setPublishNotes] = useState("");

  // New topic input
  const [newTopicText, setNewTopicText] = useState("");
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const scopeComplete = !!(ayId && termId && subjectId && levelId && track);

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
      if (scope.curriculum_track) params.set("curriculum_track", scope.curriculum_track); else params.delete("curriculum_track");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Load master template when scope is complete
  const loadScope = useCallback(async () => {
    if (!ayId || !termId || !subjectId || !levelId || !track) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ ay_id: ayId, term_id: termId, subject_id: subjectId, level_id: levelId, curriculum_track: track });
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
      setVersions(data.versions ?? []);
      setDirty(false);
    } catch {
      toast.error("Failed to load scheme of work");
    } finally {
      setLoading(false);
    }
  }, [ayId, termId, subjectId, levelId, track]);

  useEffect(() => {
    if (scopeComplete) loadScope();
  }, [scopeComplete, loadScope]);

  const handleSave = async () => {
    if (!scopeComplete) return;
    setSaving(true);
    try {
      const body = {
        ay_id: ayId,
        term_id: termId,
        subject_id: subjectId,
        level_id: levelId,
        curriculum_track: track,
        topics: topics.map((t, i) => ({ text: t.text, sort_order: i })),
        ww: ww.slice(0, slotLimits.ww),
        pt: pt.slice(0, slotLimits.pt),
      };
      const res = await fetch("/api/sis/admin/sow", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
      setMasterId((json as { master: MasterRow }).master.id);
      setDirty(false);
      toast.success("Draft saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!masterId) {
      // Auto-save first
      await handleSave();
    }
    if (!masterId) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/sis/admin/sow/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ master_id: masterId, notes: publishNotes || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Publish failed");
      const newVersion = (json as { version: PublishedVersion }).version;
      setVersions((prev) => [newVersion, ...prev]);
      setPublishOpen(false);
      setPublishNotes("");
      toast.success(`Version ${newVersion.version_number} published`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const handleApply = async (versionId: string, versionNumber: number) => {
    try {
      const res = await fetch("/api/sis/admin/sow/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published_version_id: versionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Apply failed");
      const r = json as { sections_targeted: number; total_sheets_synced: number; total_checklist_items: number };
      toast.success(
        `Version ${versionNumber} applied — ${r.total_sheets_synced} sheet${r.total_sheets_synced !== 1 ? "s" : ""} updated, ${r.total_checklist_items} topic${r.total_checklist_items !== 1 ? "s" : ""} synced`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
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

  const latestVersion = versions[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Scope picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>Select the academic year, term, subject, level, and track to load or create a Scheme of Work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Academic Year</Label>
              <Select
                value={ayId}
                onValueChange={(v) => {
                  setAyId(v);
                  setTermId("");
                  setDirty(false);
                  updateUrl({ ay_id: v, curriculum_track: track });
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
                  updateUrl({ ay_id: ayId, term_id: v, subject_id: subjectId, level_id: levelId, curriculum_track: track });
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
                  updateUrl({ ay_id: ayId, term_id: termId, subject_id: v, level_id: levelId, curriculum_track: track });
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
                  updateUrl({ ay_id: ayId, term_id: termId, subject_id: subjectId, level_id: v, curriculum_track: track });
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

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Curriculum Track</Label>
              <Select
                value={track}
                onValueChange={(v) => {
                  setTrack(v as CurriculumTrack);
                  setDirty(false);
                  updateUrl({ ay_id: ayId, term_id: termId, subject_id: subjectId, level_id: levelId, curriculum_track: v as CurriculumTrack });
                }}>
                <SelectTrigger className="h-9" disabled={!levelId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRICULUM_TRACKS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
                  Draft saved
                  {latestVersion && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      · Published v{latestVersion.version_number}
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

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving || !dirty || !scopeComplete}
              onClick={handleSave}
              className="h-8 gap-1.5 px-3 text-xs">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save draft
            </Button>
            <Button
              size="sm"
              disabled={publishing || !scopeComplete}
              onClick={() => setPublishOpen(true)}
              className="h-8 gap-1.5 px-3 text-xs">
              <Send className="h-3 w-3" />
              Publish
            </Button>
          </div>
        </div>
      )}

      {/* Builder canvas — shown only when scope is complete */}
      {scopeComplete && !loading && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column: topics + activity slots */}
          <div className="space-y-6 lg:col-span-2">
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
          </div>

          {/* Right column: version history */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Version History</CardTitle>
                <CardDescription>
                  Published versions are frozen snapshots. Apply a version to push its labels and topics to all matching sections.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {versions.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No versions published yet.</p>
                )}
                {versions.map((v) => (
                  <div key={v.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Version {v.version_number}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {new Date(v.published_at).toLocaleDateString("en-SG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <Badge
                        variant={v.version_number === (versions[0]?.version_number ?? 0) ? "default" : "secondary"}
                        className="text-[10px] shrink-0">
                        {v.version_number === (versions[0]?.version_number ?? 0) ? "Latest" : `v${v.version_number}`}
                      </Badge>
                    </div>
                    {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}
                    <div className="text-xs text-muted-foreground space-x-3">
                      <span>{v.topics.length} topics</span>
                      <span>{v.ww.filter(Boolean).length} WW</span>
                      <span>{v.pt.filter(Boolean).length} PT</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-full gap-1.5 text-xs"
                      onClick={() => handleApply(v.id, v.version_number)}>
                      Apply to sections
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Alert variant="default">
              <AlertIcon>
                <BookOpenCheck className="h-4 w-4" />
              </AlertIcon>
              <AlertTitle>Apply sends labels + topics to all matching sections</AlertTitle>
              <AlertDescription>
                Only unlocked grading sheets are updated. Locked sheets keep their current labels.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Scheme of Work</DialogTitle>
            <DialogDescription>
              This creates an immutable snapshot (v{(latestVersion?.version_number ?? 0) + 1}). Once published, the
              registrar can apply it to sections. Existing locked sheets are never modified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea
                value={publishNotes}
                onChange={(e) => setPublishNotes(e.target.value)}
                placeholder="Describe what changed in this version…"
                maxLength={500}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p><span className="font-semibold text-foreground">{topics.length}</span> evaluation topics</p>
              <p><span className="font-semibold text-foreground">{ww.filter(Boolean).length}</span> written work slots</p>
              <p><span className="font-semibold text-foreground">{pt.filter(Boolean).length}</span> performance task slots</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
              Publish v{(latestVersion?.version_number ?? 0) + 1}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
