'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type Row = {
  enrolment_id: string;
  index_number: number;
  withdrawn: boolean;
  student_id: string;
  student_number: string;
  student_name: string;
  comment: string | null;
};

export function CommentsGrid({
  sectionId,
  termId,
  rows: initialRows,
}: {
  sectionId: string;
  termId: string;
  rows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(row: Row, nextComment: string) {
    if ((row.comment ?? '') === nextComment) return;
    setSavingId(row.student_id);
    setErrors((e) => {
      const n = { ...e };
      delete n[row.student_id];
      return n;
    });
    try {
      const res = await fetch(`/api/sections/${sectionId}/comments`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          term_id: termId,
          student_id: row.student_id,
          comment: nextComment || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
      setRows((current) =>
        current.map((r) =>
          r.student_id === row.student_id ? { ...r, comment: nextComment || null } : r,
        ),
      );
    } catch (e) {
      setErrors((er) => ({ ...er, [row.student_id]: e instanceof Error ? e.message : 'error' }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <Surface padded={false} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead className="w-56">Student</TableHead>
              <TableHead>Comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                  No students enrolled.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.enrolment_id}
                className={r.withdrawn ? 'text-muted-foreground' : ''}
              >
                <TableCell className="text-right align-top tabular-nums">
                  {r.index_number}
                </TableCell>
                <TableCell className="align-top">
                  <div className="whitespace-nowrap">{r.student_name}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {r.student_number}
                  </div>
                </TableCell>
                <TableCell>
                  <CommentCell
                    initial={r.comment ?? ''}
                    disabled={r.withdrawn}
                    onCommit={(v) => save(r, v)}
                  />
                  {errors[r.student_id] && (
                    <div className="mt-1 text-xs text-destructive">{errors[r.student_id]}</div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>
      {savingId && (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          saving…
        </div>
      )}
    </div>
  );
}

function CommentCell({
  initial,
  disabled,
  onCommit,
}: {
  initial: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <Textarea
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text.trim())}
      rows={2}
      placeholder="Write adviser's comment for this term…"
      className="min-h-[60px] disabled:bg-muted"
    />
  );
}
