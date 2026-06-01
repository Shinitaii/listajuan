import { db } from '../data/firebase';
import { subscribeItems, searchItems as searchItemsData } from '../data/items';
import type { Item } from '../domain/types';

let _items = $state<Item[]>([]);
let unsub: (() => void) | null = null;

export const library = {
  get items() { return _items; },
};

export function startLibrary(uid: string) {
  if (unsub) return;
  unsub = subscribeItems(db, uid, (items) => { _items = items; });
}

/** Recognition-over-recall search against the loaded library (offline-friendly). */
export function searchLibrary(query: string): Item[] {
  const q = query.trim().toLowerCase();
  if (!q) return _items;
  return _items.filter(
    (it) => it.nameLower.startsWith(q) || it.aliases.some((a) => a.toLowerCase().startsWith(q)),
  );
}
