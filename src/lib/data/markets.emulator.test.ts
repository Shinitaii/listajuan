import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createMarket, getMarket, updateMarket, deleteMarket } from './markets';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createMarket', () => {
  it('creates a market with derived nameLower', async () => {
    const m = await createMarket(ctx.db, ctx.uid, { name: 'Cartimar', type: 'palengke' });
    expect(m.id).toBeTruthy();
    expect(m.nameLower).toBe('cartimar');
    expect((await getMarket(ctx.db, ctx.uid, m.id))?.name).toBe('Cartimar');
  });
});

describe('updateMarket', () => {
  it('renames and re-derives nameLower', async () => {
    const m = await createMarket(ctx.db, ctx.uid, { name: 'Cartimar', type: 'palengke' });
    await updateMarket(ctx.db, ctx.uid, m.id, { name: 'SM Hypermarket' });
    const updated = await getMarket(ctx.db, ctx.uid, m.id);
    expect(updated?.name).toBe('SM Hypermarket');
    expect(updated?.nameLower).toBe('sm hypermarket');
    expect(updated?.type).toBe('palengke');
  });
});

describe('deleteMarket', () => {
  it('removes the market', async () => {
    const m = await createMarket(ctx.db, ctx.uid, { name: 'Cartimar', type: 'palengke' });
    await deleteMarket(ctx.db, ctx.uid, m.id);
    expect(await getMarket(ctx.db, ctx.uid, m.id)).toBeNull();
  });
});
