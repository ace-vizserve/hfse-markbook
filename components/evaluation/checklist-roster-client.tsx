'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RatingSelector } from '@/components/evaluation/rating-selector';

type ChecklistItem = {
  id: string;
  item_text: string;
  sort_order: number;
};

type RosterStudent = {
  section_student_id: string;
  student_id: string;
  index_number: number;
  student_number: string;
  student_name: string;
};

type SubjectOption = { id: string; code: string; name: string };

type ChecklistState = {
  // key = `${studentId}|${itemId}` → 1–5 rating, or null when not yet rated
  responses: Map<string, number | null>;
  // key = studentId → current comment text
  comments: Map<string, string>;
  // key = studentId → 'idle' | 'saving' | 'saved'
  commentStatus: Map<string, 'idle' | 'saving' | 'saved'>;
};

const COMMENT_DEBOUNCE_MS = 800;

// Subject-teacher (and form_adviser / registrar+) tick UI. One column per
// checklist item, one row per student, plus a per-student "Comment" block
// that writes to `evaluation_subject_comments`. Autosaves on every tick /
// keystroke (debounced for comments).
export function ChecklistRosterClient({
  termId,
  sectionId,
  subjects,
  initialSubjectId,
  items,
  roster,
  initialResponses,
  initialComments,
  canEdit,
  canEditTopics,
  copyFromOptions,
}: {
  termId: string;
  sectionId: string;
  subjects: SubjectOption[];
  initialSubjectId: string;
  items: ChecklistItem[];
  roster: RosterStudent[];
  initialResponses: Map<string, number | null>;
  initialComments: Map<string, string>;
  canEdit: boolean;
  // True when the viewer is the subject_teacher for this (section × subject)
  // — gates the inline add / edit / delete / reorder / copy affordances.
  canEditTopics: boolean;
  // Sections this teacher already teaches the same subject in, which have
  // topics defined. Drives the "Copy topics from {section}" button shown
  // when the current section's topic list is empty.
  copyFromOptions: Array<{
    section_id: string;
    section_name: string;
    item_count: number;
  }>;
}) {
  const [subjectId, setSubjectId] = useState(initialSubjectId);

  const [state, setState] = useState<ChecklistState>(() => ({
    responses: new Map(initialResponses),
    comments: new Map(initialComments),
    commentStatus: new Map(),
  }));

  // Local copy of the topic list — owned client-side so add/edit/delete/
  // reorder render optimistically without a full page refresh. Mirrors
  // the `items` prop on initial mount; subject-switching does a full
  // navigation so the prop reseeds.
  const [topics, setTopics] = useState<ChecklistItem[]>(items);
  useEffect(() => {
    setTopics(items);
  }, [items]);

  // Topic-management UI state.
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicText, setNewTopicText] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [topicBusy, setTopicBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ChecklistItem | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const newTopicInputRef = useRef<HTMLInputElement | null>(null);

  const commentTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const saveResponse = useCallback(
    async (
      studentId: string,
      itemId: string,
      nextRating: number | null,
      previousRating: number | null,
    ) => {
      try {
        const res = await fetch('/api/evaluation/checklist-responses', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            termId,
            sectionId,
            studentId,
            checklistItemId: itemId,
            rating: nextRating,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'save failed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'save failed');
        // Revert optimistic update on failure.
        setState((prev) => {
          const next = new Map(prev.responses);
          next.set(`${studentId}|${itemId}`, previousRating);
          return { ...prev, responses: next };
        });
      }
    },
    [termId, sectionId],
  );

  const saveComment = useCallback(
    async (studentId: string, comment: string) => {
      setState((prev) => {
        const s = new Map(prev.commentStatus);
        s.set(studentId, 'saving');
        return { ...prev, commentStatus: s };
      });
      try {
        const res = await fetch('/api/evaluation/subject-comments', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            termId,
            sectionId,
            studentId,
            subjectId,
            comment: comment || null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? 'save failed');
        setState((prev) => {
          const s = new Map(prev.commentStatus);
          s.set(studentId, 'saved');
          return { ...prev, commentStatus: s };
        });
        setTimeout(() => {
          setState((prev) => {
            const s = new Map(prev.commentStatus);
            if (s.get(studentId) === 'saved') s.set(studentId, 'idle');
            return { ...prev, commentStatus: s };
          });
        }, 1500);
      } catch (e) {
        setState((prev) => {
          const s = new Map(prev.commentStatus);
          s.set(studentId, 'idle');
          return { ...prev, commentStatus: s };
        });
        toast.error(e instanceof Error ? e.message : 'save failed');
      }
    },
    [termId, sectionId, subjectId],
  );

  function handleRate(studentId: string, itemId: string, nextRating: number | null) {
    const key = `${studentId}|${itemId}`;
    const previousRating = state.responses.get(key) ?? null;
    setState((prev) => {
      const next = new Map(prev.responses);
      next.set(key, nextRating);
      return { ...prev, responses: next };
    });
    void saveResponse(studentId, itemId, nextRating, previousRating);
  }

  function handleCommentChange(studentId: string, next: string) {
    setState((prev) => {
      const c = new Map(prev.comments);
      c.set(studentId, next);
      return { ...prev, comments: c };
    });

    const existing = commentTimers.current.get(studentId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      commentTimers.current.delete(studentId);
      void saveComment(studentId, next);
    }, COMMENT_DEBOUNCE_MS);
    commentTimers.current.set(studentId, t);
  }

  // ─── Topic management ────────────────────────────────────────────────

  async function commitAddTopic() {
    const trimmed = newTopicText.trim();
    if (!trimmed) {
      setAddingTopic(false);
      setNewTopicText('');
      return;
    }
    setTopicBusy(true);
    try {
      const res = await fetch('/api/evaluation/checklist-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          termId,
          subjectId,
          sectionId,
          itemText: trimmed,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Could not add the topic');
      // Optimistic append — keep the server-returned id + sort_order so
      // subsequent reorder PATCHes target the right row.
      setTopics((prev) => [
        ...prev,
        {
          id: body.id,
          item_text: trimmed,
          sort_order:
            typeof body.sortOrder === 'number' ? body.sortOrder : prev.length * 10,
        },
      ]);
      setNewTopicText('');
      setAddingTopic(false);
      toast.success('Topic added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the topic');
    } finally {
      setTopicBusy(false);
    }
  }

  async function commitEditTopic(id: string) {
    const trimmed = editingText.trim();
    const original = topics.find((t) => t.id === id);
    if (!trimmed || !original || trimmed === original.item_text) {
      setEditingTopicId(null);
      setEditingText('');
      return;
    }
    setTopicBusy(true);
    try {
      const res = await fetch(
        `/api/evaluation/checklist-items/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ itemText: trimmed }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Could not save the topic');
      setTopics((prev) =>
        prev.map((t) => (t.id === id ? { ...t, item_text: trimmed } : t)),
      );
      setEditingTopicId(null);
      setEditingText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the topic');
    } finally {
      setTopicBusy(false);
    }
  }

  async function confirmDeleteTopic() {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setTopicBusy(true);
    try {
      const res = await fetch(
        `/api/evaluation/checklist-items/${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Could not delete the topic');
      setTopics((prev) => prev.filter((t) => t.id !== target.id));
      // Cascade also wiped any responses for this item on the server. Clear
      // the local response map so the rated counter stays accurate.
      setState((prev) => {
        const next = new Map(prev.responses);
        for (const k of Array.from(next.keys())) {
          if (k.endsWith(`|${target.id}`)) next.delete(k);
        }
        return { ...prev, responses: next };
      });
      setDeleteConfirm(null);
      toast.success(`Deleted "${target.item_text}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the topic');
    } finally {
      setTopicBusy(false);
    }
  }

  async function moveTopic(id: string, direction: 'up' | 'down') {
    if (topicBusy) return;
    const idx = topics.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= topics.length) return;

    const a = topics[idx];
    const b = topics[swapIdx];

    // Optimistic swap.
    const nextTopics = [...topics];
    nextTopics[idx] = { ...b, sort_order: a.sort_order };
    nextTopics[swapIdx] = { ...a, sort_order: b.sort_order };
    setTopics(nextTopics);
    setTopicBusy(true);

    try {
      // Two sequential PATCHes — unique constraint is on item_text, not
      // sort_order, so collisions during the swap are impossible.
      const patchA = await fetch(
        `/api/evaluation/checklist-items/${encodeURIComponent(a.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sortOrder: b.sort_order }),
        },
      );
      if (!patchA.ok) {
        const body = await patchA.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Could not reorder');
      }
      const patchB = await fetch(
        `/api/evaluation/checklist-items/${encodeURIComponent(b.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sortOrder: a.sort_order }),
        },
      );
      if (!patchB.ok) {
        const body = await patchB.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Could not reorder');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reorder');
      // Revert.
      setTopics(topics);
    } finally {
      setTopicBusy(false);
    }
  }

  async function runCopyFrom(sourceSectionId: string) {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      const res = await fetch('/api/evaluation/checklist-items/copy-from', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceSection: sourceSectionId,
          targetSection: sectionId,
          termId,
          subjectId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'Could not copy the topics');
      toast.success(`Copied ${body.copied ?? 0} topic${body.copied === 1 ? '' : 's'}`);
      // Full refresh so the page RSC reloads the new topic list cleanly.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not copy the topics');
      setCopyBusy(false);
    }
  }

  // Subject-switching reloads via a full URL update (the page RSC re-fetches
  // items + responses + comments for the new subject).
  function switchSubject(next: string) {
    if (next === subjectId) return;
    setSubjectId(next);
    const qs = new URLSearchParams(window.location.search);
    qs.set('subject_id', next);
    qs.set('tab', 'checklists');
    window.location.search = qs.toString();
  }

  const ratedPerStudent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, rating] of state.responses.entries()) {
      if (rating == null) continue;
      const [studentId] = key.split('|');
      const belongsToCurrentTopics = topics.some(
        (t) => `${studentId}|${t.id}` === key,
      );
      if (!belongsToCurrentTopics) continue;
      counts.set(studentId, (counts.get(studentId) ?? 0) + 1);
    }
    return counts;
  }, [state.responses, topics]);

  const totalItems = topics.length;

  return (
    <div className="space-y-5">
      {/* Subject picker */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="subject-picker"
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Subject
          </label>
          <Select value={subjectId} onValueChange={switchSubject}>
            <SelectTrigger id="subject-picker" className="h-10 w-[260px]">
              <SelectValue placeholder="Pick a subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{s.code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {totalItems} topic{totalItems === 1 ? '' : 's'} · {roster.length} student
          {roster.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* ── Topic management panel ─────────────────────────────────────
          Topics are owned by the subject teacher per (subject × section
          × term) — they add the items they actually covered. Registrar+
          viewers see the list but not the edit affordances. */}
      <TopicManagerPanel
        topics={topics}
        canEditTopics={canEditTopics}
        copyFromOptions={copyFromOptions}
        addingTopic={addingTopic}
        newTopicText={newTopicText}
        editingTopicId={editingTopicId}
        editingText={editingText}
        topicBusy={topicBusy}
        copyBusy={copyBusy}
        newTopicInputRef={newTopicInputRef}
        onStartAdd={() => {
          setAddingTopic(true);
          setNewTopicText('');
          // Focus the input on the next paint.
          setTimeout(() => newTopicInputRef.current?.focus(), 0);
        }}
        onCancelAdd={() => {
          setAddingTopic(false);
          setNewTopicText('');
        }}
        onNewTopicChange={setNewTopicText}
        onCommitAdd={commitAddTopic}
        onStartEdit={(t) => {
          setEditingTopicId(t.id);
          setEditingText(t.item_text);
        }}
        onCancelEdit={() => {
          setEditingTopicId(null);
          setEditingText('');
        }}
        onEditingChange={setEditingText}
        onCommitEdit={(id) => commitEditTopic(id)}
        onMoveUp={(id) => void moveTopic(id, 'up')}
        onMoveDown={(id) => void moveTopic(id, 'down')}
        onRequestDelete={(t) => setDeleteConfirm(t)}
        onCopyFrom={(s) => void runCopyFrom(s)}
      />

      {totalItems === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {canEditTopics
            ? 'No topics yet. Use “+ Add topic” above to add the first one — or copy them from another of your sections.'
            : 'No topics yet. The subject teacher will add them from their Evaluation view.'}
        </div>
      ) : roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No students on the roster.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {roster.map((student) => {
            const rated = ratedPerStudent.get(student.student_id) ?? 0;
            const comment = state.comments.get(student.student_id) ?? '';
            const status = state.commentStatus.get(student.student_id) ?? 'idle';
            return (
              <li key={student.student_id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[240px_1fr]">
                {/* Student identity */}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                      #{student.index_number}
                    </span>
                    <span className="font-serif text-[14px] font-semibold leading-snug tracking-tight text-foreground">
                      {student.student_name}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    {student.student_number}
                  </div>
                  <Badge
                    variant="outline"
                    className="mt-2 font-mono text-[10px] tabular-nums"
                  >
                    {rated} / {totalItems} rated
                  </Badge>
                </div>

                {/* Checklist + comment */}
                <div className="min-w-0 space-y-3">
                  <ul className="grid grid-cols-1 gap-1.5">
                    {topics.map((item) => {
                      const key = `${student.student_id}|${item.id}`;
                      const rating = state.responses.get(key) ?? null;
                      return (
                        <li
                          key={item.id}
                          className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5 text-[12px] sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0 flex-1 leading-snug">{item.item_text}</span>
                          <div className="sm:shrink-0">
                            <RatingSelector
                              value={rating}
                              onSelect={(v) => handleRate(student.student_id, item.id, v)}
                              disabled={!canEdit}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <label
                        htmlFor={`comment-${student.student_id}`}
                        className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                      >
                        Comments if any
                      </label>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {status === 'saving' && <>Saving…</>}
                        {status === 'saved' && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Check className="size-3" /> Saved
                          </span>
                        )}
                        {comment.length > 0 && status === 'idle' && (
                          <>{comment.length} chars</>
                        )}
                      </span>
                    </div>
                    <textarea
                      id={`comment-${student.student_id}`}
                      value={comment}
                      disabled={!canEdit}
                      onChange={(e) => handleCommentChange(student.student_id, e.target.value)}
                      rows={2}
                      placeholder={
                        canEdit
                          ? 'Per-subject comment (optional). PTC use only — does not print on the report card.'
                          : 'Read-only.'
                      }
                      className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Delete-topic confirmation. Cascade on the server drops ratings;
          the dialog copy makes that consequence explicit. */}
      <AlertDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{deleteConfirm?.item_text}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ratings entered for this topic will be deleted too. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={topicBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteTopic();
              }}
              disabled={topicBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {topicBusy ? 'Deleting…' : 'Delete topic'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Topic management panel ──────────────────────────────────────────────
// Sits above the student roster. Shows the topic list with inline add /
// edit / delete / reorder controls when canEditTopics is true. When the
// list is empty AND the teacher has other sections with topics defined,
// surfaces a "Copy topics from {section}" button per source.

function TopicManagerPanel({
  topics,
  canEditTopics,
  copyFromOptions,
  addingTopic,
  newTopicText,
  editingTopicId,
  editingText,
  topicBusy,
  copyBusy,
  newTopicInputRef,
  onStartAdd,
  onCancelAdd,
  onNewTopicChange,
  onCommitAdd,
  onStartEdit,
  onCancelEdit,
  onEditingChange,
  onCommitEdit,
  onMoveUp,
  onMoveDown,
  onRequestDelete,
  onCopyFrom,
}: {
  topics: ChecklistItem[];
  canEditTopics: boolean;
  copyFromOptions: Array<{
    section_id: string;
    section_name: string;
    item_count: number;
  }>;
  addingTopic: boolean;
  newTopicText: string;
  editingTopicId: string | null;
  editingText: string;
  topicBusy: boolean;
  copyBusy: boolean;
  newTopicInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onNewTopicChange: (v: string) => void;
  onCommitAdd: () => void;
  onStartEdit: (t: ChecklistItem) => void;
  onCancelEdit: () => void;
  onEditingChange: (v: string) => void;
  onCommitEdit: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRequestDelete: (t: ChecklistItem) => void;
  onCopyFrom: (sourceSectionId: string) => void;
}) {
  const showCopyButtons =
    canEditTopics && topics.length === 0 && copyFromOptions.length > 0;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Topics · {topics.length} configured
        </h3>
        {canEditTopics && !addingTopic && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onStartAdd}
            disabled={topicBusy}
          >
            <Plus className="size-3.5" />
            Add topic
          </Button>
        )}
      </div>

      {/* Copy-from buttons — only when the list is empty + teacher has other
          sections with topics. */}
      {showCopyButtons && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Or copy from:
          </span>
          {copyFromOptions.map((opt) => (
            <Button
              key={opt.section_id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onCopyFrom(opt.section_id)}
              disabled={copyBusy}
            >
              <Copy className="size-3.5" />
              {opt.section_name}
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {opt.item_count}
              </span>
            </Button>
          ))}
        </div>
      )}

      {/* Existing topics list. */}
      {topics.length > 0 && (
        <ul className="space-y-1">
          {topics.map((t, idx) => {
            const isEditing = editingTopicId === t.id;
            return (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-5 text-right">
                  {idx + 1}.
                </span>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => onEditingChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onCommitEdit(t.id);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          onCancelEdit();
                        }
                      }}
                      autoFocus
                      disabled={topicBusy}
                      className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => onCommitEdit(t.id)}
                      disabled={topicBusy}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={onCancelEdit}
                      disabled={topicBusy}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 leading-snug">{t.item_text}</span>
                    {canEditTopics && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Move up"
                          onClick={() => onMoveUp(t.id)}
                          disabled={topicBusy || idx === 0}
                          className="size-7"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          onClick={() => onMoveDown(t.id)}
                          disabled={topicBusy || idx === topics.length - 1}
                          className="size-7"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() => onStartEdit(t)}
                          disabled={topicBusy}
                          className="size-7"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          onClick={() => onRequestDelete(t)}
                          disabled={topicBusy}
                          className="size-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Inline add-topic input. */}
      {addingTopic && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
          <Plus className="size-3.5 text-primary" />
          <input
            ref={newTopicInputRef}
            type="text"
            value={newTopicText}
            onChange={(e) => onNewTopicChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onCommitAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelAdd();
              }
            }}
            placeholder="What topic did you cover? (Enter to save, Esc to cancel)"
            disabled={topicBusy}
            className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={onCommitAdd}
            disabled={topicBusy || newTopicText.trim().length === 0}
          >
            {topicBusy ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancelAdd}
            disabled={topicBusy}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
