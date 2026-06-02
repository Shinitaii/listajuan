import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createMarket, getMarket } from './markets';

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
