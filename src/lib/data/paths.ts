import { doc, collection, type Firestore } from 'firebase/firestore';

export const userDoc = (db: Firestore, uid: string) => doc(db, 'users', uid);
export const itemsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'items');
export const itemDoc = (db: Firestore, uid: string, itemId: string) =>
  doc(db, 'users', uid, 'items', itemId);
export const tripsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'trips');
export const tripDoc = (db: Firestore, uid: string, tripId: string) =>
  doc(db, 'users', uid, 'trips', tripId);
export const tripItemsCol = (db: Firestore, uid: string, tripId: string) =>
  collection(db, 'users', uid, 'trips', tripId, 'tripItems');
export const marketsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'markets');
export const marketDoc = (db: Firestore, uid: string, marketId: string) =>
  doc(db, 'users', uid, 'markets', marketId);
