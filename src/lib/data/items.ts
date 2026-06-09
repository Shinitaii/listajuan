import { doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { itemsCol, itemDoc } from './paths';
import type { Item, Category, Unit, Form } from '../domain/types';

export interface NewItemInput {
  canonicalName: string;
  category: Category;
  form: Form;
  defaultUnit: Unit;
  aliases?: string[];
}

export async function createItem(db: Firestore, listId: string, input: NewItemInput): Promise<Item> {
  const ref = doc(itemsCol(db, listId));
  const item: Item = {
    id: ref.id,
    canonicalName: input.canonicalName,
    nameLower: input.canonicalName.toLowerCase(),
    aliases: input.aliases ?? [],
    barcodes: [],
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

export async function getItem(db: Firestore, listId: string, itemId: string): Promise<Item | null> {
  const snap = await getDoc(itemDoc(db, listId, itemId));
  return snap.exists() ? (snap.data() as Item) : null;
}

export async function searchItems(db: Firestore, listId: string, query: string): Promise<Item[]> {
  const q = query.trim().toLowerCase();
  const snap = await getDocs(itemsCol(db, listId));
  const items = snap.docs.map((d) => d.data() as Item);
  if (!q) return items;
  return items.filter(
    (it) => it.nameLower.startsWith(q) || it.aliases.some((a) => a.toLowerCase().startsWith(q)),
  );
}

export async function findItemByBarcode(db: Firestore, listId: string, code: string): Promise<Item | null> {
  const c = code.trim();
  if (!c) return null;
  const snap = await getDocs(itemsCol(db, listId));
  const match = snap.docs.map((d) => d.data() as Item).find((it) => (it.barcodes ?? []).includes(c));
  return match ?? null;
}

export async function attachBarcode(db: Firestore, listId: string, itemId: string, code: string): Promise<void> {
  const c = code.trim();
  if (!c) return;
  const ref = itemDoc(db, listId, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Item ${itemId} not found`);
  const item = snap.data() as Item;
  const current = item.barcodes ?? [];
  if (current.includes(c)) return;
  await setDoc(ref, { ...item, barcodes: [...current, c] });
}

export async function updateItemMeta(
  db: Firestore, listId: string, itemId: string,
  patch: { form?: Form; category?: Category; canonicalName?: string },
): Promise<void> {
  const ref = itemDoc(db, listId, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Item ${itemId} not found`);
  const next = { ...(snap.data() as Item), ...patch };
  if (patch.canonicalName != null) next.nameLower = patch.canonicalName.toLowerCase();
  await setDoc(ref, next);
}

export async function deleteItem(db: Firestore, listId: string, itemId: string): Promise<void> {
  await deleteDoc(itemDoc(db, listId, itemId));
}

export function subscribeItems(db: Firestore, listId: string, cb: (items: Item[]) => void): () => void {
  return onSnapshot(itemsCol(db, listId), (snap) => cb(snap.docs.map((d) => d.data() as Item)));
}
