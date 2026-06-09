import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, searchItems, updateItemMeta, getItem, deleteItem } from './items';

let ctx: TestCtx;
let listId: string;

beforeAll(async () => { ctx = await setupEmulator(); listId = ctx.uid; });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createItem', () => {
  it('creates an item with derived nameLower and zeroed denorm fields', async () => {
    const item = await createItem(ctx.db, listId, {
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
    await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    await createItem(ctx.db, listId, { canonicalName: 'Bigas', category: 'bigas', form: 'timbang', defaultUnit: 'kg' });
    const results = await searchItems(ctx.db, listId, 'li');
    expect(results.map((r) => r.canonicalName)).toEqual(['Liempo']);
  });

  it('matches by alias', async () => {
    await createItem(ctx.db, listId, {
      canonicalName: 'Chicken breast', category: 'karne', form: 'timbang', defaultUnit: 'kg', aliases: ['manok'],
    });
    const results = await searchItems(ctx.db, listId, 'manok');
    expect(results.map((r) => r.canonicalName)).toEqual(['Chicken breast']);
  });
});

describe('updateItemMeta', () => {
  it('updates form and category', async () => {
    const item = await createItem(ctx.db, listId, {
      canonicalName: 'Test', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso',
    });
    await updateItemMeta(ctx.db, listId, item.id, { form: 'timbang', category: 'karne' });
    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.form).toBe('timbang');
    expect(updated?.category).toBe('karne');
  });

  it('renames the item and re-derives nameLower', async () => {
    const item = await createItem(ctx.db, listId, {
      canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg',
    });
    await updateItemMeta(ctx.db, listId, item.id, { canonicalName: 'Pork Belly' });
    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.canonicalName).toBe('Pork Belly');
    expect(updated?.nameLower).toBe('pork belly');
  });
});

describe('deleteItem', () => {
  it('removes the item', async () => {
    const item = await createItem(ctx.db, listId, {
      canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg',
    });
    await deleteItem(ctx.db, listId, item.id);
    expect(await getItem(ctx.db, listId, item.id)).toBeNull();
  });
});
