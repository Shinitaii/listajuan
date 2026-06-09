import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, getDoc } from 'firebase/firestore';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem } from './items';
import { createDraftTrip, addTripItem, getTripItems, toggleCartItem, saveTrip } from './trips';
import { tripItemsCol } from './paths';
import type { TripItem } from '../domain/types';

let ctx: TestCtx;
let listId: string;

beforeAll(async () => { ctx = await setupEmulator(); listId = ctx.uid; });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

function splitByCart(items: TripItem[]) {
  return {
    pending: items.filter(i => !i.inCart),
    inCartItems: items.filter(i => i.inCart),
  };
}

describe('cart-tracker integration (emulator)', () => {
  it('toggleCartItem→getTripItems: toggle moves item across sections', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Bawang', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-06-04' });
    const ti = await addTripItem(ctx.db, listId, trip.id, {
      itemId: item.id, label: 'Bawang', quantity: 0.25, unit: 'kg', pricePaid: 40,
      marketId: null, marketName: null, variant: null, category: 'gulay',
    });

    let dbItems = await getTripItems(ctx.db, listId, trip.id);
    expect(splitByCart(dbItems).pending).toHaveLength(1);
    expect(splitByCart(dbItems).inCartItems).toHaveLength(0);

    await toggleCartItem(ctx.db, listId, trip.id, ti.id, true);
    dbItems = await getTripItems(ctx.db, listId, trip.id);
    expect(splitByCart(dbItems).pending).toHaveLength(0);
    expect(splitByCart(dbItems).inCartItems).toHaveLength(1);

    await toggleCartItem(ctx.db, listId, trip.id, ti.id, false);
    dbItems = await getTripItems(ctx.db, listId, trip.id);
    expect(splitByCart(dbItems).pending).toHaveLength(1);
    expect(splitByCart(dbItems).inCartItems).toHaveLength(0);
  });

  it('toggleCartItem writes inCart without affecting pricePaid', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Luya', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-06-04' });
    const ti = await addTripItem(ctx.db, listId, trip.id, {
      itemId: item.id, label: 'Luya', quantity: 0.1, unit: 'kg', pricePaid: 25,
      marketId: null, marketName: null, variant: null, category: 'gulay',
    });
    await saveTrip(ctx.db, listId, trip.id);
    await toggleCartItem(ctx.db, listId, trip.id, ti.id, true);

    const snap = await getDoc(doc(tripItemsCol(ctx.db, listId, trip.id), ti.id));
    expect(snap.data()?.inCart).toBe(true);
    expect(snap.data()?.pricePaid).toBe(25);
  });
});
