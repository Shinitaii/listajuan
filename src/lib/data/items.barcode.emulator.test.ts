import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, attachBarcode, findItemByBarcode, getItem } from './items';

let ctx: TestCtx;

beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

const newItem = () =>
  createItem(ctx.db, ctx.uid, { canonicalName: 'Century Tuna', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso' });

describe('createItem barcodes', () => {
  it('initializes barcodes to an empty array', async () => {
    const item = await newItem();
    expect(item.barcodes).toEqual([]);
  });
});

describe('attachBarcode', () => {
  it('adds a code to the item', async () => {
    const item = await newItem();
    await attachBarcode(ctx.db, ctx.uid, item.id, '4800024847857');
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.barcodes).toContain('4800024847857');
  });

  it('is idempotent — no duplicate codes', async () => {
    const item = await newItem();
    await attachBarcode(ctx.db, ctx.uid, item.id, '123');
    await attachBarcode(ctx.db, ctx.uid, item.id, '123');
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.barcodes.filter((c) => c === '123')).toHaveLength(1);
  });
});

describe('findItemByBarcode', () => {
  it('finds the item carrying the code', async () => {
    const item = await newItem();
    await attachBarcode(ctx.db, ctx.uid, item.id, '4800024847857');
    const found = await findItemByBarcode(ctx.db, ctx.uid, '4800024847857');
    expect(found?.id).toBe(item.id);
  });

  it('returns null when no item carries the code', async () => {
    await newItem();
    expect(await findItemByBarcode(ctx.db, ctx.uid, '0000000000000')).toBeNull();
  });
});
