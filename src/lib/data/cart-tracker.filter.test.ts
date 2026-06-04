import { describe, it, expect } from 'vitest';
import type { TripItem } from '../domain/types';

// Mirrors the $derived filter logic in Trip.svelte

function splitByCart(items: TripItem[]) {
  return {
    pending: items.filter(i => !i.inCart),
    inCartItems: items.filter(i => i.inCart),
  };
}

const RECENTLY_ADDED_MS = 5 * 60 * 1000;
const isNew = (ti: TripItem) => Date.now() - ti.addedAt < RECENTLY_ADDED_MS;

describe('splitByCart', () => {
  it('treats undefined inCart as pending', () => {
    const items = [
      { id: 'a', inCart: undefined },
      { id: 'b', inCart: false },
    ] as unknown as TripItem[];
    const { pending, inCartItems } = splitByCart(items);
    expect(pending).toHaveLength(2);
    expect(inCartItems).toHaveLength(0);
  });

  it('moves inCart=true item to inCartItems', () => {
    const items = [
      { id: 'a', inCart: false },
      { id: 'b', inCart: true },
      { id: 'c', inCart: false },
    ] as unknown as TripItem[];
    const { pending, inCartItems } = splitByCart(items);
    expect(pending.map(i => i.id)).toEqual(['a', 'c']);
    expect(inCartItems.map(i => i.id)).toEqual(['b']);
  });

  it('empty list returns two empty arrays', () => {
    const { pending, inCartItems } = splitByCart([]);
    expect(pending).toHaveLength(0);
    expect(inCartItems).toHaveLength(0);
  });
});

describe('isNew', () => {
  it('returns true for item added less than 5 minutes ago', () => {
    const recent = { addedAt: Date.now() - 60_000 } as TripItem;
    expect(isNew(recent)).toBe(true);
  });

  it('returns false for item added more than 5 minutes ago', () => {
    const old = { addedAt: Date.now() - 6 * 60_000 } as TripItem;
    expect(isNew(old)).toBe(false);
  });

  it('returns false exactly at the boundary (5 min + 1ms)', () => {
    const boundary = { addedAt: Date.now() - RECENTLY_ADDED_MS - 1 } as TripItem;
    expect(isNew(boundary)).toBe(false);
  });
});
