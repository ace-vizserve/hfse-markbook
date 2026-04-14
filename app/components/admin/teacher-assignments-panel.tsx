'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Teacher = { id: string; email: string | null; display_name: string };
type Subject = { id: string; code: string; name: string };
type Assignment = {
  id: string;
  teacher_user_id: string;
  section_id: string;
  subject_id: string | null;
  role: 'form_adviser' | 'subject_teacher';
};

export function TeacherAssignmentsPanel({
  sectionId,
  levelSubjects,
}: {
  sectionId: string;
  levelSubjects: Subject[];
}) {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<'form_adviser' | 'subject_teacher'>('subject_teacher');
  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/users/teachers'),
        fetch(`/api/teacher-assignments?section_id=${sectionId}`),
      ]);
      const tBody = await tRes.json();
      const aBody = await aRes.json();
      if (!tRes.ok) throw new Error(tBody.error ?? 'failed to load teachers');
      if (!aRes.ok) throw new Error(aBody.error ?? 'failed to load assignments');
      setTeachers(tBody.teachers ?? []);
      setAssignments(aBody.assignments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createAssignment() {
    if (!teacherId) {
      setError('pick a teacher');
      return;
    }
    if (role === 'subject_teacher' && !subjectId) {
      setError('pick a subject');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/teacher-assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          teacher_user_id: teacherId,
          section_id: sectionId,
          subject_id: role === 'subject_teacher' ? subjectId : null,
          role,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      setTeacherId('');
      setSubjectId('');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(id: string) {
    if (!confirm('Remove this assignment?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher-assignments/${id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  const teachersById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const subjectsById = useMemo(
    () => new Map(levelSubjects.map((s) => [s.id, s])),
    [levelSubjects],
  );

  const formAdviser = assignments.find((a) => a.role === 'form_adviser');
  const subjectTeachers = assignments
    .filter((a) => a.role === 'subject_teacher')
    .sort((a, b) => {
      const sa = subjectsById.get(a.subject_id ?? '')?.name ?? '';
      const sb = subjectsById.get(b.subject_id ?? '')?.name ?? '';
      return sa.localeCompare(sb);
    });

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Teacher assignments</h3>
          </div>
          {loading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              loading…
            </span>
          )}
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Form class adviser
          </div>
          {formAdviser ? (
            <div className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm">
              <div>
                <div className="font-medium">
                  {teachersById.get(formAdviser.teacher_user_id)?.display_name ?? '(unknown user)'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {teachersById.get(formAdviser.teacher_user_id)?.email ??
                    formAdviser.teacher_user_id}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeAssignment(formAdviser.id)}
                disabled={busy}
                aria-label="Remove form adviser"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="text-xs italic text-muted-foreground">
              No form adviser assigned yet.
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Subject teachers
          </div>
          {subjectTeachers.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">
              No subject teachers assigned yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {subjectTeachers.map((a) => {
                const t = teachersById.get(a.teacher_user_id);
                const s = subjectsById.get(a.subject_id ?? '');
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-md border bg-muted px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{s?.name ?? '(unknown subject)'}</span>
                      <span className="mx-2 text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {t?.display_name ?? '(unknown user)'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAssignment(a.id)}
                      disabled={busy}
                      aria-label="Remove subject teacher"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add assignment
          </div>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as 'form_adviser' | 'subject_teacher')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject_teacher">Subject teacher</SelectItem>
                <SelectItem value="form_adviser">Form class adviser</SelectItem>
              </SelectContent>
            </Select>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="— pick a teacher —" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.display_name}
                    {t.email && t.email !== t.display_name ? ` (${t.email})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === 'subject_teacher' ? (
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="— pick a subject —" />
                </SelectTrigger>
                <SelectContent>
                  {levelSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 items-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
                no subject for form adviser
              </div>
            )}
            <Button
              onClick={createAssignment}
              disabled={busy || !teacherId || (role === 'subject_teacher' && !subjectId)}
              size="sm"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
          {teachers.length === 0 && !loading && (
            <Alert className="mt-3">
              <AlertDescription>
                No teacher users found. Create users in the Supabase dashboard and set{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">app_metadata.role</code> to{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">&quot;teacher&quot;</code>.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
