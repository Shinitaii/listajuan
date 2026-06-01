import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, searchItems } from './items';

let ctx: TestCtx;

beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createItem', () => {
  it('creates an item with derived nameLower and zeroed denorm fields', async () => {
    const item = await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Liempo',
      category: 'karne',
      defaultUnit: 'kg',
    });
    expect(item.id).toBeTruthy();
    expect(item.nameLower).toBe('liempo');
    expect(item.purchaseCount).toBe(0);
    expect(item.lastPrice).toBeNull();
    expect(item.aliases).toEqual([]);
  });
});

describe('searchItems', () => {
  it('matches by name prefix, case-insensitive', async () => {
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Bigas', category: 'bigas', defaultUnit: 'kg' });
    const results = await searchItems(ctx.db, ctx.uid, 'li');
    expect(results.map((r) => r.canonicalName)).toEqual(['Liempo']);
  });

  it('matches by alias', async () => {
    await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Chicken breast', category: 'karne', defaultUnit: 'kg', aliases: ['manok'],
    });
    const results = await searchItems(ctx.db, ctx.uid, 'manok');
    expect(results.map((r) => r.canonicalName)).toEqual(['Chicken breast']);
  });
});
