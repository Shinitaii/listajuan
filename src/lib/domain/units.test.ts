import { describe, it, expect } from 'vitest';
import { baseUnitFor, unitsFor, baseUnitLabel, unitFactor, pricePerBaseUnit } from './units';

describe('forms and units', () => {
  it('maps each form to its base unit', () => {
    expect(baseUnitFor('bilang')).toBe('piece');
    expect(baseUnitFor('timbang')).toBe('kg');
    expect(baseUnitFor('sukat')).toBe('liter');
  });
  it('lists the units of a form', () => {
    expect(unitsFor('bilang')).toEqual(['piraso', 'dosena']);
    expect(unitsFor('timbang')).toEqual(['kg', 'g']);
    expect(unitsFor('sukat')).toEqual(['L', 'ml']);
  });
  it('labels base units for display', () => {
    expect(baseUnitLabel('piece')).toBe('piraso');
    expect(baseUnitLabel('kg')).toBe('kg');
    expect(baseUnitLabel('liter')).toBe('L');
  });
  it('knows unit factors', () => {
    expect(unitFactor('piraso')).toBe(1);
    expect(unitFactor('dosena')).toBe(12);
    expect(unitFactor('g')).toBe(0.001);
    expect(unitFactor('ml')).toBe(0.001);
  });
});

describe('pricePerBaseUnit', () => {
  it('normalizes dosena and piraso to the same per-piece price', () => {
    expect(pricePerBaseUnit(96, 1, 'dosena')).toBe(8);
    expect(pricePerBaseUnit(48, 6, 'piraso')).toBe(8);
  });
  it('normalizes kg and half-kg to the same per-kg price', () => {
    expect(pricePerBaseUnit(150, 1, 'kg')).toBe(150);
    expect(pricePerBaseUnit(75, 0.5, 'kg')).toBe(150);
  });
  it('returns null when price or quantity is missing or zero', () => {
    expect(pricePerBaseUnit(null, 1, 'kg')).toBeNull();
    expect(pricePerBaseUnit(100, null, 'kg')).toBeNull();
    expect(pricePerBaseUnit(100, 0, 'kg')).toBeNull();
  });
});
