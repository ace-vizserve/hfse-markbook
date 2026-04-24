'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  SubjectConfigEditDialog,
  type SubjectConfigDraft,
} from '@/components/sis/subject-config-edit-dialog';
import { cn } from '@/lib/utils';

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
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 z-10 w-[220px] bg-muted/40">Subject</TableHead>
                {levels.map((l) => (
                  <TableHead
                    key={l.id}
                    className="min-w-[96px] text-center font-mono text-[10px]"
                  >
                    <div className="font-semibold text-foreground">{l.code}</div>
                    <div className="text-[9px] font-normal normal-case text-muted-foreground">
                      {l.label}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={levels.length + 1}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No subjects configured. Seed them via SQL first.
                  </TableCell>
                </TableRow>
              )}
              {subjects.map((s) => (
                <TableRow key={s.id} className="group transition-colors hover:bg-muted/20">
                  <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-sm font-semibold text-foreground">
                        {s.name}
                      </span>
                      {!s.is_examinable && <Badge variant="muted">Non-exam</Badge>}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">{s.code}</div>
                  </TableCell>
                  {levels.map((l) => {
                    const cfg = byKey.get(`${s.id}|${l.id}`);
                    if (!cfg) {
                      return (
                        <TableCell key={l.id} className="text-center">
                          <span className="font-mono text-[11px] text-muted-foreground/60">—</span>
                        </TableCell>
                      );
                    }
                    const ww = Math.round(cfg.ww_weight * 100);
                    const pt = Math.round(cfg.pt_weight * 100);
                    const qa = Math.round(cfg.qa_weight * 100);
                    const weightsOk = ww + pt + qa === 100;
                    return (
                      <TableCell key={l.id} className="text-center">
                        <button
                          type="button"
                          onClick={() => openCell(s, l, cfg)}
                          className={cn(
                            'inline-flex w-full flex-col items-center gap-0.5 rounded-md border bg-background px-2 py-1.5 shadow-input transition-all',
                            'hover:-translate-y-0.5 hover:border-brand-indigo-soft hover:bg-accent hover:shadow-sm',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/20 focus-visible:border-brand-indigo/60',
                            weightsOk ? 'border-hairline' : 'border-destructive/40 bg-destructive/5',
                          )}
                          title={`Edit ${s.name} × ${l.code} — weights ${ww}/${pt}/${qa} · slots ${cfg.ww_max_slots}/${cfg.pt_max_slots} · QA/${cfg.qa_max}`}
                        >
                          <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                            {ww}·{pt}·{qa}
                          </span>
                          <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                            {cfg.ww_max_slots}/{cfg.pt_max_slots} · QA/{cfg.qa_max}
                          </span>
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <SubjectConfigEditDialog draft={draft} open={open} onOpenChange={setOpen} />
    </>
  );
}
