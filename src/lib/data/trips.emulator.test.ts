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
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    expect(trip.status).toBe('draft');
    expect(trip.total).toBe(0);
    expect(trip.itemCount).toBe(0);
  });
});

describe('addTripItem', () => {
  it('appends a tripItem with computed pricePerBaseUnit and copied tripDate', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Chicken breast', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    const ti = await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Chicken breast', quantity: 1.5, unit: 'kg', pricePaid: 300, marketId: null, marketName: null, variant: null, category: 'karne',
    });
    expect(ti.pricePerBaseUnit).toBe(200);
    expect(ti.tripDate).toBe('2026-05-31');
    const items = await getTripItems(ctx.db, ctx.uid, trip.id);
    expect(items).toHaveLength(1);
  });
});

import { saveTrip } from './trips';
import { getItem } from './items';

describe('saveTrip fan-out', () => {
  it('marks the trip saved with correct total and itemCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: null, marketName: null, variant: null, category: 'karne' });

    const saved = await saveTrip(ctx.db, ctx.uid, trip.id);
    expect(saved.status).toBe('saved');
    expect(saved.total).toBe(620);
    expect(saved.itemCount).toBe(2);
  });

  it('updates the parent item last context fields and bumps purchaseCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm1', marketName: 'Cartimar', variant: null, category: 'karne' });

    await saveTrip(ctx.db, ctx.uid, trip.id);

    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.lastPricePerBaseUnit).toBe(320);
    expect(updated?.lastMarketName).toBe('Cartimar');
    expect(updated?.lastPriceDate).toBe('2026-05-31');
    expect(updated?.purchaseCount).toBe(1);
  });

  it('counts the same item on multiple lines of one trip as a single purchase, latest line wins', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm1', marketName: 'Cartimar', variant: null, category: 'karne' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm2', marketName: 'Puregold', variant: null, category: 'karne' });

    await saveTrip(ctx.db, ctx.uid, trip.id);

    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(1);
    expect(updated?.lastPricePerBaseUnit).toBe(300);
    expect(updated?.lastMarketName).toBe('Puregold');
  });

  it('refuses to re-save an already-saved trip (no double fan-out)', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await saveTrip(ctx.db, ctx.uid, trip.id);

    await expect(saveTrip(ctx.db, ctx.uid, trip.id)).rejects.toThrow();
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(1); // not double-counted
  });
});

import { priceHistory } from './trips';

describe('priceHistory', () => {
  it('returns an items price points across trips, newest first', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });

    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-05-04' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 310, marketId: null, marketName: null, variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });

    const history = await priceHistory(ctx.db, ctx.uid, item.id);
    expect(history.map((h) => h.pricePaid)).toEqual([320, 310]);
    expect(history[0].tripDate).toBe('2026-05-31');
  });
});

import { getTrip, updateTripItem, removeTripItem, deleteTrip, monthlyTotal } from './trips';

describe('getTrip', () => {
  it('returns the trip or null', async () => {
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', date: '2026-06-01' });
    expect((await getTrip(ctx.db, ctx.uid, t.id))?.id).toBe(t.id);
    expect(await getTrip(ctx.db, ctx.uid, 'nope')).toBeNull();
  });
});

describe('updateTripItem', () => {
  it('updates fields and recomputes pricePerBaseUnit', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await updateTripItem(ctx.db, ctx.uid, t.id, ti.id, { quantity: 2, pricePaid: 700 });
    const items = await getTripItems(ctx.db, ctx.uid, t.id);
    expect(items[0].quantity).toBe(2);
    expect(items[0].pricePaid).toBe(700);
    expect(items[0].pricePerBaseUnit).toBe(350);
  });
});

describe('removeTripItem', () => {
  it('deletes a single line', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await removeTripItem(ctx.db, ctx.uid, t.id, ti.id);
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('deleteTrip', () => {
  it('deletes the trip and its tripItems', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await deleteTrip(ctx.db, ctx.uid, t.id);
    expect(await getTrip(ctx.db, ctx.uid, t.id)).toBeNull();
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('monthlyTotal', () => {
  it('sums saved-trip totals within the month, excluding drafts and other months', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const a = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-03' });
    await addTripItem(ctx.db, ctx.uid, a.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await saveTrip(ctx.db, ctx.uid, a.id);
    const d = await createDraftTrip(ctx.db, ctx.uid, { name: 'D', date: '2026-06-10' });
    await addTripItem(ctx.db, ctx.uid, d.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, marketId: null, marketName: null, variant: null, category: 'karne' });
    const b = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', date: '2026-05-30' });
    await addTripItem(ctx.db, ctx.uid, b.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 500, marketId: null, marketName: null, variant: null, category: 'karne' });
    await saveTrip(ctx.db, ctx.uid, b.id);

    expect(await monthlyTotal(ctx.db, ctx.uid, 2026, 6)).toBe(320);
  });
});

import { monthlyByCategory } from './trips';

describe('monthlyByCategory', () => {
  it('sums saved-trip spend per category within the month, excluding drafts/other months', async () => {
    const karne = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const gulay = await createItem(ctx.db, ctx.uid, { canonicalName: 'Kamatis', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-03' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: gulay.id, label: 'Kamatis', quantity: 1, unit: 'kg', pricePaid: 60, marketId: null, marketName: null, variant: null, category: 'gulay' });
    await saveTrip(ctx.db, ctx.uid, t.id);
    const d = await createDraftTrip(ctx.db, ctx.uid, { name: 'D', date: '2026-06-10' });
    await addTripItem(ctx.db, ctx.uid, d.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, marketId: null, marketName: null, variant: null, category: 'karne' });

    const byCat = await monthlyByCategory(ctx.db, ctx.uid, 2026, 6);
    expect(byCat.karne).toBe(320);
    expect(byCat.gulay).toBe(60);
    expect(byCat.condiments ?? 0).toBe(0);
  });
});

import { lastContextFor } from './trips';

describe('lastContextFor', () => {
  it('returns the latest purchase matching market + variant', async () => {
    const m1 = 'mkt1', m2 = 'mkt2';
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Itlog', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Itlog', quantity: 12, unit: 'piraso', pricePaid: 96, marketId: m1, marketName: 'Palengke', variant: null, category: 'iba_pa' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Itlog', quantity: 6, unit: 'piraso', pricePaid: 54, marketId: m2, marketName: 'SM', variant: '6-pack', category: 'iba_pa' });
    const ctxM2 = await lastContextFor(ctx.db, ctx.uid, item.id, m2, '6-pack');
    expect(ctxM2?.pricePaid).toBe(54);
    expect(ctxM2?.pricePerBaseUnit).toBe(9);   // 54 / (6*1)
  });
});
