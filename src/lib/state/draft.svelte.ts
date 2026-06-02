import { db } from '../data/firebase';
import {
  createDraftTrip, addTripItem, subscribeTripItems, updateTripItem,
  removeTripItem, saveTrip, getTrip,
  type NewTripInput, type NewTripItemInput, type TripItemPatch,
} from '../data/trips';
import { tripTotal } from '../domain/calc';
import type { Trip, TripItem } from '../domain/types';

let _trip = $state<Trip | null>(null);
let _items = $state<TripItem[]>([]);
let unsub: (() => void) | null = null;

export const draft = {
  get trip() { return _trip; },
  get items() { return _items; },
  get total() { return tripTotal(_items); },
};

function watch(uid: string, tripId: string) {
  unsub?.();
  unsub = subscribeTripItems(db, uid, tripId, (i) => { _items = i; });
}

export async function startNewTrip(uid: string, input: NewTripInput): Promise<string> {
  _trip = await createDraftTrip(db, uid, input);
  _items = [];
  watch(uid, _trip.id);
  return _trip.id;
}

/**
 * Loads a DRAFT trip into the editor. Returns false (without throwing) when the
 * trip is missing or already saved — callers redirect instead of crashing.
 * Drafts-only matters: it stops a saved trip being re-opened and re-committed.
 */
export async function resumeTrip(uid: string, tripId: string): Promise<boolean> {
  const t = await getTrip(db, uid, tripId);
  if (!t || t.status !== 'draft') {
    unsub?.(); unsub = null; _trip = null; _items = [];
    return false;
  }
  _trip = t;
  watch(uid, tripId);
  return true;
}

export async function addToDraft(uid: string, input: NewTripItemInput): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await addTripItem(db, uid, _trip.id, input);
}

export async function editDraftItem(uid: string, tripItemId: string, patch: TripItemPatch): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await updateTripItem(db, uid, _trip.id, tripItemId, patch);
}

export async function removeDraftItem(uid: string, tripItemId: string): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await removeTripItem(db, uid, _trip.id, tripItemId);
}

export async function commitDraft(uid: string): Promise<string> {
  if (!_trip) throw new Error('No active trip');
  const saved = await saveTrip(db, uid, _trip.id);
  const id = saved.id;
  unsub?.(); unsub = null; _trip = null; _items = [];
  return id;
}
