import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { getUserSettings, setDefaultMarket } from './settings';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('user settings', () => {
  it('defaults to nulls then round-trips the default market', async () => {
    expect((await getUserSettings(ctx.db, ctx.uid)).defaultMarketId).toBeNull();
    await setDefaultMarket(ctx.db, ctx.uid, 'm1', 'Palengke');
    const s = await getUserSettings(ctx.db, ctx.uid);
    expect(s.defaultMarketId).toBe('m1');
    expect(s.defaultMarketName).toBe('Palengke');
  });
});
