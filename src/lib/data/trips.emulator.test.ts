import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem } from './items';
import { createDraftTrip, addTripItem, getTripItems } from './trips';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createDraftTrip', () => {
  it('creates a draft with zero total and itemCount', async () => {
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    expect(trip.status).toBe('draft');
    expect(trip.total).toBe(0);
    expect(trip.itemCount).toBe(0);
  });
});

describe('addTripItem', () => {
  it('appends a tripItem with computed pricePerUnit and copied tripDate', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Chicken breast', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    const ti = await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Chicken breast', quantity: 1.5, unit: 'kg', pricePaid: 300, vendor: null,
    });
    expect(ti.pricePerUnit).toBe(200);
    expect(ti.tripDate).toBe('2026-05-31');
    const items = await getTripItems(ctx.db, ctx.uid, trip.id);
    expect(items).toHaveLength(1);
  });
});

import { saveTrip } from './trips';
import { getItem } from './items';

describe('saveTrip fan-out', () => {
  it('marks the trip saved with correct total and itemCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, vendor: 'Cartimar' });

    const saved = await saveTrip(ctx.db, ctx.uid, trip.id);
    expect(saved.status).toBe('saved');
    expect(saved.total).toBe(620);
    expect(saved.itemCount).toBe(2);
  });

  it('updates the parent item lastPrice/lastVendor/lastPriceDate and bumps purchaseCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });

    await saveTrip(ctx.db, ctx.uid, trip.id);

    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.lastPrice).toBe(320);
    expect(updated?.lastVendor).toBe('Cartimar');
    expect(updated?.lastPriceDate).toBe('2026-05-31');
    expect(updated?.purchaseCount).toBe(1);
  });

  it('counts the same item on multiple lines of one trip as a single purchase, latest line wins', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, vendor: 'Puregold' });

    await saveTrip(ctx.db, ctx.uid, trip.id);

    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(1);
    expect(updated?.lastPrice).toBe(300);
    expect(updated?.lastVendor).toBe('Puregold');
  });

  it('refuses to re-save an already-saved trip (no double fan-out)', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });
    await saveTrip(ctx.db, ctx.uid, trip.id);

    await expect(saveTrip(ctx.db, ctx.uid, trip.id)).rejects.toThrow();
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(1); // not double-counted
  });
});

import { priceHistory } from './trips';

describe('priceHistory', () => {
  it('returns an items price points across trips, newest first', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });

    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', storeName: 'Cartimar', date: '2026-05-04' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 310, vendor: 'Puregold' });
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });

    const history = await priceHistory(ctx.db, ctx.uid, item.id);
    expect(history.map((h) => h.pricePaid)).toEqual([320, 310]);
    expect(history[0].tripDate).toBe('2026-05-31');
  });
});

import { getTrip, updateTripItem, removeTripItem, deleteTrip, monthlyTotal } from './trips';

describe('getTrip', () => {
  it('returns the trip or null', async () => {
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    expect((await getTrip(ctx.db, ctx.uid, t.id))?.id).toBe(t.id);
    expect(await getTrip(ctx.db, ctx.uid, 'nope')).toBeNull();
  });
});

describe('updateTripItem', () => {
  it('updates fields and recomputes pricePerUnit', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await updateTripItem(ctx.db, ctx.uid, t.id, ti.id, { quantity: 2, pricePaid: 700 });
    const items = await getTripItems(ctx.db, ctx.uid, t.id);
    expect(items[0].quantity).toBe(2);
    expect(items[0].pricePaid).toBe(700);
    expect(items[0].pricePerUnit).toBe(350);
  });
});

describe('removeTripItem', () => {
  it('deletes a single line', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await removeTripItem(ctx.db, ctx.uid, t.id, ti.id);
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('deleteTrip', () => {
  it('deletes the trip and its tripItems', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await deleteTrip(ctx.db, ctx.uid, t.id);
    expect(await getTrip(ctx.db, ctx.uid, t.id)).toBeNull();
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('monthlyTotal', () => {
  it('sums saved-trip totals within the month, excluding drafts and other months', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const a = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', storeName: 'C', date: '2026-06-03' });
    await addTripItem(ctx.db, ctx.uid, a.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await saveTrip(ctx.db, ctx.uid, a.id);
    const d = await createDraftTrip(ctx.db, ctx.uid, { name: 'D', storeName: 'C', date: '2026-06-10' });
    await addTripItem(ctx.db, ctx.uid, d.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, vendor: null });
    const b = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', storeName: 'C', date: '2026-05-30' });
    await addTripItem(ctx.db, ctx.uid, b.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 500, vendor: null });
    await saveTrip(ctx.db, ctx.uid, b.id);

    expect(await monthlyTotal(ctx.db, ctx.uid, 2026, 6)).toBe(320);
  });
});
