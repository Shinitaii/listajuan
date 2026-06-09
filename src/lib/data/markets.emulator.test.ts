import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createMarket, getMarket, updateMarket, deleteMarket } from './markets';

let ctx: TestCtx;
let listId: string;

beforeAll(async () => { ctx = await setupEmulator(); listId = ctx.uid; });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createMarket', () => {
  it('creates a market with derived nameLower', async () => {
    const m = await createMarket(ctx.db, listId, { name: 'Cartimar', type: 'palengke' });
    expect(m.id).toBeTruthy();
    expect(m.nameLower).toBe('cartimar');
    expect((await getMarket(ctx.db, listId, m.id))?.name).toBe('Cartimar');
  });
});

describe('updateMarket', () => {
  it('renames and re-derives nameLower', async () => {
    const m = await createMarket(ctx.db, listId, { name: 'Cartimar', type: 'palengke' });
    await updateMarket(ctx.db, listId, m.id, { name: 'SM Hypermarket' });
    const updated = await getMarket(ctx.db, listId, m.id);
    expect(updated?.name).toBe('SM Hypermarket');
    expect(updated?.nameLower).toBe('sm hypermarket');
    expect(updated?.type).toBe('palengke');
  });
});

describe('deleteMarket', () => {
  it('removes the market', async () => {
    const m = await createMarket(ctx.db, listId, { name: 'Cartimar', type: 'palengke' });
    await deleteMarket(ctx.db, listId, m.id);
    expect(await getMarket(ctx.db, listId, m.id)).toBeNull();
  });
});
