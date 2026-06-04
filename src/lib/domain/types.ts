export type Category = 'karne' | 'gulay' | 'condiments' | 'bigas' | 'iba_pa';
export const CATEGORIES: Category[] = ['karne', 'gulay', 'condiments', 'bigas', 'iba_pa'];

export type Form = 'bilang' | 'timbang' | 'sukat';
export const FORMS: Form[] = ['bilang', 'timbang', 'sukat'];

export type Unit = 'piraso' | 'dosena' | 'kg' | 'g' | 'L' | 'ml';
export type BaseUnit = 'piece' | 'kg' | 'liter';

export type MarketType = 'palengke' | 'grocery' | 'supermarket' | 'iba_pa';
export const MARKET_TYPES: MarketType[] = ['palengke', 'grocery', 'supermarket', 'iba_pa'];

export interface Market {
  id: string;
  name: string;
  nameLower: string;
  type: MarketType;
}

export interface Item {
  id: string;
  canonicalName: string;
  nameLower: string;
  aliases: string[];
  barcodes: string[];
  category: Category;
  form: Form;
  defaultUnit: Unit;
  lastPricePerBaseUnit: number | null;
  lastUnit: Unit | null;
  lastBaseUnit: BaseUnit | null;
  lastPriceDate: string | null;
  lastMarketId: string | null;
  lastMarketName: string | null;
  lastVariant: string | null;
  purchaseCount: number;
}

export type TripStatus = 'draft' | 'saved';

export interface Trip {
  id: string;
  name: string;
  date: string;
  status: TripStatus;
  total: number;
  itemCount: number;
  marketNames: string[];
  defaultMarketId: string | null;
  defaultMarketName: string | null;
  notes: string | null;
}

export interface UserSettings {
  defaultMarketId: string | null;
  defaultMarketName: string | null;
}

export interface TripItem {
  id: string;
  tripId: string;
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  marketId: string | null;
  marketName: string | null;
  variant: string | null;
  baseUnit: BaseUnit;
  pricePerBaseUnit: number | null;
  category: Category;
  tripDate: string;
  uid: string;
  addedAt: number;
  inCart?: boolean;
}
