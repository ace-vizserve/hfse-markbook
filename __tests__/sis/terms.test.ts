import { describe, expect, it, vi } from 'vitest';

// Stub next/cache so unstable_cache is a simple pass-through wrapper in
// the test environment (no Next.js incremental cache required).
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
}));

// Stub the Supabase service client. loadTermsForAY calls createServiceClient()
// inside unstable_cache; we provide a fake client whose query chain returns
// deterministic term windows.
vi.mock('@/lib/supabase/service', () => {
  const FAKE_AY_ID = 'fake-ay-id';

  const termRows = [
    { term_number: 1, start_date: '2026-01-06', end_date: '2026-03-20' },
    { term_number: 2, start_date: '2026-03-31', end_date: '2026-06-20' },
    { term_number: 3, start_date: '2026-07-07', end_date: '2026-09-19' },
    { term_number: 4, start_date: '2026-09-29', end_date: '2026-11-14' },
  ];

  const makeChain = (result: { data: unknown; error: null }) => ({
    select: () => makeChain(result),
    eq: (_col: string, _val: unknown) => makeChain(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  });

  return {
    createServiceClient: vi.fn(() => ({
      from: (table: string) => {
        if (table === 'academic_years') {
          return makeChain({ data: { id: FAKE_AY_ID }, error: null });
        }
        if (table === 'terms') {
          // Return a chain where the final resolution is the term rows
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: termRows, error: null }),
            }),
          };
        }
        return makeChain({ data: null, error: null });
      },
    })),
  };
});

import { resolveLateEnrolleeTerm } from '@/lib/sis/terms';

describe('resolveLateEnrolleeTerm', () => {
  it('returns override when late_enrollee_term_number is set', async () => {
    const result = await resolveLateEnrolleeTerm(
      { enrollment_date: '2026-04-01', late_enrollee_term_number: 3 },
      'AY2026'
    );
    expect(result).toEqual({
      termNumber: 3,
      termLabel: 'T3',
      source: 'override',
    });
  });

  it('falls back to derived when override is null', async () => {
    // 2026-04-01 falls in T2 (2026-03-31 → 2026-06-20)
    const result = await resolveLateEnrolleeTerm(
      { enrollment_date: '2026-04-01', late_enrollee_term_number: null },
      'AY2026'
    );
    expect(result).toEqual({
      termNumber: 2,
      termLabel: 'T2',
      source: 'derived',
    });
  });

  it('returns null when no enrollment_date and no override', async () => {
    const result = await resolveLateEnrolleeTerm(
      { enrollment_date: null, late_enrollee_term_number: null },
      'AY2026'
    );
    expect(result).toBeNull();
  });

  it('returns null when enrollment_date falls outside term windows', async () => {
    // 2026-06-21 is after T2 ends (2026-06-20) and before T3 starts (2026-07-07)
    const result = await resolveLateEnrolleeTerm(
      { enrollment_date: '2026-06-21', late_enrollee_term_number: null },
      'AY2026'
    );
    expect(result).toBeNull();
  });
});
