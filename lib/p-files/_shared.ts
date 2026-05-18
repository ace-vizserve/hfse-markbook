// Shared utilities extracted from lib/p-files/*.ts to avoid duplication.

export function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, "").toLowerCase()}`;
}

export const ENROLLED_STATUSES = ["Enrolled", "Enrolled (Conditional)"] as const;
export const ADMISSIONS_FUNNEL_STATUSES = [
  "Submitted",
  "Ongoing Verification",
  "Processing",
] as const;

export const MODULE_VALUES = ["p-files", "admissions"] as const;
export type PFilesModule = (typeof MODULE_VALUES)[number];
export function resolveModule(input: unknown): PFilesModule {
  const m = input as string;
  return MODULE_VALUES.includes(m as PFilesModule) ? (m as PFilesModule) : "p-files";
}
