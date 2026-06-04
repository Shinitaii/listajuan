import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem } from './items';
import { createDraftTrip, addTripItem, getTrip, toggleCartItem } from './trips';
import { tripItemsCol } from './paths';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('toggleCartItem', () => {
  it('sets inCart=true on the tripItem doc', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Repolyo', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-06-04' });
    const ti = await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Repolyo', quantity: 1, unit: 'kg', pricePaid: 50,
      marketId: null, marketName: null, variant: null, category: 'gulay',
    });

    await toggleCartItem(ctx.db, ctx.uid, trip.id, ti.id, true);

    const snap = await getDoc(doc(tripItemsCol(ctx.db, ctx.uid, trip.id), ti.id));
    expect(snap.data()?.inCart).toBe(true);
  });

  it('clears inCart when toggled false after being set true', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Sibuyas', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-06-04' });
    const ti = await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Sibuyas', quantity: 0.5, unit: 'kg', pricePaid: 30,
      marketId: null, marketName: null, variant: null, category: 'gulay',
    });

    await toggleCartItem(ctx.db, ctx.uid, trip.id, ti.id, true);
    await toggleCartItem(ctx.db, ctx.uid, trip.id, ti.id, false);

    const snap = await getDoc(doc(tripItemsCol(ctx.db, ctx.uid, trip.id), ti.id));
    expect(snap.data()?.inCart).toBe(false);
  });

  it('is a silent no-op when the tripItem doc does not exist', async () => {
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-06-04' });
    await expect(
      toggleCartItem(ctx.db, ctx.uid, trip.id, 'non-existent-id', true)
    ).resolves.toBeUndefined();
  });

  it('does not change the trip total (recomputeTrip is not called)', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Kamatis', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-06-04' });
    await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Kamatis', quantity: 1, unit: 'kg', pricePaid: 100,
      marketId: null, marketName: null, variant: null, category: 'gulay',
    });

    const before = await getTrip(ctx.db, ctx.uid, trip.id);
    await toggleCartItem(ctx.db, ctx.uid, trip.id, 'some-ti-id', true);
    const after = await getTrip(ctx.db, ctx.uid, trip.id);

    expect(after?.total).toBe(before?.total);
  });
});
