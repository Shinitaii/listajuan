export type Category = 'karne' | 'gulay' | 'condiments' | 'bigas' | 'iba_pa';

export const CATEGORIES: Category[] = ['karne', 'gulay', 'condiments', 'bigas', 'iba_pa'];

export type Unit = 'kg' | 'g' | 'ml' | 'pcs' | 'pack' | 'dosena';

export interface Item {
  id: string;
  canonicalName: string;
  nameLower: string;
  aliases: string[];
  category: Category;
  defaultUnit: Unit;
  lastPrice: number | null;
  lastPriceUnit: Unit | null;
  lastPriceDate: string | null; // ISO date
  lastVendor: string | null;
  purchaseCount: number;
}

export type TripStatus = 'draft' | 'saved';

export interface Trip {
  id: string;
  name: string;
  date: string;       // ISO date (the trip's day)
  storeName: string;
  vendor: string | null;
  notes: string | null;
  status: TripStatus;
  total: number;
  itemCount: number;
}

export interface TripItem {
  id: string;
  itemId: string;
  label: string;
  vendor: string | null;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  pricePerUnit: number | null;
  tripDate: string;   // ISO date, copied from the trip for collectionGroup queries
  uid: string;        // owner uid, denormalized so collectionGroup queries can be scoped + secured
  addedAt: number;    // client ms timestamp; defines insertion order within a trip
  category: Category; // denormalized from the item at purchase time, for monthly category spend
}
