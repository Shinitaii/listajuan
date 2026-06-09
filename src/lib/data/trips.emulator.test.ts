import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, getItem } from './items';
import {
  createDraftTrip, addTripItem, getTripItems, saveTrip, getTrip,
  updateTripItem, removeTripItem, deleteTrip, monthlyTotal, monthlyByCategory,
  priceHistory, lastContextFor, recomputeItem, recomputeTrip, groupByMarket,
} from './trips';

let ctx: TestCtx;
let listId: string;

beforeAll(async () => { ctx = await setupEmulator(); listId = ctx.uid; });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createDraftTrip', () => {
  it('creates a draft with zero total and itemCount', async () => {
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-05-31' });
    expect(trip.status).toBe('draft');
    expect(trip.total).toBe(0);
    expect(trip.itemCount).toBe(0);
  });
});

describe('addTripItem', () => {
  it('appends a tripItem with computed pricePerBaseUnit and copied tripDate', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Chicken breast', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-05-31' });
    const ti = await addTripItem(ctx.db, listId, trip.id, {
      itemId: item.id, label: 'Chicken breast', quantity: 1.5, unit: 'kg', pricePaid: 300, marketId: null, marketName: null, variant: null, category: 'karne',
    });
    expect(ti.pricePerBaseUnit).toBe(200);
    expect(ti.tripDate).toBe('2026-05-31');
    expect(ti.listId).toBe(listId);
    const items = await getTripItems(ctx.db, listId, trip.id);
    expect(items).toHaveLength(1);
  });
});

describe('saveTrip fan-out', () => {
  it('marks the trip saved with correct total and itemCount', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, listId, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await addTripItem(ctx.db, listId, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: null, marketName: null, variant: null, category: 'karne' });

    const saved = await saveTrip(ctx.db, listId, trip.id);
    expect(saved.status).toBe('saved');
    expect(saved.total).toBe(620);
    expect(saved.itemCount).toBe(2);
  });

  it('derives the parent item last context fields and purchaseCount (one trip → 1)', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, listId, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm1', marketName: 'Cartimar', variant: null, category: 'karne' });

    await saveTrip(ctx.db, listId, trip.id);

    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.lastPricePerBaseUnit).toBe(320);
    expect(updated?.lastMarketName).toBe('Cartimar');
    expect(updated?.lastPriceDate).toBe('2026-05-31');
    expect(updated?.purchaseCount).toBe(1);
  });

  it('counts the same item on multiple lines of one trip as a single purchase, newest line wins', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, listId, { name: 'Palengke', date: '2026-05-31' });
    await addTripItem(ctx.db, listId, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm1', marketName: 'Cartimar', variant: null, category: 'karne' });
    await addTripItem(ctx.db, listId, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm2', marketName: 'Puregold', variant: null, category: 'karne' });

    await saveTrip(ctx.db, listId, trip.id);

    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.purchaseCount).toBe(1);
    expect(updated?.lastPricePerBaseUnit).toBe(300);
    expect(updated?.lastMarketName).toBe('Puregold');
  });
});

describe('priceHistory', () => {
  it('returns an items price points across trips, newest first', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });

    const t1 = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-05-04' });
    await addTripItem(ctx.db, listId, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 310, marketId: null, marketName: null, variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, listId, { name: 'B', date: '2026-05-31' });
    await addTripItem(ctx.db, listId, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });

    const history = await priceHistory(ctx.db, listId, item.id);
    expect(history.map((h) => h.pricePaid)).toEqual([320, 310]);
    expect(history[0].tripDate).toBe('2026-05-31');
  });
});

describe('getTrip', () => {
  it('returns the trip or null', async () => {
    const t = await createDraftTrip(ctx.db, listId, { name: 'P', date: '2026-06-01' });
    expect((await getTrip(ctx.db, listId, t.id))?.id).toBe(t.id);
    expect(await getTrip(ctx.db, listId, 'nope')).toBeNull();
  });
});

describe('updateTripItem', () => {
  it('updates fields and recomputes pricePerBaseUnit', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'P', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await updateTripItem(ctx.db, listId, t.id, ti.id, { quantity: 2, pricePaid: 700 });
    const items = await getTripItems(ctx.db, listId, t.id);
    expect(items[0].quantity).toBe(2);
    expect(items[0].pricePaid).toBe(700);
    expect(items[0].pricePerBaseUnit).toBe(350);
  });
});

describe('removeTripItem', () => {
  it('deletes a single line', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'P', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await removeTripItem(ctx.db, listId, t.id, ti.id);
    expect(await getTripItems(ctx.db, listId, t.id)).toHaveLength(0);
  });
});

describe('deleteTrip', () => {
  it('deletes the trip and its tripItems', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'P', date: '2026-06-01' });
    await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await deleteTrip(ctx.db, listId, t.id);
    expect(await getTrip(ctx.db, listId, t.id)).toBeNull();
    expect(await getTripItems(ctx.db, listId, t.id)).toHaveLength(0);
  });
});

describe('monthlyTotal', () => {
  it('sums saved-trip totals within the month, excluding drafts and other months', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const a = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-03' });
    await addTripItem(ctx.db, listId, a.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await saveTrip(ctx.db, listId, a.id);
    const d = await createDraftTrip(ctx.db, listId, { name: 'D', date: '2026-06-10' });
    await addTripItem(ctx.db, listId, d.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, marketId: null, marketName: null, variant: null, category: 'karne' });
    const b = await createDraftTrip(ctx.db, listId, { name: 'B', date: '2026-05-30' });
    await addTripItem(ctx.db, listId, b.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 500, marketId: null, marketName: null, variant: null, category: 'karne' });
    await saveTrip(ctx.db, listId, b.id);

    expect(await monthlyTotal(ctx.db, listId, 2026, 6)).toBe(320);
  });
});

describe('monthlyByCategory', () => {
  it('sums saved-trip spend per category within the month, excluding drafts/other months', async () => {
    const karne = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const gulay = await createItem(ctx.db, listId, { canonicalName: 'Kamatis', category: 'gulay', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-03' });
    await addTripItem(ctx.db, listId, t.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: null, marketName: null, variant: null, category: 'karne' });
    await addTripItem(ctx.db, listId, t.id, { itemId: gulay.id, label: 'Kamatis', quantity: 1, unit: 'kg', pricePaid: 60, marketId: null, marketName: null, variant: null, category: 'gulay' });
    await saveTrip(ctx.db, listId, t.id);
    const d = await createDraftTrip(ctx.db, listId, { name: 'D', date: '2026-06-10' });
    await addTripItem(ctx.db, listId, d.id, { itemId: karne.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, marketId: null, marketName: null, variant: null, category: 'karne' });

    const byCat = await monthlyByCategory(ctx.db, listId, 2026, 6);
    expect(byCat.karne).toBe(320);
    expect(byCat.gulay).toBe(60);
    expect(byCat.condiments ?? 0).toBe(0);
  });
});

describe('lastContextFor', () => {
  it('returns the latest purchase matching market + variant', async () => {
    const m1 = 'mkt1', m2 = 'mkt2';
    const item = await createItem(ctx.db, listId, { canonicalName: 'Itlog', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Itlog', quantity: 12, unit: 'piraso', pricePaid: 96, marketId: m1, marketName: 'Palengke', variant: null, category: 'iba_pa' });
    await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Itlog', quantity: 6, unit: 'piraso', pricePaid: 54, marketId: m2, marketName: 'SM', variant: '6-pack', category: 'iba_pa' });
    const ctxM2 = await lastContextFor(ctx.db, listId, item.id, m2, '6-pack');
    expect(ctxM2?.pricePaid).toBe(54);
    expect(ctxM2?.pricePerBaseUnit).toBe(9);
  });
});

describe('always-editable recompute', () => {
  it('recomputeItem derives last* + purchaseCount from history (distinct trips)', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t1 = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, listId, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, listId, { name: 'B', date: '2026-06-02' });
    await addTripItem(ctx.db, listId, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm2', marketName: 'SM', variant: null, category: 'karne' });
    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.purchaseCount).toBe(2);
    expect(updated?.lastPricePerBaseUnit).toBe(320);
    expect(updated?.lastMarketName).toBe('SM');
  });

  it('removing the newest line recomputes back to the prior line', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, listId, { name: 'B', date: '2026-06-02' });
    const b = await addTripItem(ctx.db, listId, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm2', marketName: 'SM', variant: null, category: 'karne' });
    await removeTripItem(ctx.db, listId, t2.id, b.id);
    const updated = await getItem(ctx.db, listId, item.id);
    expect(updated?.purchaseCount).toBe(1);
    expect(updated?.lastPricePerBaseUnit).toBe(300);
  });

  it('editing a saved trip recomputes its total and never double-counts purchaseCount', async () => {
    const item = await createItem(ctx.db, listId, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, listId, { name: 'A', date: '2026-06-01' });
    const a = await addTripItem(ctx.db, listId, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    await saveTrip(ctx.db, listId, t.id);
    await updateTripItem(ctx.db, listId, t.id, a.id, { pricePaid: 350 });
    const trip = await getTrip(ctx.db, listId, t.id);
    const updated = await getItem(ctx.db, listId, item.id);
    expect(trip?.total).toBe(350);
    expect(updated?.purchaseCount).toBe(1);
  });

  it('groupByMarket keys by marketId, not name (same-named markets stay separate)', async () => {
    const a = { marketId: 'm1', marketName: 'Palengke', pricePaid: 10 } as any;
    const b = { marketId: 'm2', marketName: 'Palengke', pricePaid: 20 } as any;
    const groups = groupByMarket([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.subtotal)).toEqual([10, 20]);
  });
});
