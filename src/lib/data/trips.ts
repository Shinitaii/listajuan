import {
  doc, getDoc, getDocs, setDoc, writeBatch, increment,
  query, collectionGroup, where, orderBy, type Firestore,
} from 'firebase/firestore';
import { tripsCol, tripDoc, tripItemsCol, itemDoc } from './paths';
import { pricePerUnit, tripTotal } from '../domain/calc';
import type { Trip, TripItem, Unit } from '../domain/types';

export interface NewTripInput {
  name: string;
  storeName: string;
  date: string; // ISO
  vendor?: string | null;
  notes?: string | null;
}

export async function createDraftTrip(db: Firestore, uid: string, input: NewTripInput): Promise<Trip> {
  const ref = doc(tripsCol(db, uid));
  const trip: Trip = {
    id: ref.id,
    name: input.name,
    date: input.date,
    storeName: input.storeName,
    vendor: input.vendor ?? null,
    notes: input.notes ?? null,
    status: 'draft',
    total: 0,
    itemCount: 0,
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
  vendor: string | null;
}

export async function addTripItem(
  db: Firestore, uid: string, tripId: string, input: NewTripItemInput,
): Promise<TripItem> {
  const tripSnap = await getDoc(tripDoc(db, uid, tripId));
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const tripDate = (tripSnap.data() as Trip).date;

  const ref = doc(tripItemsCol(db, uid, tripId));
  const tripItem: TripItem = {
    id: ref.id,
    itemId: input.itemId,
    label: input.label,
    vendor: input.vendor,
    quantity: input.quantity,
    unit: input.unit,
    pricePaid: input.pricePaid,
    pricePerUnit: pricePerUnit(input.pricePaid, input.quantity),
    tripDate,
    uid,
  };
  await setDoc(ref, tripItem);
  return tripItem;
}

export async function getTripItems(db: Firestore, uid: string, tripId: string): Promise<TripItem[]> {
  const snap = await getDocs(tripItemsCol(db, uid, tripId));
  return snap.docs.map((d) => d.data() as TripItem);
}

export async function saveTrip(db: Firestore, uid: string, tripId: string): Promise<Trip> {
  const tripRef = tripDoc(db, uid, tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const trip = tripSnap.data() as Trip;

  const tripItems = await getTripItems(db, uid, tripId);
  const total = tripTotal(tripItems);
  const itemCount = tripItems.length;

  const batch = writeBatch(db);
  batch.set(tripRef, { ...trip, status: 'saved', total, itemCount });

  // Fan-out: each tripItem updates its parent item's denormalized last-price fields.
  // Last write wins per item, so apply in array order (latest line for an item sticks).
  for (const ti of tripItems) {
    if (ti.pricePaid == null) continue;
    batch.set(
      itemDoc(db, uid, ti.itemId),
      {
        lastPrice: ti.pricePaid,
        lastPriceUnit: ti.unit,
        lastPriceDate: ti.tripDate,
        lastVendor: ti.vendor,
        purchaseCount: increment(1),
      },
      { merge: true },
    );
  }

  await batch.commit();
  return { ...trip, status: 'saved', total, itemCount };
}

/**
 * Price-over-time for a single item across all trips.
 * Uses a collectionGroup query on tripItems. The query MUST be scoped by uid:
 * Firestore rejects a collectionGroup query whose security rule checks
 * resource.data.uid unless the query itself constrains uid, so the
 * `where('uid','==',uid)` clause is load-bearing, not just a filter.
 * Relies on the composite index in firestore.indexes.json
 * (uid ASC, itemId ASC, tripDate DESC) and the collectionGroup rule in
 * firestore.rules.
 */
export async function priceHistory(db: Firestore, uid: string, itemId: string): Promise<TripItem[]> {
  const q = query(
    collectionGroup(db, 'tripItems'),
    where('uid', '==', uid),
    where('itemId', '==', itemId),
    orderBy('tripDate', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as TripItem);
}
