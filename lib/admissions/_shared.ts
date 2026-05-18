// Shared utilities for admissions loaders.
//
// `prefixFor` is the canonical AY-code-to-table-prefix converter used across
// every admissions loader. Centralised here to avoid the one-liner being
// redefined in dashboard.ts / drill.ts / priority.ts / document-validation.ts.

export function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

// Canonical cache-tag helper for admissions drill caches (KD #80).
// Pattern: `admissions-drill:${ayCode}`.
export function admissionsCacheTag(ayCode: string): string {
  return `admissions-drill:${ayCode}`;
}
