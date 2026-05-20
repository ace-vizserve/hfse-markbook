import { redirect } from "next/navigation";

// Evaluation checklists are now managed through the Scheme of Work builder.
export default function EvaluationChecklistsAdminPage() {
  redirect("/sis/admin/sow");
}
