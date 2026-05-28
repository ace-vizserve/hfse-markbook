import { describe, expect, it, vi } from 'vitest';

// Mock the Supabase service client — getPtcEventsForAy calls createServiceClient()
// but our tests only exercise the exported pure functions, so the mock is never
// actually called. It prevents Vitest from throwing on the import of the module.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

import {
  type PtcEvent,
  type WriteupTermLite,
  buildPtcDeadlineMap,
  daysUntilPtc,
  findPtcForWriteupTerm,
  ptcWarningTone,
  resolveDiscussedTermId,
} from '@/lib/evaluation/ptc-resolver';

// ── Shared fixtures ──────────────────────────────────────────────────────────
// Three writeup terms for AY2026: T1 ends Mar, T2 ends Jun, T3 ends Sep.
// T4 is excluded from writeup terms per KD #49.
// resolveDiscussedTermId takes Array<{ id: string; end_date: string | null }>
const WRITEUP_TERMS = [
  { id: 'term-t1', end_date: '2026-03-20' },
  { id: 'term-t2', end_date: '2026-06-20' },
  { id: 'term-t3', end_date: '2026-09-20' },
];

const makePtcEvent = (
  overrides: Partial<PtcEvent> & { startDate: string; eventId: string }
): PtcEvent => ({
  eventId: overrides.eventId,
  termId: 'term-t2',
  startDate: overrides.startDate,
  endDate: overrides.startDate,
  label: 'Parent-Teacher Conference',
  audience: 'all',
  tentative: false,
  discussedTermId: null,
  ...overrides,
});

describe('resolveDiscussedTermId', () => {
  it('Apr PTC (2026-04-15) resolves to T1 — only term ended before April', () => {
    const result = resolveDiscussedTermId('2026-04-15', WRITEUP_TERMS);
    expect(result).toBe('term-t1');
  });

  it('Nov PTC (2026-11-05) resolves to T3 — most recently ended of T1/T2/T3', () => {
    const result = resolveDiscussedTermId('2026-11-05', WRITEUP_TERMS);
    expect(result).toBe('term-t3');
  });

  it('Jan PTC (2026-01-10) resolves to null — no term has ended yet', () => {
    const result = resolveDiscussedTermId('2026-01-10', WRITEUP_TERMS);
    expect(result).toBeNull();
  });

  it('returns null for empty writeup term list', () => {
    const result = resolveDiscussedTermId('2026-04-15', []);
    expect(result).toBeNull();
  });

  it('ignores writeup terms with null end_date', () => {
    const termsWithNulls = [
      { id: 'term-t1', end_date: null },
      { id: 'term-t2', end_date: '2026-03-20' },
    ];
    const result = resolveDiscussedTermId('2026-04-15', termsWithNulls);
    expect(result).toBe('term-t2');
  });
});

describe('findPtcForWriteupTerm', () => {
  it('returns the single matching PTC event', () => {
    const events: PtcEvent[] = [
      makePtcEvent({
        eventId: 'ptc-apr',
        startDate: '2026-04-15',
        discussedTermId: 'term-t1',
      }),
      makePtcEvent({
        eventId: 'ptc-nov',
        startDate: '2026-11-05',
        discussedTermId: 'term-t3',
      }),
    ];
    expect(findPtcForWriteupTerm('term-t1', events)?.eventId).toBe('ptc-apr');
    expect(findPtcForWriteupTerm('term-t3', events)?.eventId).toBe('ptc-nov');
  });

  it('returns null when no PTC resolves to the given writeup term', () => {
    const events: PtcEvent[] = [
      makePtcEvent({
        eventId: 'ptc-apr',
        startDate: '2026-04-15',
        discussedTermId: 'term-t1',
      }),
    ];
    expect(findPtcForWriteupTerm('term-t2', events)).toBeNull();
  });

  it('returns the earliest PTC when multiple resolve to the same term', () => {
    const events: PtcEvent[] = [
      makePtcEvent({
        eventId: 'ptc-later',
        startDate: '2026-05-01',
        discussedTermId: 'term-t1',
      }),
      makePtcEvent({
        eventId: 'ptc-earlier',
        startDate: '2026-04-10',
        discussedTermId: 'term-t1',
      }),
    ];
    expect(findPtcForWriteupTerm('term-t1', events)?.eventId).toBe(
      'ptc-earlier'
    );
  });
});

describe('daysUntilPtc', () => {
  it('returns a positive number for a future date', () => {
    expect(daysUntilPtc('2026-06-01', '2026-05-01')).toBe(31);
  });

  it('returns a negative number for a past date', () => {
    expect(daysUntilPtc('2026-04-01', '2026-05-01')).toBe(-30);
  });

  it('returns 0 for the same day', () => {
    expect(daysUntilPtc('2026-05-01', '2026-05-01')).toBe(0);
  });
});

describe('ptcWarningTone', () => {
  it('returns good when obligation is met regardless of days', () => {
    expect(ptcWarningTone(-10, true)).toBe('good');
    expect(ptcWarningTone(0, true)).toBe('good');
    expect(ptcWarningTone(100, true)).toBe('good');
  });

  it('returns overdue when obligation unmet and PTC is past', () => {
    expect(ptcWarningTone(-1, false)).toBe('overdue');
  });

  it('returns urgent within 0–3 days', () => {
    expect(ptcWarningTone(0, false)).toBe('urgent');
    expect(ptcWarningTone(3, false)).toBe('urgent');
  });

  it('returns near within 4–30 days', () => {
    expect(ptcWarningTone(4, false)).toBe('near');
    expect(ptcWarningTone(30, false)).toBe('near');
  });

  it('returns far beyond 30 days', () => {
    expect(ptcWarningTone(31, false)).toBe('far');
  });

  it('returns past for Infinity days', () => {
    expect(ptcWarningTone(Infinity, false)).toBe('past');
  });
});

// Smoke test: buildPtcDeadlineMap compiles and returns a Map
describe('buildPtcDeadlineMap', () => {
  it('returns a Map keyed by writeup term id', () => {
    const writeupTerms: WriteupTermLite[] = [
      {
        termId: 'term-t1',
        termNumber: 1,
        label: 'Term 1',
        startDate: '2026-01-06',
        endDate: '2026-03-20',
      },
    ];
    const events: PtcEvent[] = [
      makePtcEvent({
        eventId: 'ptc-apr',
        startDate: '2026-04-15',
        discussedTermId: 'term-t1',
      }),
    ];
    const map = buildPtcDeadlineMap(writeupTerms, events);
    expect(map).toBeInstanceOf(Map);
    expect(map.get('term-t1')?.eventId).toBe('ptc-apr');
  });
});
