import { describe, it, expect } from 'vitest';
import { applyStep, scaledSteps } from './quickadjust';

describe('applyStep', () => {
  it('adds and subtracts with 2-decimal rounding', () => {
    expect(applyStep(1, 0.25, 'add', 0)).toBe(1.25);
    expect(applyStep(1, 0.25, 'sub', 0)).toBe(0.75);
  });
  it('clamps subtraction at min', () => {
    expect(applyStep(0.2, 0.5, 'sub', 0)).toBe(0);
  });
  it('avoids float drift', () => {
    expect(applyStep(0.1, 0.2, 'add', 0)).toBe(0.3);
  });
});

describe('scaledSteps', () => {
  it('multiplies the base triple by the scale', () => {
    expect(scaledSteps([0.25, 0.5, 1], 1)).toEqual([0.25, 0.5, 1]);
    expect(scaledSteps([0.25, 0.5, 1], 2)).toEqual([0.5, 1, 2]);
    expect(scaledSteps([0.25, 0.5, 1], 4)).toEqual([1, 2, 4]);
    expect(scaledSteps([0.25, 0.5, 1], 0.5)).toEqual([0.125, 0.25, 0.5]);
  });
  it('scales the count and price triples', () => {
    expect(scaledSteps([1, 2, 5], 2)).toEqual([2, 4, 10]);
    expect(scaledSteps([25, 50, 100], 2)).toEqual([50, 100, 200]);
  });
});
