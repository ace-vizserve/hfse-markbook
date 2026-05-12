// Shared shape for per-day velocity series used by every module's dashboard.
// Pre-extraction this type was redeclared in admissions/, evaluation/,
// markbook/, p-files/, and sis/ dashboard.ts — re-exporting from here keeps
// existing call sites working while collapsing the duplicate-export warnings.

export type VelocityPoint = { x: string; y: number };
