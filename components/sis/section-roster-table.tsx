"use client";

import { ArrowRightLeft } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  SectionTransferDialog,
  type SiblingSection,
} from "@/components/sis/section-transfer-dialog";

export type SectionRosterRow = {
  enrolmentId: string;
  indexNumber: number;
  studentName: string;
  studentNumber: string;
  enroleeNumber: string | null; // null when admissions row missing — Move disabled
  enrollmentStatus: "active" | "late_enrollee" | "withdrawn";
};

type StatusFilter = "all" | "active" | "late_enrollee" | "withdrawn";

export function SectionRosterTable({
  rows,
  ayCode,
  sectionName,
  siblings,
}: {
  rows: SectionRosterRow[];
  ayCode: string;
  sectionName: string;
  siblings: SiblingSection[];
}) {
  const [status, setStatus] = React.useState<StatusFilter>("active");

  const filtered = React.useMemo(() => {
    if (status === "all") return rows;
    return rows.filter((r) => r.enrollmentStatus === status);
  }, [rows, status]);

  const counts = React.useMemo(() => {
    let active = 0;
    let late = 0;
    let withdrawn = 0;
    for (const r of rows) {
      if (r.enrollmentStatus === "active") active += 1;
      else if (r.enrollmentStatus === "late_enrollee") late += 1;
      else withdrawn += 1;
    }
    return { all: rows.length, active, late, withdrawn };
  }, [rows]);

  return (
    <div className="space-y-3">
      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="active">
            Active <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.active}</span>
          </TabsTrigger>
          <TabsTrigger value="late_enrollee">
            Late <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.late}</span>
          </TabsTrigger>
          <TabsTrigger value="withdrawn">
            Withdrawn <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.withdrawn}</span>
          </TabsTrigger>
          <TabsTrigger value="all">
            All <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.all}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  No students match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.enrolmentId}
                  className={r.enrollmentStatus === "withdrawn" ? "text-muted-foreground" : ""}
                >
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {r.indexNumber}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span
                        className={
                          "font-medium " +
                          (r.enrollmentStatus === "withdrawn"
                            ? "line-through text-muted-foreground"
                            : "text-foreground")
                        }
                      >
                        {r.studentName}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.studentNumber}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.enrollmentStatus === "active" && (
                      <Badge
                        variant="outline"
                        className="h-6 border-brand-mint bg-brand-mint/30 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink"
                      >
                        Active
                      </Badge>
                    )}
                    {r.enrollmentStatus === "late_enrollee" && (
                      <Badge
                        variant="outline"
                        className="h-6 border-brand-indigo-soft/60 bg-accent px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-indigo-deep"
                      >
                        Late
                      </Badge>
                    )}
                    {r.enrollmentStatus === "withdrawn" && (
                      <Badge
                        variant="outline"
                        className="h-6 border-destructive/40 bg-destructive/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive"
                      >
                        Withdrawn
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.enrollmentStatus === "active" && r.enroleeNumber ? (
                      <SectionTransferDialog
                        enroleeNumber={r.enroleeNumber}
                        studentName={r.studentName}
                        fromSectionName={sectionName}
                        ayCode={ayCode}
                        siblings={siblings}
                        trigger={
                          <Button variant="ghost" size="sm" className="gap-1.5">
                            <ArrowRightLeft className="size-3" />
                            Move
                          </Button>
                        }
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
