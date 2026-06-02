import { db } from '../data/firebase';
import { subscribeMarkets } from '../data/markets';
import type { Market } from '../domain/types';

let _markets = $state<Market[]>([]);
let unsub: (() => void) | null = null;

export const markets = {
  get all() { return _markets; },
};

export function startMarkets(uid: string) {
  if (unsub) return;
  unsub = subscribeMarkets(db, uid, (m) => { _markets = m; });
}
