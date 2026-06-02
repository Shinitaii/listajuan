import { describe, it, expect } from 'vitest';
import { lineTotal, tripTotal, monthDelta } from './calc';

describe('lineTotal', () => {
  it('returns pricePaid when set', () => {
    expect(lineTotal({ pricePaid: 320 })).toBe(320);
  });
  it('returns 0 when pricePaid is null', () => {
    expect(lineTotal({ pricePaid: null })).toBe(0);
  });
});

describe('tripTotal', () => {
  it('sums line totals, ignoring blank prices', () => {
    expect(tripTotal([{ pricePaid: 320 }, { pricePaid: 300 }, { pricePaid: null }])).toBe(620);
  });
  it('returns 0 for an empty trip', () => {
    expect(tripTotal([])).toBe(0);
  });
});

describe('monthDelta', () => {
  it('returns the signed difference this minus last', () => {
    expect(monthDelta(8420, 7780)).toBe(640);
    expect(monthDelta(7000, 7780)).toBe(-780);
  });
});

import { monthRange } from './calc';

describe('monthRange', () => {
  it('returns ISO start (inclusive) and end (exclusive) for a month', () => {
    expect(monthRange(2026, 6)).toEqual({ startISO: '2026-06-01', endISO: '2026-07-01' });
  });
  it('rolls over the year in December', () => {
    expect(monthRange(2026, 12)).toEqual({ startISO: '2026-12-01', endISO: '2027-01-01' });
  });
});
