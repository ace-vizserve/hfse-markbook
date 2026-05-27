'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Inline popover for editing grade_entries.annual_letter_grade (KD #100).
// Registrar/school_admin/superadmin only — the server route enforces this.
// Shows a pencil button with the current value; opens a popover to override.
// When the override is cleared, the auto-derived letter is used instead.

export function AnnualLetterInput({
  sheetId,
  entryId,
  initialValue,
  derivedLetter,
  readOnly = false,
}: {
  sheetId: string;
  entryId: string;
  initialValue: string | null;
  derivedLetter: string | null;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialValue ?? '');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);

  const displayValue = saved.trim() || derivedLetter;
  const isOverride = !!saved.trim();
  const overrideDiffersFromDerived =
    isOverride && saved.trim() !== (derivedLetter ?? '');

  async function handleSave() {
    const trimmed = draft.trim();
    if (trimmed === saved.trim()) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/grading-sheets/${sheetId}/entries/${entryId}/annual-letter`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            annual_letter_grade: trimmed || null,
            correction_note: note.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error((body as { error?: string })?.error ?? 'Failed to save');
        return;
      }
      setSaved(trimmed);
      setNote('');
      setOpen(false);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(saved);
      setNote('');
    }
    setOpen(next);
  }

  if (readOnly) {
    return (
      <span
        className={cn(
          'inline-flex h-7 w-16 items-center justify-center font-mono text-[11px] tabular-nums',
          displayValue ? 'text-foreground font-medium' : 'text-muted-foreground'
        )}
      >
        {displayValue ?? '—'}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-7 w-16 items-center justify-center gap-1 rounded border font-mono text-[11px] tabular-nums transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            overrideDiffersFromDerived
              ? 'border-brand-amber/60 text-brand-amber'
              : isOverride
                ? 'border-border text-foreground'
                : 'border-border text-muted-foreground'
          )}
        >
          <span>{displayValue ?? '—'}</span>
          <Pencil className="h-2.5 w-2.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="center" side="left">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Final Grade Override
            </Label>
            {derivedLetter && (
              <p className="text-xs text-muted-foreground">
                Auto-derived:{' '}
                <span className="font-mono font-medium text-foreground">
                  {derivedLetter}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`override-${entryId}`} className="text-xs">
              Override value
            </Label>
            <Input
              id={`override-${entryId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={derivedLetter ?? 'e.g. A'}
              className="h-7 font-mono text-center text-[11px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Leave blank to use the auto-derived letter
            </p>
          </div>
          <div className="rounded-md border border-brand-amber/40 bg-brand-amber/10 px-3 py-2 text-[11px] leading-relaxed text-brand-amber">
            This updates the student&rsquo;s year-end Final Grade on the report
            card. The change will be logged and all school admins and
            superadmins will be notified.
          </div>
          <div className="space-y-1">
            <Label htmlFor={`note-${entryId}`} className="text-xs">
              Reason for change <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id={`note-${entryId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this Final Grade being changed?"
              rows={2}
              className="resize-none text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || !note.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
