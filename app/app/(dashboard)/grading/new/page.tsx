import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewSheetForm } from "./new-sheet-form";

export default async function NewGradingSheetPage() {
  const supabase = await createClient();

  const { data: ay } = await supabase.from("academic_years").select("id").eq("is_current", true).single();

  const [termsRes, sectionsRes, subjectsRes, configsRes] = await Promise.all([
    supabase.from("terms").select("id, term_number, label, is_current").order("term_number"),
    supabase
      .from("sections")
      .select("id, name, level:levels(id, code, label, level_type)")
      .eq("academic_year_id", ay?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("name"),
    supabase.from("subjects").select("id, code, name, is_examinable"),
    supabase
      .from("subject_configs")
      .select("subject_id, level_id, ww_max_slots, pt_max_slots")
      .eq("academic_year_id", ay?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/grading"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Grading sheets
      </Link>

      <PageHeader
        eyebrow="Grading"
        title="New grading sheet"
        description="Creates one sheet for the selected subject × section × term and seeds a blank grade entry for every active student."
      />

      <NewSheetForm
        terms={termsRes.data ?? []}
        sections={(sectionsRes.data ?? []) as never}
        subjects={subjectsRes.data ?? []}
        configs={configsRes.data ?? []}
      />
    </PageShell>
  );
}
