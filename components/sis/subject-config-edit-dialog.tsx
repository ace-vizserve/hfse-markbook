"use client";

import { AlertCircle, CheckCircle2, Loader2, Save, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubjectConfigUpdateSchema } from "@/lib/schemas/subject-config";
import { cn } from "@/lib/utils";

export type SubjectConfigDraft = {
  configId: string;
  subjectCode: string;
  subjectName: string;
  levelCode: string;
  levelLabel: string;
  ayCode: string;
  ww_weight: number; // integer percentage
  pt_weight: number;
  qa_weight: number;
  ww_max_slots: number;
  pt_max_slots: number;
  qa_max: number; // max possible QA score (default 30 per Hard Rule #1)
};

export function SubjectConfigEditDialog({
  draft,
  open,
  onOpenChange,
}: {
  draft: SubjectConfigDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [ww, setWw] = useState("40");
  const [pt, setPt] = useState("40");
  const [qa, setQa] = useState("20");
  const [wwSlots, setWwSlots] = useState("5");
  const [ptSlots, setPtSlots] = useState("5");
  const [qaMax, setQaMax] = useState("30");
  const [saving, setSaving] = useState(false);

  // Re-seed on draft change (i.e., user opened the dialog for a different row).
  useEffect(() => {
    if (!draft) return;
    setWw(String(draft.ww_weight));
    setPt(String(draft.pt_weight));
    setQa(String(draft.qa_weight));
    setWwSlots(String(draft.ww_max_slots));
    setPtSlots(String(draft.pt_max_slots));
    setQaMax(String(draft.qa_max));
  }, [draft]);

  const wwN = Number(ww) || 0;
  const ptN = Number(pt) || 0;
  const qaN = Number(qa) || 0;
  const sum = wwN + ptN + qaN;
  const sumOk = sum === 100;

  const parsed = SubjectConfigUpdateSchema.safeParse({
    ww_weight: wwN,
    pt_weight: ptN,
    qa_weight: qaN,
    ww_max_slots: Number(wwSlots) || 0,
    pt_max_slots: Number(ptSlots) || 0,
    qa_max: Number(qaMax) || 0,
  });

  async function save() {
    if (!draft) return;
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid values");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sis/admin/subjects/${draft.configId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "save failed");
      toast.success(`${draft.subjectName} · ${draft.levelCode}: ${wwN}·${ptN}·${qaN} · QA/${Number(qaMax)}`);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl!">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {/* §7.4 gradient icon tile — anchors the dialog's purpose visually. */}
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
              <Scale className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {draft ? `${draft.ayCode} · ${draft.levelLabel}` : "Subject weights"}
              </p>
              <DialogTitle className="font-serif text-xl font-semibold leading-tight tracking-tight text-foreground">
                {draft ? `${draft.subjectName} · ${draft.levelCode}` : "Subject weights"}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                {draft
                  ? "Changes apply to every grading sheet for this (subject × level) inside the AY."
                  : "Pick a cell to edit."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {draft && (
          <div className="space-y-5">
            {/* Section 1 — Weights. Labeled panel with tinted header + three
                inline fields + inline live sum validator. */}
            <section className="overflow-hidden rounded-xl border border-hairline bg-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <header className="flex items-center justify-between gap-3 border-b border-hairline bg-muted/30 px-4 py-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  1 · Weights
                </p>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                    sumOk
                      ? "border-brand-mint/60 bg-brand-mint/20 text-ink"
                      : "border-destructive/40 bg-destructive/10 text-destructive",
                  )}>
                  {sumOk ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                  <span className="tabular-nums">{sum}</span>%
                  <span>{sumOk ? "· Valid" : sum < 100 ? `· need ${100 - sum}` : `· over ${sum - 100}`}</span>
                </span>
              </header>
              <div className="grid grid-cols-3 gap-3 p-4">
                <WeightField label="WW · Written Works" value={ww} setValue={setWw} />
                <WeightField label="PT · Perf. Tasks" value={pt} setValue={setPt} />
                <WeightField label="QA · Quarterly" value={qa} setValue={setQa} />
              </div>
              <p className="border-t border-hairline bg-muted/10 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
                Three percentages must sum to 100. Canonical HFSE profiles: Primary 40·40·20, Secondary 30·50·20.
              </p>
            </section>

            {/* Section 2 — Max slots per sheet. */}
            <section className="overflow-hidden rounded-xl border border-hairline bg-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <header className="border-b border-hairline bg-muted/30 px-4 py-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  2 · Max slots per sheet
                </p>
              </header>
              <div className="grid grid-cols-2 gap-3 p-4">
                <SlotField label="WW slots" value={wwSlots} setValue={setWwSlots} />
                <SlotField label="PT slots" value={ptSlots} setValue={setPtSlots} />
              </div>
              <p className="border-t border-hairline bg-muted/10 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
                Hard cap 5 per KD #5. Lowering won&apos;t delete existing entries — only caps future additions.
              </p>
            </section>

            {/* Section 3 — QA assessment max. */}
            <section className="overflow-hidden rounded-xl border border-hairline bg-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <header className="border-b border-hairline bg-muted/30 px-4 py-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  3 · QA assessment max
                </p>
              </header>
              <div className="grid grid-cols-[1fr_2fr] items-center gap-3 p-4">
                <div className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Max score
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={qaMax}
                    onChange={(e) => setQaMax(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    className="h-10 text-right font-mono tabular-nums"
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Denominator of the QA percentage. Canonical 30 per Hard Rule #1; vary per subject (e.g. 50 for Math,
                  20 for Art). Range 1–100.
                </p>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!draft || saving || !parsed.success} className="gap-1.5">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WeightField({ label, value, setValue }: { label: string; value: string; setValue: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          className="h-10 pr-7 text-right font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}

function SlotField({ label, value, setValue }: { label: string; value: string; setValue: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 1))}
        className="h-10 text-right font-mono tabular-nums"
      />
    </div>
  );
}
