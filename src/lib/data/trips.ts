import {
  doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, writeBatch,
  query, collectionGroup, where, orderBy, limit, onSnapshot, type Firestore,
} from 'firebase/firestore';
import { tripsCol, tripDoc, tripItemsCol, itemDoc } from './paths';
import { tripTotal, monthRange } from '../domain/calc';
import { baseUnitFor, pricePerBaseUnit } from '../domain/units';
import { getItem } from './items';
import type { Trip, TripItem, Unit, Category, Item } from '../domain/types';

export interface NewTripInput {
  name: string;
  date: string;
  defaultMarketId?: string | null;
  defaultMarketName?: string | null;
  notes?: string | null;
}

export async function createDraftTrip(db: Firestore, listId: string, input: NewTripInput): Promise<Trip> {
  const ref = doc(tripsCol(db, listId));
  const trip: Trip = {
    id: ref.id,
    name: input.name,
    date: input.date,
    defaultMarketId: input.defaultMarketId ?? null,
    defaultMarketName: input.defaultMarketName ?? null,
    notes: input.notes ?? null,
    status: 'draft',
    total: 0,
    itemCount: 0,
    marketNames: [],
  };
  await setDoc(ref, trip);
  return trip;
}

export interface NewTripItemInput {
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  marketId: string | null;
  marketName: string | null;
  variant: string | null;
  category: Category;
}

export async function addTripItem(
  db: Firestore, listId: string, tripId: string, input: NewTripItemInput,
): Promise<TripItem> {
  const tripSnap = await getDoc(tripDoc(db, listId, tripId));
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const tripDate = (tripSnap.data() as Trip).date;
  const item = await getItem(db, listId, input.itemId);
  if (!item) throw new Error(`Item ${input.itemId} not found`);
  const baseUnit = baseUnitFor(item.form);

  const ref = doc(tripItemsCol(db, listId, tripId));
  const tripItem: TripItem = {
    id: ref.id,
    tripId,
    itemId: input.itemId,
    label: input.label,
    quantity: input.quantity,
    unit: input.unit,
    pricePaid: input.pricePaid,
    marketId: input.marketId,
    marketName: input.marketName,
    variant: input.variant,
    baseUnit,
    pricePerBaseUnit: pricePerBaseUnit(input.pricePaid, input.quantity, input.unit),
    category: input.category,
    tripDate,
    listId,
    addedAt: Date.now(),
  };
  await setDoc(ref, tripItem);
  await recomputeTrip(db, listId, tripId);
  await recomputeItem(db, listId, input.itemId);
  return tripItem;
}

export interface MarketGroup { marketId: string | null; marketName: string | null; items: TripItem[]; subtotal: number; }
export function groupByMarket(items: TripItem[]): MarketGroup[] {
  const map = new Map<string, MarketGroup>();
  for (const ti of items) {
    const key = ti.marketId ?? '__none__';
    let g = map.get(key);
    if (!g) { g = { marketId: ti.marketId, marketName: ti.marketName, items: [], subtotal: 0 }; map.set(key, g); }
    g.items.push(ti);
    g.subtotal += ti.pricePaid ?? 0;
  }
  return [...map.values()];
}

export async function recomputeTrip(db: Firestore, listId: string, tripId: string): Promise<void> {
  const ref = tripDoc(db, listId, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const items = await getTripItems(db, listId, tripId);
  const total = tripTotal(items);
  const itemCount = items.length;
  const marketNames = [...new Set(items.map((i) => i.marketName).filter((n): n is string => !!n))];
  await setDoc(ref, { ...(snap.data() as Trip), total, itemCount, marketNames });
}

export async function recomputeItem(db: Firestore, listId: string, itemId: string): Promise<void> {
  const history = await priceHistory(db, listId, itemId);
  const ref = itemDoc(db, listId, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const newest = history[0] ?? null;
  const distinctTrips = new Set(history.map((h) => h.tripId)).size;
  await setDoc(ref, {
    ...(snap.data() as Item),
    lastPricePerBaseUnit: newest?.pricePerBaseUnit ?? null,
    lastUnit: newest?.unit ?? null,
    lastBaseUnit: newest?.baseUnit ?? null,
    lastPriceDate: newest?.tripDate ?? null,
    lastMarketId: newest?.marketId ?? null,
    lastMarketName: newest?.marketName ?? null,
    lastVariant: newest?.variant ?? null,
    purchaseCount: distinctTrips,
  });
}

export async function setTripMarket(
  db: Firestore, listId: string, tripId: string, marketId: string | null, marketName: string | null,
): Promise<void> {
  const ref = tripDoc(db, listId, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await setDoc(ref, { ...(snap.data() as Trip), defaultMarketId: marketId, defaultMarketName: marketName });
}

export async function getTripItems(db: Firestore, listId: string, tripId: string): Promise<TripItem[]> {
  const snap = await getDocs(query(tripItemsCol(db, listId, tripId), orderBy('addedAt', 'asc')));
  return snap.docs.map((d) => d.data() as TripItem);
}

export async function saveTrip(db: Firestore, listId: string, tripId: string): Promise<Trip> {
  await recomputeTrip(db, listId, tripId);
  const ref = tripDoc(db, listId, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Trip ${tripId} not found`);
  const trip = { ...(snap.data() as Trip), status: 'saved' as const };
  await setDoc(ref, trip);
  return trip;
}

/**
 * Price-over-time for a single item across all trips in this household list.
 * collectionGroup query scoped by listId (denormalized on each TripItem).
 * Relies on the composite index (listId ASC, itemId ASC, tripDate DESC) in firestore.indexes.json.
 */
export async function priceHistory(db: Firestore, listId: string, itemId: string): Promise<TripItem[]> {
  const q = query(
    collectionGroup(db, 'tripItems'),
    where('listId', '==', listId),
    where('itemId', '==', itemId),
    orderBy('tripDate', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as TripItem);
}

export interface HistoryStream {
  key: string;
  marketName: string | null;
  variant: string | null;
  items: TripItem[];
}

export function groupHistoryStreams(history: TripItem[]): HistoryStream[] {
  const map = new Map<string, HistoryStream>();
  for (const ti of history) {
    const key = `${ti.marketId ?? ''}|${ti.variant ?? ''}`;
    let s = map.get(key);
    if (!s) { s = { key, marketName: ti.marketName, variant: ti.variant, items: [] }; map.set(key, s); }
    s.items.push(ti);
  }
  return [...map.values()];
}

export async function lastContextFor(
  db: Firestore, listId: string, itemId: string, marketId: string | null, variant: string | null,
): Promise<TripItem | null> {
  const history = await priceHistory(db, listId, itemId);
  const match = history.find((h) => (marketId == null || h.marketId === marketId) && (variant == null || h.variant === variant));
  return match ?? history[0] ?? null;
}

export async function getTrip(db: Firestore, listId: string, tripId: string): Promise<Trip | null> {
  const snap = await getDoc(tripDoc(db, listId, tripId));
  return snap.exists() ? (snap.data() as Trip) : null;
}

export interface TripItemPatch {
  quantity?: number | null;
  pricePaid?: number | null;
  unit?: Unit;
  variant?: string | null;
  marketId?: string | null;
  marketName?: string | null;
}

export async function updateTripItem(
  db: Firestore, listId: string, tripId: string, tripItemId: string, patch: TripItemPatch,
): Promise<void> {
  const ref = doc(tripItemsCol(db, listId, tripId), tripItemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`TripItem ${tripItemId} not found`);
  const next: TripItem = { ...(snap.data() as TripItem), ...patch };
  next.pricePerBaseUnit = pricePerBaseUnit(next.pricePaid, next.quantity, next.unit);
  await setDoc(ref, next);
  await recomputeTrip(db, listId, tripId);
  await recomputeItem(db, listId, next.itemId);
}

export async function removeTripItem(
  db: Firestore, listId: string, tripId: string, tripItemId: string,
): Promise<void> {
  const ref = doc(tripItemsCol(db, listId, tripId), tripItemId);
  const snap = await getDoc(ref);
  const itemId = snap.exists() ? (snap.data() as TripItem).itemId : null;
  await deleteDoc(ref);
  await recomputeTrip(db, listId, tripId);
  if (itemId) await recomputeItem(db, listId, itemId);
}

export async function deleteTrip(db: Firestore, listId: string, tripId: string): Promise<void> {
  const items = await getTripItems(db, listId, tripId);
  const batch = writeBatch(db);
  for (const ti of items) batch.delete(doc(tripItemsCol(db, listId, tripId), ti.id));
  batch.delete(tripDoc(db, listId, tripId));
  await batch.commit();
}

export async function monthlyTotal(db: Firestore, listId: string, year: number, month: number): Promise<number> {
  const { startISO, endISO } = monthRange(year, month);
  const q = query(
    tripsCol(db, listId),
    where('status', '==', 'saved'),
    where('date', '>=', startISO),
    where('date', '<', endISO),
  );
  const snap = await getDocs(q);
  return snap.docs.reduce((sum, d) => sum + ((d.data() as Trip).total ?? 0), 0);
}

export type CategoryTotals = Partial<Record<Category, number>>;

export async function monthlyByCategory(
  db: Firestore, listId: string, year: number, month: number,
): Promise<CategoryTotals> {
  const { startISO, endISO } = monthRange(year, month);
  const tripsQ = query(
    tripsCol(db, listId),
    where('status', '==', 'saved'),
    where('date', '>=', startISO),
    where('date', '<', endISO),
  );
  const tripsSnap = await getDocs(tripsQ);
  const totals: CategoryTotals = {};
  for (const tripSnap of tripsSnap.docs) {
    const items = await getTripItems(db, listId, tripSnap.id);
    for (const ti of items) {
      if (ti.pricePaid == null) continue;
      totals[ti.category] = (totals[ti.category] ?? 0) + ti.pricePaid;
    }
  }
  return totals;
}

export function subscribeRecentTrips(
  db: Firestore, listId: string, cb: (trips: Trip[]) => void, max = 20,
): () => void {
  const q = query(tripsCol(db, listId), where('status', '==', 'saved'), orderBy('date', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Trip)));
}

export function subscribeDraftTrips(db: Firestore, listId: string, cb: (trips: Trip[]) => void): () => void {
  const q = query(tripsCol(db, listId), where('status', '==', 'draft'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Trip)));
}

export function subscribeTripItems(
  db: Firestore, listId: string, tripId: string, cb: (items: TripItem[]) => void,
): () => void {
  const q = query(tripItemsCol(db, listId, tripId), orderBy('addedAt', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as TripItem)));
}

export async function toggleCartItem(
  db: Firestore,
  listId: string,
  tripId: string,
  tripItemId: string,
  inCart: boolean,
): Promise<void> {
  const ref = doc(tripItemsCol(db, listId, tripId), tripItemId);
  try {
    await updateDoc(ref, { inCart });
  } catch {
    // doc doesn't exist — silent no-op
  }
}
