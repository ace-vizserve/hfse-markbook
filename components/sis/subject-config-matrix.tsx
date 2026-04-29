"use client";

import { useState } from "react";

import { SubjectConfigEditDialog, type SubjectConfigDraft } from "@/components/sis/subject-config-edit-dialog";
import {
  classifyProfile,
  PROFILE_CLASS,
  PROFILE_TEXT,
  ProfileLegendChip,
} from "@/components/sis/weight-profile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Subject = { id: string; code: string; name: string; is_examinable: boolean };
type Level = { id: string; code: string; label: string };
type Config = {
  id: string;
  subject_id: string;
  level_id: string;
  ww_weight: number;
  pt_weight: number;
  qa_weight: number;
  ww_max_slots: number;
  pt_max_slots: number;
  qa_max: number;
};

// Weight profile classification + chip styling shared with the
// /sis/admin/template editor — see `@/components/sis/weight-profile`.
// Edit the recipe there to update both surfaces at once.

export function SubjectConfigMatrix({
  subjects,
  levels,
  configs,
  ayCode,
}: {
  subjects: Subject[];
  levels: Level[];
  configs: Config[];
  ayCode: string;
}) {
  const [draft, setDraft] = useState<SubjectConfigDraft | null>(null);
  const [open, setOpen] = useState(false);

  // Index: key = `${subject_id}|${level_id}`, value = config
  const byKey = new Map<string, Config>();
  for (const c of configs) {
    byKey.set(`${c.subject_id}|${c.level_id}`, c);
  }

  function openCell(subject: Subject, level: Level, config: Config) {
    setDraft({
      configId: config.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      levelCode: level.code,
      levelLabel: level.label,
      ayCode,
      ww_weight: Math.round(config.ww_weight * 100),
      pt_weight: Math.round(config.pt_weight * 100),
      qa_weight: Math.round(config.qa_weight * 100),
      ww_max_slots: config.ww_max_slots,
      pt_max_slots: config.pt_max_slots,
      qa_max: config.qa_max,
    });
    setOpen(true);
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-b from-muted/60 to-muted/30 hover:from-muted/60 hover:to-muted/30">
                <TableHead className="sticky left-0 z-10 w-[220px] border-r border-hairline bg-gradient-to-b from-muted/60 to-muted/30">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                    Subject
                  </span>
                </TableHead>
                {levels.map((l) => (
                  <TableHead key={l.id} className="min-w-[108px] p-2 text-center align-middle">
                    <div className="mx-auto inline-flex flex-col items-center gap-0.5 rounded-md border border-hairline bg-gradient-to-b from-background to-accent px-2 py-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
                        {l.code}
                      </span>
                      <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground">{l.label}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={levels.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                    No subjects configured. Seed them via SQL first.
                  </TableCell>
                </TableRow>
              )}
              {subjects.map((s, rowIdx) => {
                // Alternating row stripes — both as low-opacity gradients so
                // they read as part of the same gradient-craft language as the
                // header row + cell tints (no flat washes).
                const stripeBg =
                  rowIdx % 2 === 1
                    ? "bg-gradient-to-b from-muted/20 to-muted/30"
                    : "bg-gradient-to-b from-background to-muted/10";
                const hoverBg =
                  "hover:from-accent/30 hover:to-accent/40 group-hover:from-accent/30 group-hover:to-accent/40";
                return (
                  <TableRow key={s.id} className={cn("group transition-colors", stripeBg, hoverBg)}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 border-r border-hairline transition-colors",
                        "border-l-2 border-l-brand-indigo",
                        stripeBg,
                        hoverBg,
                      )}>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-semibold text-foreground">{s.name}</span>
                        {!s.is_examinable && <Badge variant="muted">Non-exam</Badge>}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {s.code}
                      </div>
                    </TableCell>
                    {levels.map((l) => {
                      const cfg = byKey.get(`${s.id}|${l.id}`);
                      if (!cfg) {
                        return (
                          <TableCell key={l.id} className="p-2 text-center">
                            <span className="font-mono text-[11px] text-muted-foreground/60">—</span>
                          </TableCell>
                        );
                      }
                      const ww = Math.round(cfg.ww_weight * 100);
                      const pt = Math.round(cfg.pt_weight * 100);
                      const qa = Math.round(cfg.qa_weight * 100);
                      // classifyProfile returns 'invalid' when sum != 100,
                      // so the override-on-invalid logic the matrix used
                      // to need lives inside PROFILE_CLASS now.
                      const profile = classifyProfile(ww, pt, qa);
                      return (
                        <TableCell key={l.id} className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => openCell(s, l, cfg)}
                            className={cn(
                              "inline-flex w-full flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-all",
                              "hover:-translate-y-0.5 hover:shadow-md",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/40",
                              PROFILE_CLASS[profile],
                            )}
                            title={`Edit ${s.name} × ${l.code} — weights ${ww}/${pt}/${qa} · slots ${cfg.ww_max_slots}/${cfg.pt_max_slots} · QA/${cfg.qa_max} · ${profile}`}>
                            <span
                              className={cn(
                                "font-mono text-[12px] font-semibold tabular-nums",
                                PROFILE_TEXT[profile].code,
                              )}>
                              {ww}·{pt}·{qa}
                            </span>
                            <span
                              className={cn(
                                "font-mono text-[9px] tabular-nums",
                                PROFILE_TEXT[profile].ratio,
                              )}>
                              {cfg.ww_max_slots}/{cfg.pt_max_slots} · QA/{cfg.qa_max}
                            </span>
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {/* Profile legend strip — uses the same ProfileLegendChip the
            template editor uses, so legend ↔ cell visual mapping is 1:1
            across both surfaces. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-muted/25 px-4 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          <ProfileLegendChip profile="primary" label="Primary · 40·40·20" />
          <ProfileLegendChip profile="secondary" label="Secondary · 30·50·20" />
          <ProfileLegendChip profile="custom" label="Custom" />
          <ProfileLegendChip profile="invalid" label="Invalid · sum ≠ 100" />
        </div>
      </Card>

      <SubjectConfigEditDialog draft={draft} open={open} onOpenChange={setOpen} />
    </>
  );
}
