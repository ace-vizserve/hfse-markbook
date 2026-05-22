// lib/sis/readiness.ts
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type ReadinessStepId =
  | "ay-setup"
  | "calendar"
  | "sections"
  | "sow"
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
  total: 5;
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

async function checkSow(db: SupabaseClient, ayId: string): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "sow",
    step: 4,
    label: "Scheme of Work",
    href: "/sis/admin/sow",
  };

  const [{ data: sections }, { data: terms }] = await Promise.all([
    db.from("sections").select("level_id, curriculum_track").eq("academic_year_id", ayId),
    db.from("terms").select("id").eq("academic_year_id", ayId),
  ]);

  if (!sections?.length || !terms?.length) {
    return { ...base, status: "not_started", description: "Create sections and terms first", fraction: { done: 0, total: 0 } };
  }

  const levelTracks = [
    ...new Map(sections.map((s) => [`${s.level_id}:${s.curriculum_track}`, s])).values(),
  ];
  const levelIds = [...new Set(levelTracks.map((s) => s.level_id))];

  const { data: configs } = await db
    .from("subject_configs")
    .select("subject_id, level_id")
    .eq("academic_year_id", ayId)
    .in("level_id", levelIds);

  if (!configs?.length) {
    return { ...base, status: "not_started", description: "No subjects configured for this AY", fraction: { done: 0, total: 0 } };
  }

  // Build the full needed scope set: (term × subject × level × curriculum_track)
  const neededKeys = new Set<string>();
  for (const lt of levelTracks) {
    for (const term of terms) {
      for (const cfg of configs.filter((c) => c.level_id === lt.level_id)) {
        neededKeys.add(`${term.id}:${cfg.subject_id}:${lt.level_id}:${lt.curriculum_track}`);
      }
    }
  }
  const total = neededKeys.size;
  if (total === 0) {
    return { ...base, status: "not_started", description: "No SOW scopes to cover", fraction: { done: 0, total: 0 } };
  }

  // Get all masters with at least one published version for this AY
  const { data: masters } = await db
    .from("sow_master_templates")
    .select("term_id, subject_id, level_id, curriculum_track, sow_published_versions(id)")
    .eq("ay_id", ayId);

  const publishedKeys = new Set(
    (masters ?? [])
      .filter((m) => ((m.sow_published_versions as { id: string }[] | null)?.length ?? 0) > 0)
      .map((m) => `${m.term_id}:${m.subject_id}:${m.level_id}:${m.curriculum_track}`),
  );

  const done = [...neededKeys].filter((k) => publishedKeys.has(k)).length;
  const allDone = done === total;

  return {
    ...base,
    status: allDone ? "done" : done > 0 ? "partial" : "not_started",
    description: allDone
      ? "All subject-term scopes have approved SOW"
      : `${done} of ${total} subject-term scopes have approved SOW`,
    fraction: { done, total },
  };
}

async function checkGradingSheets(db: SupabaseClient, ayId: string, sowDone: boolean): Promise<ReadinessStep> {
  const base: Omit<ReadinessStep, "status" | "description" | "fraction"> = {
    id: "grading-sheets",
    step: 5,
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

  const notStartedDesc = sowDone
    ? "Bulk-create grading sheets in Markbook → Sections"
    : "Approve SOW first — grading sheets will be generated automatically on apply";

  return {
    ...base,
    status: done ? "done" : sectionsWithSheets > 0 ? "partial" : "not_started",
    description: done
      ? "Grading sheets created for all sections"
      : sectionsWithSheets > 0
        ? `${sectionsWithSheets} of ${totalSections} sections have grading sheets`
        : notStartedDesc,
    fraction: { done: sectionsWithSheets, total: totalSections },
  };
}

function buildAllNotStarted(ayCode: string): AyReadiness {
  const steps: ReadinessStep[] = [
    { id: "ay-setup", step: 1, label: "AY Setup", href: "/sis/ay-setup", status: "not_started", description: "Create the academic year and define term dates" },
    { id: "calendar", step: 2, label: "School Calendar", href: "/sis/calendar", status: "not_started", description: "Generate school days for all terms" },
    { id: "sections", step: 3, label: "Sections", href: "/sis/sections", status: "not_started", description: "Create sections and assign form advisers" },
    { id: "sow", step: 4, label: "Scheme of Work", href: "/sis/admin/sow", status: "not_started", description: "Publish SOW for all subject-term scopes", fraction: { done: 0, total: 0 } },
    { id: "grading-sheets", step: 5, label: "Grading Sheets", href: "/markbook/sections", status: "not_started", description: "Approve SOW first — grading sheets will be generated automatically on apply", fraction: { done: 0, total: 0 } },
  ];
  return { ayCode, steps, complete: 0, total: 5 };
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
    checkSow(db, ay.id),
  ]);
  const step5 = await checkGradingSheets(db, ay.id, step4.status === "done");

  const steps = [step1, step2, step3, step4, step5];
  const complete = steps.filter((s) => s.status === "done").length;
  return { ayCode, steps, complete, total: 5 };
}

export const getAyReadiness = (ayCode: string) =>
  unstable_cache(
    () => getAyReadinessUncached(ayCode),
    [`sis-readiness-${ayCode}`],
    { tags: [`sis:${ayCode}`], revalidate: 60 },
  )();
