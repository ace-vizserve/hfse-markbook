import { AlertTriangle, ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertIcon, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listChecklistItemsWithCreator } from "@/lib/evaluation/checklist";
import { getSessionUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// SIS Admin · Evaluation checklist topics — read-only audit view.
//
// Topic ownership shifted to subject teachers in migration 047. This page
// no longer offers add / edit / delete affordances; it surfaces who added
// what so school_admin / superadmin can audit teacher activity.
//
// Three-axis picker (term × subject × section) replaces the previous
// (term × subject × level) since topics are now per-section.

export default async function EvaluationChecklistsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ term_id?: string; subject_id?: string; section_id?: string }>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  if (sessionUser.role !== "school_admin" && sessionUser.role !== "superadmin") {
    redirect("/sis");
  }

  const sp = await searchParams;
  const service = createServiceClient();

  // Current AY → its terms (T4 excluded from Evaluation per KD #49).
  const { data: ay } = await service
    .from("academic_years")
    .select("id, ay_code")
    .eq("is_current", true)
    .single();
  if (!ay) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No current academic year configured.</div>
      </PageShell>
    );
  }

  const { data: termsRaw } = await service
    .from("terms")
    .select("id, label, term_number, is_current")
    .eq("academic_year_id", ay.id)
    .neq("term_number", 4)
    .order("term_number", { ascending: true });
  type TermLite = { id: string; label: string; term_number: number; is_current: boolean };
  const terms = (termsRaw ?? []) as TermLite[];

  const { data: subjectsRaw } = await service.from("subjects").select("id, code, name").order("name");
  type SubjectLite = { id: string; code: string; name: string };
  const subjects = (subjectsRaw ?? []) as SubjectLite[];

  // Sections in the current AY — what the new section-scoped picker reads.
  const { data: sectionsRaw } = await service
    .from("sections")
    .select("id, name, level:levels(id, label, code)")
    .eq("academic_year_id", ay.id)
    .order("name", { ascending: true });
  type SectionLite = {
    id: string;
    name: string;
    level: { id: string; label: string; code: string } | { id: string; label: string; code: string }[] | null;
  };
  const sections = ((sectionsRaw ?? []) as SectionLite[]).map((s) => ({
    id: s.id,
    name: s.name,
    levelLabel: (Array.isArray(s.level) ? s.level[0] : s.level)?.label ?? null,
  }));

  const selectedTermId = sp.term_id ?? terms.find((t) => t.is_current)?.id ?? terms[0]?.id ?? "";
  const selectedSubjectId = sp.subject_id ?? subjects[0]?.id ?? "";
  const selectedSectionId = sp.section_id ?? sections[0]?.id ?? "";

  const items =
    selectedTermId && selectedSubjectId && selectedSectionId
      ? await listChecklistItemsWithCreator(selectedTermId, selectedSubjectId, selectedSectionId)
      : [];

  const selectedSection = sections.find((s) => s.id === selectedSectionId);
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedTerm = terms.find((t) => t.id === selectedTermId);

  // Build query-string preserving the other axes for each filter link.
  function buildHref(next: Partial<{ term_id: string; subject_id: string; section_id: string }>) {
    const params = new URLSearchParams();
    const term_id = next.term_id ?? selectedTermId;
    const subject_id = next.subject_id ?? selectedSubjectId;
    const section_id = next.section_id ?? selectedSectionId;
    if (term_id) params.set("term_id", term_id);
    if (subject_id) params.set("subject_id", subject_id);
    if (section_id) params.set("section_id", section_id);
    return `?${params.toString()}`;
  }

  return (
    <PageShell>
      <Link
        href="/sis"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        SIS Admin
      </Link>

      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          SIS Admin · Evaluation checklists
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Checklist topics.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Read-only audit of the topics subject teachers have configured per
          (subject × section × term). PTC use only — never flows to the report card.
        </p>
      </header>

      <Alert variant="warning">
        <AlertIcon variant="warning">
          <AlertTriangle className="size-4" />
        </AlertIcon>
        <AlertTitle>Topics are now managed by subject teachers.</AlertTitle>
        <AlertDescription>
          Teachers add the topics they actually covered from their Evaluation
          section view — admin no longer seeds them. This page lets you see what
          each teacher has entered across all sections.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            {ay.ay_code}
          </CardDescription>
          <CardTitle className="font-serif text-lg font-semibold tracking-tight text-foreground">
            <span className="inline-flex items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                <ClipboardList className="size-4" />
              </div>
              Browse topics
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Three-axis picker (term × subject × section) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Term
              </label>
              <Select value={selectedTermId}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id} asChild>
                      <Link href={buildHref({ term_id: t.id })}>{t.label}</Link>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Subject
              </label>
              <Select value={selectedSubjectId}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id} asChild>
                      <Link href={buildHref({ subject_id: s.id })}>
                        {s.name}
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          {s.code}
                        </span>
                      </Link>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Section
              </label>
              <Select value={selectedSectionId}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id} asChild>
                      <Link href={buildHref({ section_id: s.id })}>
                        {s.name}
                        {s.levelLabel && (
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {s.levelLabel}
                          </span>
                        )}
                      </Link>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Read-only list */}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No topics yet for {selectedSubject?.name ?? "this subject"} in{" "}
              {selectedSection?.name ?? "this section"} · {selectedTerm?.label ?? ""}. The
              subject teacher will add them from their Evaluation view.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {items.map((item, idx) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground w-6 text-right">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 min-w-0 text-sm leading-snug text-foreground">
                    {item.item_text}
                  </span>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {item.creator_name && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {item.creator_name}
                      </Badge>
                    )}
                    {item.created_at && (
                      <span className="tabular-nums">
                        {new Date(item.created_at).toLocaleDateString("en-SG", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
