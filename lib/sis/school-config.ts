import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';

// Singleton school-wide settings — principal / CEO / PEI reg / default publish
// window (migration 022) + attendance quota defaults (migration 048, KD #94).
// Row id=1 is seeded by migration 022 — query always resolves it.

export type SchoolConfig = {
  principalName: string;
  ceoName: string;
  peiRegistrationNumber: string;
  defaultPublishWindowDays: number;
  defaultCompassionateAllowancePerYear: number;
  defaultVlAllowancePerTerm: number;
};

export const DEFAULT_SCHOOL_CONFIG: SchoolConfig = {
  principalName: '',
  ceoName: '',
  peiRegistrationNumber: '',
  defaultPublishWindowDays: 30,
  defaultCompassionateAllowancePerYear: 5,
  defaultVlAllowancePerTerm: 1,
};

export async function getSchoolConfig(): Promise<SchoolConfig> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('school_config')
    .select(
      'principal_name, ceo_name, pei_registration_number, default_publish_window_days, default_compassionate_allowance_per_year, default_vl_allowance_per_term',
    )
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) {
    // Defensive: migration seeds the row, but if something went wrong the
    // report-card render must still work.
    return DEFAULT_SCHOOL_CONFIG;
  }
  return {
    principalName: (data.principal_name as string | null) ?? '',
    ceoName: (data.ceo_name as string | null) ?? '',
    peiRegistrationNumber: (data.pei_registration_number as string | null) ?? '',
    defaultPublishWindowDays:
      (data.default_publish_window_days as number | null) ??
      DEFAULT_SCHOOL_CONFIG.defaultPublishWindowDays,
    defaultCompassionateAllowancePerYear:
      (data.default_compassionate_allowance_per_year as number | null) ??
      DEFAULT_SCHOOL_CONFIG.defaultCompassionateAllowancePerYear,
    defaultVlAllowancePerTerm:
      (data.default_vl_allowance_per_term as number | null) ??
      DEFAULT_SCHOOL_CONFIG.defaultVlAllowancePerTerm,
  };
}
