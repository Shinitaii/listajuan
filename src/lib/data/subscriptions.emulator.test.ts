import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, subscribeItems } from './items';
import { createDraftTrip, addTripItem, saveTrip, subscribeRecentTrips, subscribeDraftTrips, subscribeTripItems } from './trips';
import type { Item, Trip, TripItem } from '../domain/types';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

function waitFor<T>(subscribe: (cb: (v: T) => void) => () => void, pred: (v: T) => boolean, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => { unsub(); reject(new Error('timeout')); }, ms);
    unsub = subscribe((v) => { if (pred(v)) { clearTimeout(timer); unsub(); resolve(v); } });
  });
}

describe('subscribeItems', () => {
  it('emits the library and updates on insert', async () => {
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const items = await waitFor<Item[]>((cb) => subscribeItems(ctx.db, ctx.uid, cb), (v) => v.length === 1);
    expect(items[0].canonicalName).toBe('Liempo');
  });
});

describe('subscribeRecentTrips', () => {
  it('emits only saved trips, newest first', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'Old', storeName: 'C', date: '2026-05-01' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'L', quantity: 1, unit: 'kg', pricePaid: 100, vendor: null });
    await saveTrip(ctx.db, ctx.uid, t1.id);
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'New', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'L', quantity: 1, unit: 'kg', pricePaid: 200, vendor: null });
    await saveTrip(ctx.db, ctx.uid, t2.id);
    const trips = await waitFor<Trip[]>((cb) => subscribeRecentTrips(ctx.db, ctx.uid, cb), (v) => v.length === 2);
    expect(trips.map((t) => t.name)).toEqual(['New', 'Old']);
  });
});

describe('subscribeDraftTrips', () => {
  it('emits only drafts', async () => {
    await createDraftTrip(ctx.db, ctx.uid, { name: 'Draft', storeName: 'C', date: '2026-06-01' });
    const drafts = await waitFor<Trip[]>((cb) => subscribeDraftTrips(ctx.db, ctx.uid, cb), (v) => v.length === 1);
    expect(drafts[0].name).toBe('Draft');
  });
});

describe('subscribeTripItems', () => {
  it('emits the live items of one trip in entry order', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'first', quantity: 1, unit: 'kg', pricePaid: 100, vendor: null });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'second', quantity: 1, unit: 'kg', pricePaid: 200, vendor: null });
    const items = await waitFor<TripItem[]>((cb) => subscribeTripItems(ctx.db, ctx.uid, t.id, cb), (v) => v.length === 2);
    expect(items.map((i) => i.label)).toEqual(['first', 'second']);
  });
});
