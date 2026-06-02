import { doc, getDoc, getDocs, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { itemsCol, itemDoc } from './paths';
import type { Item, Category, Unit, Form } from '../domain/types';

export interface NewItemInput {
  canonicalName: string;
  category: Category;
  form: Form;
  defaultUnit: Unit;
  aliases?: string[];
}

export async function createItem(db: Firestore, uid: string, input: NewItemInput): Promise<Item> {
  const ref = doc(itemsCol(db, uid));
  const item: Item = {
    id: ref.id,
    canonicalName: input.canonicalName,
    nameLower: input.canonicalName.toLowerCase(),
    aliases: input.aliases ?? [],
    category: input.category,
    form: input.form,
    defaultUnit: input.defaultUnit,
    lastPricePerBaseUnit: null,
    lastUnit: null,
    lastBaseUnit: null,
    lastPriceDate: null,
    lastMarketId: null,
    lastMarketName: null,
    lastVariant: null,
    purchaseCount: 0,
  };
  await setDoc(ref, item);
  return item;
}

export async function getItem(db: Firestore, uid: string, itemId: string): Promise<Item | null> {
  const snap = await getDoc(itemDoc(db, uid, itemId));
  return snap.exists() ? (snap.data() as Item) : null;
}

/**
 * Recognition-over-recall search: matches name prefix or any alias prefix,
 * case-insensitive. Client-side filter over the (small, single-user) library —
 * appropriate for v1 scale and works fully offline against the local cache.
 */
export async function searchItems(db: Firestore, uid: string, query: string): Promise<Item[]> {
  const q = query.trim().toLowerCase();
  const snap = await getDocs(itemsCol(db, uid));
  const items = snap.docs.map((d) => d.data() as Item);
  if (!q) return items;
  return items.filter(
    (it) => it.nameLower.startsWith(q) || it.aliases.some((a) => a.toLowerCase().startsWith(q)),
  );
}

export function subscribeItems(db: Firestore, uid: string, cb: (items: Item[]) => void): () => void {
  return onSnapshot(itemsCol(db, uid), (snap) => cb(snap.docs.map((d) => d.data() as Item)));
}
