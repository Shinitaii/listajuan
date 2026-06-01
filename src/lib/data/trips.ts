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
  };
  await setDoc(ref, tripItem);
  return tripItem;
}

export async function getTripItems(db: Firestore, uid: string, tripId: string): Promise<TripItem[]> {
  const snap = await getDocs(tripItemsCol(db, uid, tripId));
  return snap.docs.map((d) => d.data() as TripItem);
}
