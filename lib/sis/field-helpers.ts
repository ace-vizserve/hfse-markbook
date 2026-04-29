import type { Field } from '@/components/sis/field-grid';

// Shared field-emptiness predicate. Booleans count as filled even when
// false, since `false` is itself an answer (e.g. `paracetamolConsent =
// false` is a deliberate "withhold consent"). Strings are stripped before
// the empty check so `'  '` reads as empty.
export function isFieldEmpty(f: Field): boolean {
  if (typeof f.value === 'boolean') return false;
  return (
    f.value === null ||
    f.value === undefined ||
    (typeof f.value === 'string' && f.value.trim() === '')
  );
}
