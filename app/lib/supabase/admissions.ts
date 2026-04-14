import { createServiceClient } from '@/lib/supabase/service';

// Admissions lives in the SAME Supabase project as the grading schema,
// so we reuse the grading service-role client. Kept as a named helper so
// if the admissions instance is ever separated again, only this function
// needs to change. Server-only — never import from client components.
export function createAdmissionsClient() {
  return createServiceClient();
}

// Row shape returned from the admissions sync query.
// Source tables: ay{YY}_enrolment_applications joined to ay{YY}_enrolment_status.
export type AdmissionsRow = {
  student_number: string | null;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  class_level: string | null;   // e.g. "Primary 1"
  class_section: string | null; // e.g. "Patience" (may contain known typos)
  class_ay: string | null;      // e.g. "AY2026"
};

// Fetch the full active roster for a given academic year from admissions.
// Filter rules (from docs/context/06-admissions-integration.md):
//   * classSection IS NOT NULL  (primary liveness signal — applicationStatus is unreliable)
//   * applicationStatus NOT IN ('Cancelled', 'Withdrawn')
export async function fetchAdmissionsRoster(ayCode: string): Promise<AdmissionsRow[]> {
  const year = ayCode.replace(/^AY/i, '').toLowerCase(); // "AY2026" → "2026"
  const appsTable = `ay${year}_enrolment_applications`;
  const statusTable = `ay${year}_enrolment_status`;

  const supabase = createAdmissionsClient();

  // No FK is declared between the two admissions tables, so we can't use
  // PostgREST embedded selects. Fetch both and join by enroleeNumber in JS.
  const [statusRes, appsRes] = await Promise.all([
    supabase
      .from(statusTable)
      .select('enroleeNumber, classLevel, classSection, classAY, applicationStatus')
      .not('classSection', 'is', null)
      .not('applicationStatus', 'in', '("Cancelled","Withdrawn")'),
    supabase
      .from(appsTable)
      .select('enroleeNumber, studentNumber, lastName, firstName, middleName'),
  ]);

  if (statusRes.error) throw new Error(`Admissions status fetch failed: ${statusRes.error.message}`);
  if (appsRes.error)   throw new Error(`Admissions apps fetch failed: ${appsRes.error.message}`);

  type AppRow = {
    enroleeNumber: string | null;
    studentNumber: string | null;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
  };
  type StatusRow = {
    enroleeNumber: string | null;
    classLevel: string | null;
    classSection: string | null;
    classAY: string | null;
  };

  const apps = (appsRes.data ?? []) as AppRow[];
  const statuses = (statusRes.data ?? []) as StatusRow[];

  const appByEnrolee = new Map<string, AppRow>();
  for (const a of apps) {
    if (a.enroleeNumber) appByEnrolee.set(a.enroleeNumber, a);
  }

  const out: AdmissionsRow[] = [];
  for (const s of statuses) {
    if (!s.enroleeNumber) continue;
    const a = appByEnrolee.get(s.enroleeNumber);
    if (!a) continue;
    out.push({
      student_number: a.studentNumber,
      last_name: a.lastName,
      first_name: a.firstName,
      middle_name: a.middleName,
      class_level: s.classLevel,
      class_section: s.classSection,
      class_ay: s.classAY,
    });
  }
  return out;
}
