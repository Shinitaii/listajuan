import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, searchItems, updateItemMeta, getItem } from './items';

let ctx: TestCtx;

beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createItem', () => {
  it('creates an item with derived nameLower and zeroed denorm fields', async () => {
    const item = await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Liempo',
      category: 'karne',
      form: 'timbang',
      defaultUnit: 'kg',
    });
    expect(item.id).toBeTruthy();
    expect(item.nameLower).toBe('liempo');
    expect(item.purchaseCount).toBe(0);
    expect(item.lastPricePerBaseUnit).toBeNull();
    expect(item.aliases).toEqual([]);
  });
});

describe('searchItems', () => {
  it('matches by name prefix, case-insensitive', async () => {
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Bigas', category: 'bigas', form: 'timbang', defaultUnit: 'kg' });
    const results = await searchItems(ctx.db, ctx.uid, 'li');
    expect(results.map((r) => r.canonicalName)).toEqual(['Liempo']);
  });

  it('matches by alias', async () => {
    await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Chicken breast', category: 'karne', form: 'timbang', defaultUnit: 'kg', aliases: ['manok'],
    });
    const results = await searchItems(ctx.db, ctx.uid, 'manok');
    expect(results.map((r) => r.canonicalName)).toEqual(['Chicken breast']);
  });
});

describe('updateItemMeta', () => {
  it('updates form and category', async () => {
    const item = await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Test', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso',
    });
    await updateItemMeta(ctx.db, ctx.uid, item.id, { form: 'timbang', category: 'karne' });
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.form).toBe('timbang');
    expect(updated?.category).toBe('karne');
  });
});
