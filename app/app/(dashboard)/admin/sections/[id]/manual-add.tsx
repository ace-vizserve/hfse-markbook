'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ManualAddStudent({
  sectionId,
  nextIndex,
}: {
  sectionId: string;
  nextIndex: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    student_number: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    late_enrollee: false,
  });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sections/${sectionId}/students`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          student_number: form.student_number.trim(),
          last_name: form.last_name.trim(),
          first_name: form.first_name.trim(),
          middle_name: form.middle_name.trim() || null,
          enrollment_status: form.late_enrollee ? 'late_enrollee' : 'active',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'failed');
      setOpen(false);
      setForm({ student_number: '', last_name: '', first_name: '', middle_name: '', late_enrollee: false });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Manually add student
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Manually add student</h3>
            <span className="text-xs text-muted-foreground">
              will be assigned index #{nextIndex}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Student number"
              required
              value={form.student_number}
              onChange={(v) => setForm({ ...form, student_number: v })}
            />
            <Field
              label="Last name"
              required
              value={form.last_name}
              onChange={(v) => setForm({ ...form, last_name: v })}
            />
            <Field
              label="First name"
              required
              value={form.first_name}
              onChange={(v) => setForm({ ...form, first_name: v })}
            />
            <Field
              label="Middle name"
              value={form.middle_name}
              onChange={(v) => setForm({ ...form, middle_name: v })}
            />
          </div>

          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={form.late_enrollee}
              onCheckedChange={(v) => setForm({ ...form, late_enrollee: v === true })}
            />
            Late enrollee (assessments before enrolment will be marked N/A)
          </Label>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {busy ? 'Adding…' : 'Add student'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const id = `field-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
