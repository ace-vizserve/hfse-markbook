// lib/sis/readiness.ts
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type ReadinessStepId =
  | "ay-setup"
  | "calendar"
  | "sections"
  | "grading-sheets";

export type ReadinessStep = {
  id: ReadinessStepId;
  step: number;
  label: string;
  description: string;
  href: string;
  status: "done" | "partial" | "not_started";
  fraction?: { done: number; total: number };
};

export type AyReadiness = {
  ayCode: string;
  steps: ReadinessStep[];
  complete: number;
  total: 4;
};

async function checkAySetup(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "ay-setup",
    step: 1,
    label: "AY Setup",
    href: "/sis/ay-setup",
  };

  const { count } = await db
    .from("terms")
    .select("id", { count: "exact", head: true })
    .eq("academic_year_id", ayId)
    .not("start_date", "is", null)
    .not("end_date", "is", null);

  const done = (count ?? 0) > 0;
  return {
    ...base,
    status: done ? "done" : "not_started",
    description: done
      ? "Academic year active with dated terms"
      : "Create the academic year and define term dates",
  };
}

async function checkCalendar(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "calendar",
    step: 2,
    label: "School Calendar",
    href: "/sis/calendar",
  };

  const { count: totalTerms } = await db
    .from("terms")
    .select("id", { count: "exact", head: true })
    .eq("academic_year_id", ayId);

  if (!totalTerms || totalTerms === 0) {
    return { ...base, status: "not_started", description: "Define AY terms first" };
  }

  const { data: termIds } = await db
    .from("terms")
    .select("id")
    .eq("academic_year_id", ayId);

  const ids = (termIds ?? []).map((t) => t.id);

  const { data: coveredRows } = await db
    .from("school_calendar")
    .select("term_id")
    .in("term_id", ids);

  const coveredTerms = new Set((coveredRows ?? []).map((r) => r.term_id)).size;
  const done = coveredTerms === totalTerms;

  return {
    ...base,
    status: done ? "done" : coveredTerms > 0 ? "partial" : "not_started",
    description: done
      ? "All terms have calendar coverage"
      : `${coveredTerms} of ${totalTerms} terms have calendar entries`,
  };
}

async function checkSections(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description"> = {
    id: "sections",
    step: 3,
    label: "Sections",
    href: "/sis/sections",
  };

  const { data: sectionIds } = await db
    .from("sections")
    .select("id")
    .eq("academic_year_id", ayId)
    .not("level_id", "is", null);

  if (!sectionIds || sectionIds.length === 0) {
    return { ...base, status: "not_started", description: "No sections created for this AY" };
  }

  const ids = sectionIds.map((s) => s.id);

  const { count: advisedCount } = await db
    .from("teacher_assignments")
    .select("id", { count: "exact", head: true })
    .in("section_id", ids)
    .eq("role", "form_adviser");

  const done = (advisedCount ?? 0) > 0;
  return {
    ...base,
    status: done ? "done" : "partial",
    description: done
      ? `${sectionIds.length} sections created with form advisers assigned`
      : `${sectionIds.length} sections created — assign form advisers`,
  };
}

async function checkGradingSheets(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "grading-sheets",
    step: 4,
    label: "Grading Sheets",
    href: "/markbook/sections",
  };

  const { data: allSections } = await db
    .from("sections")
    .select("id")
    .eq("academic_year_id", ayId);

  const totalSections = (allSections ?? []).length;

  if (totalSections === 0) {
    return {
      ...base,
      status: "not_started",
      description: "Create sections first",
      fraction: { done: 0, total: 0 },
    };
  }

  const sectionIds = allSections!.map((s) => s.id);

  const { data: sheetRows } = await db
    .from("grading_sheets")
    .select("section_id")
    .in("section_id", sectionIds);

  const sectionsWithSheets = new Set((sheetRows ?? []).map((r) => r.section_id)).size;
  const done = sectionsWithSheets === totalSections;

  return {
    ...base,
    status: done ? "done" : sectionsWithSheets > 0 ? "partial" : "not_started",
    description: done
      ? "Grading sheets created for all sections"
      : sectionsWithSheets > 0
        ? `${sectionsWithSheets} of ${totalSections} sections have grading sheets`
        : "Bulk-create grading sheets in Markbook → Sections",
    fraction: { done: sectionsWithSheets, total: totalSections },
  };
}

function buildAllNotStarted(ayCode: string): AyReadiness {
  const steps: ReadinessStep[] = [
    { id: "ay-setup", step: 1, label: "AY Setup", href: "/sis/ay-setup", status: "not_started", description: "Create the academic year and define term dates" },
    { id: "calendar", step: 2, label: "School Calendar", href: "/sis/calendar", status: "not_started", description: "Generate school days for all terms" },
    { id: "sections", step: 3, label: "Sections", href: "/sis/sections", status: "not_started", description: "Create sections and assign form advisers" },
    { id: "grading-sheets", step: 4, label: "Grading Sheets", href: "/markbook/sections", status: "not_started", description: "Bulk-create grading sheets in Markbook → Sections", fraction: { done: 0, total: 0 } },
  ];
  return { ayCode, steps, complete: 0, total: 4 };
}

async function getAyReadinessUncached(ayCode: string): Promise<AyReadiness> {
  const db = createServiceClient();

  const { data: ay } = await db
    .from("academic_years")
    .select("id")
    .eq("ay_code", ayCode)
    .maybeSingle();

  if (!ay) return buildAllNotStarted(ayCode);

  const [step1, step2, step3, step4] = await Promise.all([
    checkAySetup(db, ay.id),
    checkCalendar(db, ay.id),
    checkSections(db, ay.id),
    checkGradingSheets(db, ay.id),
  ]);

  const steps = [step1, step2, step3, step4];
  const complete = steps.filter((s) => s.status === "done").length;
  return { ayCode, steps, complete, total: 4 };
}

export const getAyReadiness = (ayCode: string) =>
  unstable_cache(
    () => getAyReadinessUncached(ayCode),
    [`sis-readiness-${ayCode}`],
    { tags: [`sis:${ayCode}`], revalidate: 60 },
  )();
