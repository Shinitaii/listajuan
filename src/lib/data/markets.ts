import { doc, getDoc, setDoc, deleteDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { marketsCol, marketDoc } from './paths';
import type { Market, MarketType } from '../domain/types';

export interface NewMarketInput { name: string; type: MarketType; }

export async function createMarket(db: Firestore, uid: string, input: NewMarketInput): Promise<Market> {
  const ref = doc(marketsCol(db, uid));
  const market: Market = { id: ref.id, name: input.name, nameLower: input.name.toLowerCase(), type: input.type };
  await setDoc(ref, market);
  return market;
}

export async function getMarket(db: Firestore, uid: string, marketId: string): Promise<Market | null> {
  const snap = await getDoc(marketDoc(db, uid, marketId));
  return snap.exists() ? (snap.data() as Market) : null;
}

export function subscribeMarkets(db: Firestore, uid: string, cb: (markets: Market[]) => void): () => void {
  return onSnapshot(marketsCol(db, uid), (snap) => cb(snap.docs.map((d) => d.data() as Market)));
}

export async function updateMarket(db: Firestore, uid: string, marketId: string, patch: { name?: string; type?: MarketType }): Promise<void> {
  const ref = marketDoc(db, uid, marketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Market ${marketId} not found`);
  const cur = snap.data() as Market;
  const name = patch.name ?? cur.name;
  await setDoc(ref, { ...cur, name, nameLower: name.toLowerCase(), type: patch.type ?? cur.type });
}

export async function deleteMarket(db: Firestore, uid: string, marketId: string): Promise<void> {
  await deleteDoc(marketDoc(db, uid, marketId));
}
