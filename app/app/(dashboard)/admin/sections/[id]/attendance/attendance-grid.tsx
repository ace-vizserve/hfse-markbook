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

type Row = {
  enrolment_id: string;
  index_number: number;
  withdrawn: boolean;
  student_number: string;
  student_name: string;
  school_days: number | null;
  days_present: number | null;
  days_late: number | null;
};

type Field = 'school_days' | 'days_present' | 'days_late';

export function AttendanceGrid({
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

  async function saveRow(row: Row) {
    setSavingId(row.enrolment_id);
    setErrors((e) => {
      const n = { ...e };
      delete n[row.enrolment_id];
      return n;
    });
    try {
      const res = await fetch(`/api/sections/${sectionId}/attendance`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          term_id: termId,
          section_student_id: row.enrolment_id,
          school_days: row.school_days,
          days_present: row.days_present,
          days_late: row.days_late,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
    } catch (e) {
      setErrors((er) => ({ ...er, [row.enrolment_id]: e instanceof Error ? e.message : 'error' }));
    } finally {
      setSavingId(null);
    }
  }

  function update(enrolmentId: string, field: Field, raw: string) {
    const v = raw === '' ? null : Number(raw);
    setRows((current) =>
      current.map((r) => (r.enrolment_id === enrolmentId ? { ...r, [field]: v } : r)),
    );
  }

  return (
    <div className="space-y-2">
      <Surface padded={false} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead>Student</TableHead>
              <TableHead className="text-right">School days</TableHead>
              <TableHead className="text-right">Present</TableHead>
              <TableHead className="text-right">Late</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No students enrolled.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const disabled = r.withdrawn;
              return (
                <TableRow
                  key={r.enrolment_id}
                  className={disabled ? 'text-muted-foreground' : ''}
                >
                  <TableCell className="text-right tabular-nums">{r.index_number}</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap">{r.student_name}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {r.student_number}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <NumInput
                      value={r.school_days}
                      disabled={disabled}
                      onChange={(v) => update(r.enrolment_id, 'school_days', v)}
                      onBlur={() => saveRow(rows.find((x) => x.enrolment_id === r.enrolment_id)!)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumInput
                      value={r.days_present}
                      disabled={disabled}
                      onChange={(v) => update(r.enrolment_id, 'days_present', v)}
                      onBlur={() => saveRow(rows.find((x) => x.enrolment_id === r.enrolment_id)!)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumInput
                      value={r.days_late}
                      disabled={disabled}
                      onChange={(v) => update(r.enrolment_id, 'days_late', v)}
                      onBlur={() => saveRow(rows.find((x) => x.enrolment_id === r.enrolment_id)!)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Surface>
      {savingId && (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          saving…
        </div>
      )}
      {Object.entries(errors).map(([id, msg]) => (
        <div key={id} className="text-xs text-destructive">
          {msg}
        </div>
      ))}
    </div>
  );
}

function NumInput({
  value,
  disabled,
  onChange,
  onBlur,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (raw: string) => void;
  onBlur: () => void;
}) {
  const [text, setText] = useState<string>(value == null ? '' : String(value));
  return (
    <input
      type="number"
      min={0}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={onBlur}
      className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60"
    />
  );
}
