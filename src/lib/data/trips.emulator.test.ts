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
});
