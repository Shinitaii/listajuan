import { describe, it, expect } from 'vitest';
import { lineTotal, pricePerUnit, tripTotal, monthDelta } from './calc';

describe('lineTotal', () => {
  it('returns pricePaid when set', () => {
    expect(lineTotal({ pricePaid: 320 })).toBe(320);
  });
  it('returns 0 when pricePaid is null', () => {
    expect(lineTotal({ pricePaid: null })).toBe(0);
  });
});

describe('pricePerUnit', () => {
  it('divides price by quantity', () => {
    expect(pricePerUnit(300, 1.5)).toBe(200);
  });
  it('returns null when quantity is missing or zero', () => {
    expect(pricePerUnit(300, null)).toBeNull();
    expect(pricePerUnit(300, 0)).toBeNull();
  });
  it('returns null when price is missing', () => {
    expect(pricePerUnit(null, 2)).toBeNull();
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
