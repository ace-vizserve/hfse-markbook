"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCog,
  CalendarDays,
  CheckCircle2,
  ChevronUp,
  ClipboardCheck,
  LayoutGrid,
  Minus,
  TableProperties,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Role } from "@/lib/auth/roles";
import type { AyReadiness, ReadinessStep, ReadinessStepId } from "@/lib/sis/readiness";

type Props = {
  readiness: AyReadiness;
  role: Role | null;
};

const STEP_ICONS: Record<ReadinessStepId, LucideIcon> = {
  "ay-setup": CalendarCog,
  calendar: CalendarDays,
  sections: LayoutGrid,
  "grading-sheets": TableProperties,
};

export function AyReadinessPill({ readiness, role }: Props) {
  const [open, setOpen] = useState(false);

  if (role !== "school_admin" && role !== "superadmin") return null;
  if (readiness.complete === readiness.total) return null;

  const pct = Math.round((readiness.complete / readiness.total) * 100);

  return (
    <>
      {/* ── Floating trigger ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/40"
        aria-label="Open year setup readiness"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
          <ClipboardCheck className="size-4" />
        </div>

        <div className="text-left">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Year Setup · {readiness.ayCode}
          </p>
          <p className="mt-0.5 font-serif text-sm font-semibold leading-tight text-foreground">
            {readiness.complete}{" "}
            <span className="font-sans text-[13px] font-normal text-muted-foreground">
              of {readiness.total} complete
            </span>
          </p>
          <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-mint transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* ── Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          {/* Header */}
          <div className="border-b border-hairline bg-gradient-to-b from-primary/5 to-card px-6 pb-5 pt-6">
            <DialogHeader className="gap-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                SIS Admin · {readiness.ayCode}
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <DialogTitle className="font-serif text-xl font-semibold leading-tight tracking-tight text-foreground">
                  Year Setup Readiness
                </DialogTitle>
                <Badge
                  variant={readiness.complete === readiness.total ? "success" : "warning"}
                  className="h-6">
                  {readiness.complete} / {readiness.total}
                </Badge>
              </div>
              <p className="text-[13px] text-muted-foreground">Steps can be completed in any order.</p>
            </DialogHeader>
          </div>

          {/* Step rows */}
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 p-4">
              {readiness.steps.map((step) => (
                <ReadinessRow
                  key={step.id}
                  step={step}
                  icon={STEP_ICONS[step.id]}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-hairline bg-muted/30 px-6 py-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {readiness.complete} of {readiness.total} steps complete
            </span>
            <span className="text-[11px] text-muted-foreground">Steps can be completed in any order</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadinessRow({
  step,
  icon: Icon,
  onNavigate,
}: {
  step: ReadinessStep;
  icon: LucideIcon;
  onNavigate: () => void;
}) {
  const isDone = step.status === "done";
  const isPartial = step.status === "partial";

  const tileClass = isDone
    ? "bg-gradient-to-br from-brand-mint to-brand-sky shadow-brand-tile-mint"
    : isPartial
      ? "bg-gradient-to-br from-brand-amber to-brand-amber/80 shadow-brand-tile-amber"
      : "border border-hairline bg-muted/60";

  const pct =
    step.fraction && step.fraction.total > 0
      ? Math.round((step.fraction.done / step.fraction.total) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-hairline bg-card p-3.5 ring-1 ring-inset ring-border/40">
      <div className="flex items-start gap-3">
        {/* Status icon tile */}
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tileClass}`}>
          {isDone ? (
            <CheckCircle2 className="size-4 text-white" />
          ) : isPartial ? (
            <Icon className="size-4 text-white" />
          ) : (
            <span className="font-mono text-[11px] font-bold text-muted-foreground">
              {String(step.step).padStart(2, "0")}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Step {step.step}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-serif text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              {step.label}
            </p>
            <Badge
              variant={isDone ? "success" : isPartial ? "warning" : "secondary"}
              className="h-5">
              {isDone ? (
                <>
                  <CheckCircle2 />
                  Done
                </>
              ) : isPartial ? (
                <>
                  <Minus />
                  In progress
                </>
              ) : (
                "Not started"
              )}
            </Badge>
          </div>

          {/* Fraction progress bar — only for steps that track coverage */}
          {step.fraction && step.fraction.total > 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    isDone ? "bg-brand-mint" : isPartial ? "bg-brand-amber" : "bg-muted-foreground/30"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={`shrink-0 font-mono text-[10px] font-semibold ${
                  isDone ? "text-brand-mint" : isPartial ? "text-brand-amber" : "text-muted-foreground"
                }`}>
                {step.fraction.done}/{step.fraction.total}
              </span>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">{step.description}</p>
        </div>

        {/* Open action */}
        <Link
          href={step.href}
          onClick={onNavigate}
          className="mt-0.5 shrink-0 rounded-md border border-hairline bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-input transition-colors hover:bg-muted">
          Open →
        </Link>
      </div>
    </div>
  );
}
