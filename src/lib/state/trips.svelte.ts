import { db } from '../data/firebase';
import { subscribeRecentTrips, subscribeDraftTrips } from '../data/trips';
import type { Trip } from '../domain/types';

let _recent = $state<Trip[]>([]);
let _drafts = $state<Trip[]>([]);
let unsubR: (() => void) | null = null;
let unsubD: (() => void) | null = null;

export const trips = {
  get recent() { return _recent; },
  get drafts() { return _drafts; },
};

export function startTrips(uid: string) {
  if (!unsubR) unsubR = subscribeRecentTrips(db, uid, (t) => { _recent = t; });
  if (!unsubD) unsubD = subscribeDraftTrips(db, uid, (t) => { _drafts = t; });
}
