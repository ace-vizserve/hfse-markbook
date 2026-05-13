import { UserX } from 'lucide-react';
import { redirect } from 'next/navigation';

import { UnsyncedStudentsQueue } from '@/components/sis/unsynced-students-queue';
import type { AssignableSection } from '@/components/sis/assign-section-dialog';
import { PageShell } from '@/components/ui/page-shell';
import { getCurrentAcademicYear } from '@/lib/academic-year';
import { canonicalizeLevelLabel } from '@/lib/sis/levels';
import { loadUnsyncedEnrolledStudents } from '@/lib/sis/unsynced-students';
import { getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// /records/unsynced — operational queue listing enrolled students whose
// admissions row says they're enrolled but who never made it into the
// grading schema. Per Hard Rule #4 the gap is usually a missing
// `classSection`; the "Assign section" CTA in the queue opens the
// AssignSectionDialog from Chunk A and unblocks them.
//
// Role-gate matches the records layout (registrar / school_admin /
// superadmin). The lib loader is already cached + tag-invalidated via
// `sis:${ayCode}`, so the page just renders rows + builds the per-level
// section map for inline dialog mounting.

export default async function UnsyncedStudentsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login');
  const role = sessionUser.role ?? '';
  if (role !== 'registrar' && role !== 'school_admin' && role !== 'superadmin') {
    redirect('/');
  }

  const currentAy = await getCurrentAcademicYear();
  if (!currentAy) {
    return (
      <PageShell>
        <div className="rounded-xl border border-hairline bg-card p-6 text-center text-sm text-muted-foreground">
          No active academic year is set. Ask a system administrator to set one in Settings.
        </div>
      </PageShell>
    );
  }

  const rows = await loadUnsyncedEnrolledStudents(currentAy.ay_code);

  // Build the per-level section map up-front so each dialog open is
  // pre-populated (no per-row fetch on click). Same shape as the lite
  // page's loadAvailableSections — section list at the level + per-section
  // active counts so the dialog can render the "Full" badge.
  const uniqueLevels = Array.from(
    new Set(
      rows
        .map((r) => r.levelApplied)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
    ),
  );
  const sectionsByLevel = await loadSectionsForLevels(currentAy.ay_code, uniqueLevels);

  const countLabel =
    rows.length === 0
      ? 'All enrolled students are set up — no action needed.'
      : `${rows.length.toLocaleString('en-SG')} student${rows.length === 1 ? '' : 's'} waiting for a section.`;

  return (
    <PageShell>
      <header className="space-y-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Records · Waiting on setup
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Students needing setup
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Enrolled students who don&rsquo;t yet have access to grading and attendance because a class
          section hasn&rsquo;t been assigned. {countLabel}
        </p>
      </header>

      <UnsyncedStudentsQueue
        rows={rows}
        ayCode={currentAy.ay_code}
        sectionsByLevel={sectionsByLevel}
      />

      <div className="mt-2 flex items-center gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <UserX className="size-3" strokeWidth={2.25} />
        <span>{currentAy.ay_code}</span>
        <span className="text-border">·</span>
        <span>Enrolled only</span>
        <span className="text-border">·</span>
        <span>Refreshes every minute</span>
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Section lookup — mirrors the lite page's loadAvailableSections shape but
// fans out across multiple levels in a single batch. Returns a map keyed
// by the level label exactly as it appears on the unsynced row's
// levelApplied field (no canonicalization on the OUT side; only on the IN
// side when matching against `levels.label`).
// ──────────────────────────────────────────────────────────────────────────

async function loadSectionsForLevels(
  ayCode: string,
  levelLabels: string[],
): Promise<Record<string, AssignableSection[]>> {
  if (levelLabels.length === 0) return {};
  const service = createServiceClient();

  const { data: ayRow } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  if (!ayRow) return {};
  const ayId = (ayRow as { id: string }).id;

  // Canonicalize each input label so we can match `levels.label`, but
  // keep a back-pointer so the output map preserves the original label
  // shape used on the unsynced rows.
  const canonicalByInput = new Map<string, string>();
  for (const label of levelLabels) {
    const canon = canonicalizeLevelLabel(label) ?? label;
    canonicalByInput.set(label, canon);
  }
  const canonicalLabels = Array.from(new Set(canonicalByInput.values()));

  const { data: levelRows } = await service
    .from('levels')
    .select('id, label')
    .in('label', canonicalLabels);
  const levelsByCanonical = new Map<string, string>();
  for (const r of (levelRows ?? []) as Array<{ id: string; label: string }>) {
    levelsByCanonical.set(r.label, r.id);
  }

  const levelIds = Array.from(levelsByCanonical.values());
  if (levelIds.length === 0) return {};

  const { data: sectionRows } = await service
    .from('sections')
    .select('id, name, level_id')
    .eq('academic_year_id', ayId)
    .in('level_id', levelIds);
  const sections = (sectionRows ?? []) as Array<{
    id: string;
    name: string;
    level_id: string;
  }>;
  if (sections.length === 0) return {};

  const sectionIds = sections.map((s) => s.id);
  const { data: activeRows } = await service
    .from('section_students')
    .select('section_id')
    .eq('enrollment_status', 'active')
    .in('section_id', sectionIds);
  const activeCountById = new Map<string, number>();
  for (const r of (activeRows ?? []) as Array<{ section_id: string }>) {
    activeCountById.set(r.section_id, (activeCountById.get(r.section_id) ?? 0) + 1);
  }

  // Bucket sections per level id, then unpack back into the per-input-label map.
  const sectionsByLevelId = new Map<string, AssignableSection[]>();
  for (const s of sections) {
    const list = sectionsByLevelId.get(s.level_id) ?? [];
    list.push({
      id: s.id,
      name: s.name,
      activeCount: activeCountById.get(s.id) ?? 0,
    });
    sectionsByLevelId.set(s.level_id, list);
  }
  for (const list of sectionsByLevelId.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: Record<string, AssignableSection[]> = {};
  for (const [inputLabel, canonical] of canonicalByInput) {
    const levelId = levelsByCanonical.get(canonical);
    if (!levelId) {
      out[inputLabel] = [];
      continue;
    }
    out[inputLabel] = sectionsByLevelId.get(levelId) ?? [];
  }
  return out;
}
