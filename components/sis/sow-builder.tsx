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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { SowTopic } from "@/lib/schemas/sow";
import type { SowSlotDescriptor } from "@/lib/schemas/grading-sheet";

type AyRow = { id: string; ay_code: string; label: string; is_current: boolean };
type TermRow = { id: string; academic_year_id: string; label: string; term_number: number };
type SubjectRow = { id: string; code: string; name: string };
type SectionRow = {
  id: string;
  name: string;
  level_id: string;
  level_code: string;
  level_label: string;
  curriculum_track: string;
  academic_year_id: string;
};

// Subject scope entry: which subjects apply to a given (level, track) combo.
type ScopeEntry = { level_id: string; curriculum_track: string; subject_id: string };

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
  section_id?: string;
};

type Props = {
  ays: AyRow[];
  terms: TermRow[];
  subjects: SubjectRow[];
  sections: SectionRow[];
  scopeEntries: ScopeEntry[];
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

export function SowBuilder({ ays, terms, subjects, sections, scopeEntries, initialScope }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ayId, setAyId] = useState(initialScope?.ay_id ?? ays.find((a) => a.is_current)?.id ?? "");
  const [termId, setTermId] = useState(initialScope?.term_id ?? "");
  const [subjectId, setSubjectId] = useState(initialScope?.subject_id ?? "");
  const [sectionId, setSectionId] = useState(initialScope?.section_id ?? "");

  // Derive level_id and curriculum_track from the selected section.
  const selectedSection = sections.find((s) => s.id === sectionId) ?? null;
  const levelId = selectedSection?.level_id ?? "";
  const curriculumTrack = selectedSection?.curriculum_track ?? "singapore_inspired";

  // Filter subjects to only those in the scope for this level+track.
  // If no scope entries exist for this combination, show all subjects (fallback).
  const aySections = sections.filter((s) => s.academic_year_id === ayId);
  const relevantEntries = scopeEntries.filter(
    (e) => e.level_id === levelId && e.curriculum_track === curriculumTrack,
  );
  const scopedSubjects =
    relevantEntries.length > 0
      ? subjects.filter((s) => relevantEntries.some((e) => e.subject_id === s.id))
      : subjects;

  const [topics, setTopics] = useState<SowTopic[]>([]);
  const [ww, setWw] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [pt, setPt] = useState<(SowSlotDescriptor | null)[]>(emptySlotArray(MAX_SLOTS));
  const [slotLimits, setSlotLimits] = useState({ ww: MAX_SLOTS, pt: MAX_SLOTS });

  const [masterId, setMasterId] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<PublishedVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [newTopicText, setNewTopicText] = useState("");
  const topicInputRef = useRef<HTMLInputElement>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const scopeComplete = !!(ayId && termId && subjectId && sectionId && levelId);
  const ayTerms = terms.filter((t) => t.academic_year_id === ayId);

  const updateUrl = useCallback(
    (scope: Scope) => {
      const params = new URLSearchParams(searchParams.toString());
      if (scope.ay_id) params.set("ay_id", scope.ay_id); else params.delete("ay_id");
      if (scope.term_id) params.set("term_id", scope.term_id); else params.delete("term_id");
      if (scope.subject_id) params.set("subject_id", scope.subject_id); else params.delete("subject_id");
      if (scope.section_id) params.set("section_id", scope.section_id); else params.delete("section_id");
      params.delete("level_id");
      params.delete("curriculum_track");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadScope = useCallback(async () => {
    if (!ayId || !termId || !subjectId || !levelId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ay_id: ayId,
        term_id: termId,
        subject_id: subjectId,
        level_id: levelId,
        curriculum_track: curriculumTrack,
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
  }, [ayId, termId, subjectId, levelId, curriculumTrack]);

  useEffect(() => {
    if (scopeComplete) loadScope();
  }, [scopeComplete, loadScope]);

  const handleSaveAndApply = async () => {
    if (!scopeComplete) return;
    setApplying(true);
    try {
      const saveRes = await fetch("/api/sis/admin/sow", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ay_id: ayId,
          term_id: termId,
          subject_id: subjectId,
          level_id: levelId,
          curriculum_track: curriculumTrack,
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

      const pubRes = await fetch("/api/sis/admin/sow/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ master_id: currentMasterId }),
      });
      const pubJson = await pubRes.json();
      if (!pubRes.ok) throw new Error((pubJson as { error?: string }).error ?? "Publish failed");
      const newVersion = (pubJson as { version: PublishedVersion }).version;
      setLatestVersion(newVersion);

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

  const updateSlot = (type: "ww" | "pt", index: number, field: keyof SowSlotDescriptor, value: string) => {
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
    <div className="space-y-5">

      {/* ── Scope picker ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Scope
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Academic Year
            </Label>
            <Select
              value={ayId}
              onValueChange={(v) => {
                setAyId(v);
                setTermId("");
                setSectionId("");
                setSubjectId("");
                setDirty(false);
                updateUrl({ ay_id: v });
              }}
            >
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
            <Label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Term
            </Label>
            <Select
              value={termId}
              onValueChange={(v) => {
                setTermId(v);
                setDirty(false);
                updateUrl({ ay_id: ayId, term_id: v, section_id: sectionId, subject_id: subjectId });
              }}
            >
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
            <Label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Section
            </Label>
            <Select
              value={sectionId}
              onValueChange={(v) => {
                setSectionId(v);
                setSubjectId("");
                setDirty(false);
                updateUrl({ ay_id: ayId, term_id: termId, section_id: v });
              }}
            >
              <SelectTrigger className="h-9" disabled={!termId}>
                <SelectValue placeholder="Select section…" />
              </SelectTrigger>
              <SelectContent>
                {aySections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono text-xs">{s.level_code}</span>
                    <span className="ml-1.5">{s.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Subject
            </Label>
            <Select
              value={subjectId}
              onValueChange={(v) => {
                setSubjectId(v);
                setDirty(false);
                updateUrl({ ay_id: ayId, term_id: termId, section_id: sectionId, subject_id: v });
              }}
            >
              <SelectTrigger className="h-9" disabled={!sectionId}>
                <SelectValue placeholder="Select subject…" />
              </SelectTrigger>
              <SelectContent>
                {scopedSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono text-xs">{s.code}</span>
                    <span className="ml-1.5">{s.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Derived scope context — shown once a section is selected */}
        {selectedSection && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              Applies to:
            </span>
            <span className="text-xs text-muted-foreground">
              all <span className="font-medium text-foreground">{selectedSection.level_label}</span> sections
              {selectedSection.curriculum_track !== "singapore_inspired" && (
                <> · <span className="font-medium text-foreground capitalize">{selectedSection.curriculum_track.replace(/_/g, " ")}</span> track</>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ── Empty state — scope not yet complete ─────────────────────────── */}
      {!scopeComplete && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <BookOpenCheck className="size-6" />
          </div>
          <div className="space-y-1.5">
            <p className="font-serif text-xl font-semibold text-foreground">Select a scope to begin</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Choose an academic year, term, section, and subject to load or create a Scheme of Work.
            </p>
          </div>
        </div>
      )}

      {/* ── Status + CTA bar ─────────────────────────────────────────────── */}
      {scopeComplete && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={[
                "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
                loading
                  ? "bg-gradient-to-br from-muted-foreground/40 to-muted-foreground/20"
                  : masterId
                    ? "bg-gradient-to-br from-brand-mint to-emerald-600 shadow-brand-tile-mint"
                    : "bg-gradient-to-br from-brand-indigo/40 to-brand-navy/30",
              ].join(" ")}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : masterId ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <BookOpenCheck className="size-4" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {loading
                  ? "Loading…"
                  : masterId
                    ? `SOW saved${latestVersion ? ` · v${latestVersion.version_number}` : ""}`
                    : "No SOW for this scope yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {latestVersion
                  ? `Applied ${new Date(latestVersion.published_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`
                  : "Fill in the content below and click Save & Apply"}
              </p>
            </div>
            {dirty && (
              <Badge variant="secondary" className="text-[10px]">
                Unsaved
              </Badge>
            )}
          </div>

          <Button disabled={applying || loading || !scopeComplete} onClick={handleSaveAndApply} className="gap-2">
            {applying && <Loader2 className="size-4 animate-spin" />}
            Save & Apply
          </Button>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {scopeComplete && loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Builder canvas ───────────────────────────────────────────────── */}
      {scopeComplete && !loading && (
        <Tabs defaultValue="topics">
          <TabsList className="w-full">
            <TabsTrigger value="topics" className="flex-1 gap-2">
              Evaluation Topics
              {topics.length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-px font-mono text-[10px] font-semibold text-primary">
                  {topics.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ww" className="flex-1 gap-2">
              Written Works
              {ww.filter(Boolean).length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-px font-mono text-[10px] font-semibold text-primary">
                  {ww.filter(Boolean).length}/{slotLimits.ww}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pt" className="flex-1 gap-2">
              Performance Tasks
              {pt.filter(Boolean).length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-px font-mono text-[10px] font-semibold text-primary">
                  {pt.filter(Boolean).length}/{slotLimits.pt}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Topics tab ─────────────────────────────────────────────── */}
          <TabsContent value="topics" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              These topics appear on the PTC evaluation checklist for every section at this level. Add up to {MAX_TOPICS} items — order matters.
            </p>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {topics.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm italic text-muted-foreground">
                  No topics yet. Add the first one below.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {topics.map((topic, i) => (
                    <li
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
                        "flex select-none items-center gap-3 px-4 py-3 transition-colors",
                        dragIndex === i
                          ? "opacity-40"
                          : dragOverIndex === i
                            ? "bg-primary/5"
                            : "hover:bg-muted/30",
                      ].join(" ")}
                    >
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/40 active:cursor-grabbing" />
                      <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="flex-1 text-sm text-foreground">{topic.text}</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveTopic(i, -1)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronDown className="size-3.5 rotate-180" />
                        </button>
                        <button
                          type="button"
                          disabled={i === topics.length - 1}
                          onClick={() => moveTopic(i, 1)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTopic(i)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove topic"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
                  className="h-9 gap-1.5 px-3"
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── WW tab ─────────────────────────────────────────────────── */}
          <TabsContent value="ww" className="mt-4">
            <SlotSection
              description={`${slotLimits.ww} slot${slotLimits.ww !== 1 ? "s" : ""} configured for this subject and level. Each slot's label and page number will pre-fill the grading sheet.`}
              slots={ww}
              prefix="WW"
              onChange={(i, field, v) => updateSlot("ww", i, field, v)}
              onClear={(i) => clearSlot("ww", i)}
            />
          </TabsContent>

          {/* ── PT tab ─────────────────────────────────────────────────── */}
          <TabsContent value="pt" className="mt-4">
            <SlotSection
              description={`${slotLimits.pt} slot${slotLimits.pt !== 1 ? "s" : ""} configured for this subject and level.`}
              slots={pt}
              prefix="PT"
              onChange={(i, field, v) => updateSlot("pt", i, field, v)}
              onClear={(i) => clearSlot("pt", i)}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* ── Footer note ──────────────────────────────────────────────────── */}
      {scopeComplete && !loading && (
        <Alert variant="default">
          <AlertIcon>
            <BookOpenCheck className="size-4" />
          </AlertIcon>
          <AlertTitle>Save & Apply pushes these settings to all matching sections</AlertTitle>
          <AlertDescription>
            Only unlocked grading sheets are updated. Locked sheets keep their current labels.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SlotSection({
  description,
  slots,
  prefix,
  onChange,
  onClear,
}: {
  description: string;
  slots: (SowSlotDescriptor | null)[];
  prefix: string;
  onChange: (index: number, field: keyof SowSlotDescriptor, value: string) => void;
  onClear: (index: number) => void;
}) {
  const inputCls =
    "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Column headers */}
        <div className="grid grid-cols-[4.5rem_1fr_7rem_2.5rem] items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Slot</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Activity name</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Page #</span>
          <span />
        </div>

        <ul className="divide-y divide-border">
          {slots.map((slot, i) => (
            <li key={i} className="grid grid-cols-[4.5rem_1fr_7rem_2.5rem] items-center gap-3 px-4 py-3">
              {/* Slot badge */}
              <div className="flex items-center gap-1.5">
                <div className="flex h-6 min-w-[2.75rem] items-center justify-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[11px] font-semibold text-foreground">
                  {prefix}{i + 1}
                </div>
                {slot?.label && (
                  <CheckCircle2 className="size-3 shrink-0 text-brand-mint" />
                )}
              </div>

              {/* Activity name */}
              <input
                type="text"
                value={slot?.label ?? ""}
                maxLength={120}
                placeholder="Describe this activity…"
                onChange={(e) => onChange(i, "label", e.target.value)}
                className={inputCls}
              />

              {/* Page # */}
              <input
                type="text"
                value={slot?.page ?? ""}
                maxLength={40}
                placeholder="e.g. p. 45"
                onChange={(e) => onChange(i, "page", e.target.value)}
                className={inputCls}
              />

              {/* Clear */}
              <button
                type="button"
                disabled={!slot}
                onClick={() => onClear(i)}
                className="flex size-8 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-0"
                aria-label="Clear slot"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
