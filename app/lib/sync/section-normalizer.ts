// Known section-name typos in admissions data → canonical grading-app spelling.
// Extend this map as new typos surface in the field.
// Keys are compared case-insensitively after trimming and punctuation-normalization.
const KNOWN_TYPOS: Record<string, string> = {
  'courageos': 'Courageous',
};

export function normalizeSectionName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  // Collapse hyphens/underscores/multiple spaces into single spaces:
  //   "Integrity-1" → "Integrity 1", "Discipline_2" → "Discipline 2".
  const trimmed = raw.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  return KNOWN_TYPOS[key] ?? trimmed;
}
