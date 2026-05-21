'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CURRICULUM_TRACKS,
  CURRICULUM_TRACK_LABELS,
  SectionUpdateSchema,
  type SectionUpdateInput,
  type CurriculumTrack,
} from '@/lib/schemas/section';

export function SectionRenameDialog({
  sectionId,
  currentName,
  currentCurriculumTrack,
}: {
  sectionId: string;
  currentName: string;
  currentCurriculumTrack: CurriculumTrack;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<SectionUpdateInput>({
    resolver: zodResolver(SectionUpdateSchema),
    defaultValues: { name: currentName, curriculum_track: currentCurriculumTrack },
  });

  async function onSubmit(values: SectionUpdateInput) {
    const nextName = values.name?.trim() ?? currentName;
    const nextTrack = values.curriculum_track ?? currentCurriculumTrack;
    const nameChanged = nextName !== currentName;
    const trackChanged = nextTrack !== currentCurriculumTrack;
    if (!nameChanged && !trackChanged) {
      setOpen(false);
      return;
    }
    const payload: Record<string, string> = {};
    if (nameChanged) payload.name = nextName;
    if (trackChanged) payload.curriculum_track = nextTrack;
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'update failed');
      const parts: string[] = [];
      if (nameChanged) parts.push(`renamed to ${nextName}`);
      if (trackChanged) parts.push(`track set to ${CURRICULUM_TRACK_LABELS[nextTrack]}`);
      toast.success(`Section ${parts.join(', ')}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'update failed');
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset({ name: currentName, curriculum_track: currentCurriculumTrack });
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit section</DialogTitle>
          <DialogDescription>
            Update the section name or curriculum track. Level and academic year stay the same.
            Existing rosters, grading sheets, and report cards follow automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section name</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="e.g. Patience" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="curriculum_track"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Curriculum track</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a track" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CURRICULUM_TRACKS.map((track) => (
                        <SelectItem key={track} value={track}>
                          {CURRICULUM_TRACK_LABELS[track]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="gap-1.5">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
