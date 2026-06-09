import { doc, collection, type Firestore } from 'firebase/firestore';

// Per-user doc — settings + listId pointer (uid-scoped, unchanged)
export const userDoc = (db: Firestore, uid: string) => doc(db, 'users', uid);

// Household list root
export const listsCol   = (db: Firestore) => collection(db, 'lists');
export const listDoc    = (db: Firestore, listId: string) => doc(db, 'lists', listId);

// Household collections (listId-scoped)
export const itemsCol     = (db: Firestore, listId: string) => collection(db, 'lists', listId, 'items');
export const itemDoc      = (db: Firestore, listId: string, itemId: string) => doc(db, 'lists', listId, 'items', itemId);
export const tripsCol     = (db: Firestore, listId: string) => collection(db, 'lists', listId, 'trips');
export const tripDoc      = (db: Firestore, listId: string, tripId: string) => doc(db, 'lists', listId, 'trips', tripId);
export const tripItemsCol = (db: Firestore, listId: string, tripId: string) => collection(db, 'lists', listId, 'trips', tripId, 'tripItems');
export const marketsCol   = (db: Firestore, listId: string) => collection(db, 'lists', listId, 'markets');
export const marketDoc    = (db: Firestore, listId: string, marketId: string) => doc(db, 'lists', listId, 'markets', marketId);

// Invite links (top-level — readable by any auth'd user)
export const invitesCol = (db: Firestore) => collection(db, 'invites');
export const inviteDoc  = (db: Firestore, token: string) => doc(db, 'invites', token);
