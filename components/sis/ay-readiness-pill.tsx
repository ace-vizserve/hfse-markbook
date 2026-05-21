"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role } from "@/lib/auth/roles";
import type { AyReadiness, ReadinessStep } from "@/lib/sis/readiness";

type Props = {
  readiness: AyReadiness;
  role: Role | null;
};

export function AyReadinessPill({ readiness, role }: Props) {
  const [open, setOpen] = useState(false);

  if (role !== "school_admin" && role !== "superadmin") return null;
  if (readiness.complete === readiness.total) return null;

  const pct = Math.round((readiness.complete / readiness.total) * 100);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-border bg-background px-4 py-2 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
        aria-label="Open AY setup readiness"
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-indigo to-brand-navy shadow-brand-tile">
          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="text-left">
          <p className="text-[11px] font-semibold leading-tight text-foreground">
            {readiness.ayCode} readiness
          </p>
          <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-mint transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {readiness.complete} of 4 complete
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              SIS Admin · {readiness.ayCode}
            </p>
            <DialogTitle className="font-serif text-xl font-semibold tracking-tight">
              Year Setup Readiness
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Steps can be completed in any order.
            </p>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-2">
            {readiness.steps.map((step) => (
              <ReadinessRow key={step.id} step={step} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
            <span className="font-semibold">
              {readiness.complete} of 4 complete
            </span>
            <span>Steps can be completed in any order</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadinessRow({
  step,
  onNavigate,
}: {
  step: ReadinessStep;
  onNavigate: () => void;
}) {
  const isDone = step.status === "done";
  const isPartial = step.status === "partial";

  const rowBg = isDone
    ? "bg-brand-mint/10 border-brand-mint/30"
    : isPartial
      ? "bg-brand-amber/10 border-brand-amber/30"
      : "bg-background border-border";

  const iconEl = isDone ? (
    <CheckCircle2 className="h-5 w-5 text-brand-mint" />
  ) : isPartial ? (
    <Clock className="h-5 w-5 text-brand-amber" />
  ) : (
    <Circle className="h-5 w-5 text-muted-foreground/40" />
  );

  const pct =
    step.fraction && step.fraction.total > 0
      ? Math.round((step.fraction.done / step.fraction.total) * 100)
      : 0;

  const barColor = isDone
    ? "bg-brand-mint"
    : isPartial
      ? "bg-brand-amber"
      : "bg-muted";

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${rowBg}`}>
      <div className="mt-0.5 flex-shrink-0">{iconEl}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${isDone || isPartial ? "text-foreground" : "text-muted-foreground"}`}>
          {step.label}
        </p>
        {step.fraction && step.fraction.total > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`flex-shrink-0 font-mono text-[10px] font-semibold ${isDone ? "text-brand-mint" : isPartial ? "text-brand-amber" : "text-muted-foreground"}`}>
              {step.fraction.done}/{step.fraction.total}
            </span>
          </div>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">{step.description}</p>
      </div>
      <Link
        href={step.href}
        onClick={onNavigate}
        className="mt-0.5 flex-shrink-0 text-[11px] font-medium text-brand-indigo hover:underline"
      >
        Open →
      </Link>
    </div>
  );
}
