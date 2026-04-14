// Admissions stores level labels as words ("Primary Two"), the grading app
// stores them as digits ("Primary 2"). Normalize on sync.
const WORD_TO_DIGIT: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
};

export function normalizeLevelLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match "Primary <word>" or "Secondary <word>" (case-insensitive).
  const m = trimmed.match(/^(primary|secondary)\s+(\S+)$/i);
  if (m) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    const rest = m[2].toLowerCase();
    const digit = WORD_TO_DIGIT[rest] ?? rest;
    return `${kind} ${digit}`;
  }
  return trimmed;
}
