# Markets, Product Forms & Logging Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add markets as a first-class per-item link with a trip default, product **forms** with honest base-unit price normalization (the per-unit fix), category-at-creation, and a single-page logging flow — then surface it all in the screens.

**Architecture:** Continues the existing app (Svelte 5 runes + svelte-spa-router@5 + Firestore behind `src/lib/data/`). Adds a pure `domain/units.ts` (forms/conversions), a `markets` collection + data module, reshapes `Item`/`Trip`/`TripItem`, and rebuilds the LogTrip add-item flow as one page. Breaking model changes are fine (dev phase, no migration).

**Tech Stack:** Svelte 5, TypeScript, Firebase v12, layerchart, lucide-svelte, Vitest + Firestore emulator, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-06-02-markets-forms-logging-redesign-design.md`. Read its **Pricing philosophy** and **Variants** sections before touching pricing.

## Conventions

- Filipino-first copy, no emoji (lucide icons). Offline-first; no write spinners. The only confirmation is delete-trip.
- Emulator tests run serially; **kill stale java before each run**: `powershell -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"`. They flake under load — a single failure that passes on isolated re-run is the known flake, not a regression.
- App name is **ListaJuan**; emulator project id is **listajuan-dev**.

## File Structure

```
src/lib/domain/units.ts            NEW pure: forms, unit factors, baseUnitFor/unitsFor/baseUnitLabel/pricePerBaseUnit
src/lib/domain/units.test.ts       NEW
src/lib/domain/types.ts            reshape: Market, Form, Unit, BaseUnit; Item.form; TripItem market+variant+baseUnit+pricePerBaseUnit; Trip.defaultMarketId
src/lib/domain/calc.ts             drop pricePerUnit (moved to units); keep lineTotal/tripTotal/monthDelta/monthRange
src/lib/data/paths.ts              add marketsCol/marketDoc
src/lib/data/markets.ts            NEW createMarket/getMarket/subscribeMarkets
src/lib/data/items.ts             createItem takes form+category; (searchItems unchanged)
src/lib/data/trips.ts             addTripItem(market,variant,form-aware pricing); saveTrip fan-out (last context); priceHistory(unchanged query)+streams helper; lastContextFor prefill; monthlyByCategory unchanged
src/lib/state/markets.svelte.ts    NEW reactive markets + startMarkets
src/lib/state/draft.svelte.ts      default market, addToDraft(market,variant)
src/lib/ui/FormPicker.svelte       NEW form tile-picker (Bilang/Timbang/Sukat)
src/lib/ui/CategoryPicker.svelte   NEW category tile-picker
src/lib/ui/MarketPicker.svelte     NEW market chooser (existing + Bagong tindahan)
src/lib/ui/QtyField.svelte         NEW form-aware quantity (stepper for bilang, decimal keypad for timbang/sukat)
src/routes/AddItem.svelte          NEW single-page add form (replaces the 3-step stepper inside LogTrip)
src/routes/LogTrip.svelte          overview grouped by market + uses AddItem; trip-start default market
src/routes/Home.svelte             rows show date + markets
src/routes/Biyahe.svelte           rows show date + markets
src/routes/TripSummary.svelte      group lines by market
src/routes/ItemHistory.svelte      stream grouping (market/variant) + correct base-unit labels
src/routes/Items.svelte            normalized last price; link to edit form/category
firestore.rules / firestore.indexes.json   add markets coverage (rules already cover via nested rule); no new index needed
```

---

## Task 1: Domain — `units.ts` (pure, TDD)

**Files:** Create `src/lib/domain/units.ts`, `src/lib/domain/units.test.ts`.

- [ ] **Step 1: Write the failing tests** (`units.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { baseUnitFor, unitsFor, baseUnitLabel, unitFactor, pricePerBaseUnit } from './units';

describe('forms and units', () => {
  it('maps each form to its base unit', () => {
    expect(baseUnitFor('bilang')).toBe('piece');
    expect(baseUnitFor('timbang')).toBe('kg');
    expect(baseUnitFor('sukat')).toBe('liter');
  });
  it('lists the units of a form', () => {
    expect(unitsFor('bilang')).toEqual(['piraso', 'dosena']);
    expect(unitsFor('timbang')).toEqual(['kg', 'g']);
    expect(unitsFor('sukat')).toEqual(['L', 'ml']);
  });
  it('labels base units for display', () => {
    expect(baseUnitLabel('piece')).toBe('piraso');
    expect(baseUnitLabel('kg')).toBe('kg');
    expect(baseUnitLabel('liter')).toBe('L');
  });
  it('knows unit factors', () => {
    expect(unitFactor('piraso')).toBe(1);
    expect(unitFactor('dosena')).toBe(12);
    expect(unitFactor('g')).toBe(0.001);
    expect(unitFactor('ml')).toBe(0.001);
  });
});

describe('pricePerBaseUnit', () => {
  it('normalizes dosena and piraso to the same per-piece price', () => {
    expect(pricePerBaseUnit(96, 1, 'dosena')).toBe(8);   // 96 / (1*12)
    expect(pricePerBaseUnit(48, 6, 'piraso')).toBe(8);   // 48 / (6*1)
  });
  it('normalizes kg and half-kg to the same per-kg price', () => {
    expect(pricePerBaseUnit(150, 1, 'kg')).toBe(150);
    expect(pricePerBaseUnit(75, 0.5, 'kg')).toBe(150);
  });
  it('returns null when price or quantity is missing or zero', () => {
    expect(pricePerBaseUnit(null, 1, 'kg')).toBeNull();
    expect(pricePerBaseUnit(100, null, 'kg')).toBeNull();
    expect(pricePerBaseUnit(100, 0, 'kg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run `npx vitest run src/lib/domain/units.test.ts` — confirm FAIL.**

- [ ] **Step 3: Implement `units.ts`:**

```ts
import type { Form, Unit, BaseUnit } from './types';

const UNIT_TABLE: Record<Unit, { form: Form; factor: number }> = {
  piraso: { form: 'bilang', factor: 1 },
  dosena: { form: 'bilang', factor: 12 },
  kg: { form: 'timbang', factor: 1 },
  g: { form: 'timbang', factor: 0.001 },
  L: { form: 'sukat', factor: 1 },
  ml: { form: 'sukat', factor: 0.001 },
};

const BASE_UNIT: Record<Form, BaseUnit> = {
  bilang: 'piece',
  timbang: 'kg',
  sukat: 'liter',
};

const BASE_LABEL: Record<BaseUnit, string> = {
  piece: 'piraso',
  kg: 'kg',
  liter: 'L',
};

export function baseUnitFor(form: Form): BaseUnit {
  return BASE_UNIT[form];
}

export function unitsFor(form: Form): Unit[] {
  return (Object.keys(UNIT_TABLE) as Unit[]).filter((u) => UNIT_TABLE[u].form === form);
}

export function baseUnitLabel(baseUnit: BaseUnit): string {
  return BASE_LABEL[baseUnit];
}

export function unitFactor(unit: Unit): number {
  return UNIT_TABLE[unit].factor;
}

/** Honest per-base-unit price for one transaction. null if price/qty missing or zero. */
export function pricePerBaseUnit(
  pricePaid: number | null,
  quantity: number | null,
  unit: Unit,
): number | null {
  if (pricePaid == null || quantity == null || quantity === 0) return null;
  return pricePaid / (quantity * unitFactor(unit));
}
```

- [ ] **Step 4: Run `npm test` — confirm PASS.** (units.ts imports types not yet reshaped — Task 2 adds `Form`/`BaseUnit`. If `npm test` fails to resolve the type-only imports before Task 2, run this task's test with the types added in Task 2; to keep Task 1 green standalone, FIRST add the `Form`/`Unit`/`BaseUnit` type exports from Task 2 Step 1, then implement units.ts.) **Sequencing note:** do Task 2 Step 1 (the type additions) before Task 1 Step 3 if your tooling type-checks test files. Functionally they land together.

- [ ] **Step 5: Commit** `git add src/lib/domain/units.ts src/lib/domain/units.test.ts && git -c commit.gpgsign=false commit -m "feat: add domain units (forms, conversions, pricePerBaseUnit)"`

---

## Task 2: Reshape domain types + calc

**Files:** Modify `src/lib/domain/types.ts`, `src/lib/domain/calc.ts`, `src/lib/domain/calc.test.ts`.

- [ ] **Step 1: Rewrite `types.ts`:**

```ts
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
  category: Category;
  form: Form;
  defaultUnit: Unit;
  // denormalized "last purchase" (overall) for tiles + fallback prefill:
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
  date: string;               // ISO date
  status: TripStatus;
  total: number;
  itemCount: number;
  defaultMarketId: string | null;   // new items inherit; override per item
  notes: string | null;
}

export interface TripItem {
  id: string;
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  marketId: string | null;
  marketName: string | null;
  variant: string | null;           // pack/size label; NOT normalized
  baseUnit: BaseUnit;
  pricePerBaseUnit: number | null;
  category: Category;               // denormalized for monthlyByCategory
  tripDate: string;
  uid: string;
  addedAt: number;
}
```

- [ ] **Step 2: Update `calc.ts`** — remove `pricePerUnit` (now `pricePerBaseUnit` in units.ts); keep the rest. The file should export exactly: `lineTotal`, `tripTotal`, `monthDelta`, `monthRange`. Delete the `pricePerUnit` function.

- [ ] **Step 3: Update `calc.test.ts`** — delete the `describe('pricePerUnit', …)` block (those cases moved to `units.test.ts`). Keep lineTotal/tripTotal/monthDelta/monthRange tests.

- [ ] **Step 4: Run `npx tsc --noEmit`** — expect errors ONLY in the data-layer/UI files that consume the old shapes (fixed in Tasks 3–6+). `units.ts` and `calc.ts` themselves must type-check. Run `npm test` — units + calc tests PASS.

- [ ] **Step 5: Commit** `git add src/lib/domain && git -c commit.gpgsign=false commit -m "feat: reshape domain types (markets, forms, base-unit pricing)"`

---

## Task 3: Markets data layer (emulator TDD)

**Files:** Modify `src/lib/data/paths.ts`; Create `src/lib/data/markets.ts`, `src/lib/data/markets.emulator.test.ts`.

- [ ] **Step 1: Add paths** to `paths.ts`:

```ts
export const marketsCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'markets');
export const marketDoc = (db: Firestore, uid: string, marketId: string) =>
  doc(db, 'users', uid, 'markets', marketId);
```

- [ ] **Step 2: Write failing test `markets.emulator.test.ts`:**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createMarket, getMarket } from './markets';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createMarket', () => {
  it('creates a market with derived nameLower', async () => {
    const m = await createMarket(ctx.db, ctx.uid, { name: 'Cartimar', type: 'palengke' });
    expect(m.id).toBeTruthy();
    expect(m.nameLower).toBe('cartimar');
    expect((await getMarket(ctx.db, ctx.uid, m.id))?.name).toBe('Cartimar');
  });
});
```

- [ ] **Step 3: Run `npm run test:emulator` — confirm FAIL.**

- [ ] **Step 4: Implement `markets.ts`:**

```ts
import { doc, getDoc, getDocs, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
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
```

- [ ] **Step 5: Run `npm run test:emulator` — PASS** (markets test + existing tests; existing trips/items tests will still fail to compile until Task 4 — if the emulator run can't compile the suite, do Task 4 before running the full emulator suite, but write+commit this file now).

- [ ] **Step 6: Commit** `git add src/lib/data/paths.ts src/lib/data/markets.ts src/lib/data/markets.emulator.test.ts && git -c commit.gpgsign=false commit -m "feat: markets data layer"`

---

## Task 4: Reshape items + trips data layer (emulator TDD)

**Files:** Modify `src/lib/data/items.ts`, `src/lib/data/trips.ts`, and the existing emulator test files.

This is the core reshape. `addTripItem` now takes market + variant and computes `baseUnit`/`pricePerBaseUnit` from the item's form; `saveTrip` fan-out records the last purchase context; add `lastContextFor` (prefill) and `historyStreams` (grouping). Existing emulator tests must be updated to the new shapes.

- [ ] **Step 1: Update `createItem` in `items.ts`** to require `form` and `category`, and initialize the new denorm fields:

```ts
import { doc, getDoc, getDocs, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { itemsCol, itemDoc } from './paths';
import type { Item, Category, Unit, Form } from '../domain/types';
import { baseUnitFor } from '../domain/units';

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
// getItem, searchItems, subscribeItems unchanged (keep existing implementations + their onSnapshot import).
```

- [ ] **Step 2: Rewrite the relevant parts of `trips.ts`.** Imports add `getItem` from items, `baseUnitFor`, `pricePerBaseUnit` from units. New/changed functions:

```ts
import { baseUnitFor, pricePerBaseUnit } from '../domain/calc'; // WRONG — see note
```
NOTE: import from `'../domain/units'` not calc: `import { baseUnitFor, pricePerBaseUnit } from '../domain/units';`. Keep `tripTotal, monthRange` from `'../domain/calc'`.

`addTripItem` (form-aware pricing + market + variant):

```ts
import { getItem } from './items';
import type { Trip, TripItem, Unit, Category } from '../domain/types';

export interface NewTripItemInput {
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  marketId: string | null;
  marketName: string | null;
  variant: string | null;
  category: Category;
}

export async function addTripItem(
  db: Firestore, uid: string, tripId: string, input: NewTripItemInput,
): Promise<TripItem> {
  const tripSnap = await getDoc(tripDoc(db, uid, tripId));
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const tripDate = (tripSnap.data() as Trip).date;
  const item = await getItem(db, uid, input.itemId);
  if (!item) throw new Error(`Item ${input.itemId} not found`);
  const baseUnit = baseUnitFor(item.form);

  const ref = doc(tripItemsCol(db, uid, tripId));
  const tripItem: TripItem = {
    id: ref.id,
    itemId: input.itemId,
    label: input.label,
    quantity: input.quantity,
    unit: input.unit,
    pricePaid: input.pricePaid,
    marketId: input.marketId,
    marketName: input.marketName,
    variant: input.variant,
    baseUnit,
    pricePerBaseUnit: pricePerBaseUnit(input.pricePaid, input.quantity, input.unit),
    category: input.category,
    tripDate,
    uid,
    addedAt: Date.now(),
  };
  await setDoc(ref, tripItem);
  return tripItem;
}
```

`updateTripItem` — recompute `pricePerBaseUnit` (not the old pricePerUnit). Change its patch type to allow `quantity, pricePaid, unit, variant, marketId, marketName` and recompute:

```ts
export interface TripItemPatch {
  quantity?: number | null;
  pricePaid?: number | null;
  unit?: Unit;
  variant?: string | null;
  marketId?: string | null;
  marketName?: string | null;
}

export async function updateTripItem(
  db: Firestore, uid: string, tripId: string, tripItemId: string, patch: TripItemPatch,
): Promise<void> {
  const ref = doc(tripItemsCol(db, uid, tripId), tripItemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`TripItem ${tripItemId} not found`);
  const next = { ...(snap.data() as TripItem), ...patch };
  next.pricePerBaseUnit = pricePerBaseUnit(next.pricePaid, next.quantity, next.unit);
  await setDoc(ref, next);
}
```

`saveTrip` fan-out — keep the draft-only guard and the aggregate-per-item logic, but write the new "last context" fields onto the item:

```ts
  for (const ti of latestByItem.values()) {
    batch.set(
      itemDoc(db, uid, ti.itemId),
      {
        lastPricePerBaseUnit: ti.pricePerBaseUnit,
        lastUnit: ti.unit,
        lastBaseUnit: ti.baseUnit,
        lastPriceDate: ti.tripDate,
        lastMarketId: ti.marketId,
        lastMarketName: ti.marketName,
        lastVariant: ti.variant,
        purchaseCount: increment(1),
      },
      { merge: true },
    );
  }
```
(`latestByItem` aggregation, the `if (ti.pricePaid == null) continue;` skip, the status!=='draft' guard, and the total/itemCount write all stay as they are today.)

`createDraftTrip` — replace `storeName`/`vendor` with `defaultMarketId`/`notes`:

```ts
export interface NewTripInput {
  name: string;
  date: string;
  defaultMarketId?: string | null;
  notes?: string | null;
}
// in the constructed Trip: defaultMarketId: input.defaultMarketId ?? null, notes: input.notes ?? null
// remove storeName/vendor fields.
```

`priceHistory` — unchanged query (collectionGroup uid+itemId, orderBy tripDate desc). ADD a pure grouping helper exported from `trips.ts`:

```ts
export interface HistoryStream {
  key: string;            // `${marketName ?? '—'} · ${variant ?? ''}`.trim()
  marketName: string | null;
  variant: string | null;
  items: TripItem[];      // newest first
}

export function groupHistoryStreams(history: TripItem[]): HistoryStream[] {
  const map = new Map<string, HistoryStream>();
  for (const ti of history) {
    const key = `${ti.marketId ?? ''}|${ti.variant ?? ''}`;
    let s = map.get(key);
    if (!s) { s = { key, marketName: ti.marketName, variant: ti.variant, items: [] }; map.set(key, s); }
    s.items.push(ti);
  }
  return [...map.values()];
}
```

`lastContextFor` — prefill helper: latest purchase of an item, optionally matching market + variant:

```ts
export async function lastContextFor(
  db: Firestore, uid: string, itemId: string, marketId: string | null, variant: string | null,
): Promise<TripItem | null> {
  const history = await priceHistory(db, uid, itemId); // newest first
  const match = history.find((h) => (marketId == null || h.marketId === marketId) && (variant == null || h.variant === variant));
  return match ?? history[0] ?? null;
}
```

`monthlyByCategory`, `getTrip`, `removeTripItem`, `deleteTrip`, `getTripItems`, `subscribe*` — unchanged except they now read the new TripItem shape (no code change needed beyond compiling).

- [ ] **Step 3: Update the existing emulator tests** (`trips.emulator.test.ts`, `subscriptions.emulator.test.ts`, `items.emulator.test.ts`) to the new shapes:
  - Every `createItem(...)` call adds `form: 'bilang'|'timbang'|'sukat'` (use `'timbang'` for Liempo/Chicken, `'bilang'` for eggs/count items) — pick sensibly per item.
  - Every `addTripItem(...)` input adds `marketId: null, marketName: null, variant: null` (and keeps `category`).
  - `createDraftTrip(...)` calls drop `storeName`; the helper currently passes `{ name, storeName, date }` → change to `{ name, date }`.
  - Assertions referencing `pricePerUnit` → `pricePerBaseUnit`. For Liempo `timbang` at 1 kg ₱320 → `pricePerBaseUnit` 320; at 1.5 kg ₱300 → 200.
  - Add a focused test for market+variant in the fan-out + `lastContextFor`:

```ts
import { lastContextFor } from './trips';
describe('lastContextFor', () => {
  it('returns the latest purchase matching market + variant', async () => {
    const m1 = 'mkt1', m2 = 'mkt2';
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Itlog', category: 'iba_pa', form: 'bilang', defaultUnit: 'piraso' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Itlog', quantity: 12, unit: 'piraso', pricePaid: 96, marketId: m1, marketName: 'Palengke', variant: null, category: 'iba_pa' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Itlog', quantity: 6, unit: 'piraso', pricePaid: 54, marketId: m2, marketName: 'SM', variant: '6-pack', category: 'iba_pa' });
    const ctxM2 = await lastContextFor(ctx.db, ctx.uid, item.id, m2, '6-pack');
    expect(ctxM2?.pricePaid).toBe(54);
    expect(ctxM2?.pricePerBaseUnit).toBe(9);   // 54 / (6*1)
  });
});
```

- [ ] **Step 4: Run `npx tsc --noEmit`** — data layer should now compile (UI still broken until later tasks; that's expected — but to get a green emulator run, the *test files* and `src/lib/data/**` must compile. svelte-check/`npm run check` will still fail on UI; that's fine until Task 11+. `npm run test:emulator` only needs `src/lib/data` to compile.)

- [ ] **Step 5: kill java, `npm run test:emulator` — all PASS.**

- [ ] **Step 6: Commit** `git add src/lib/data src/lib/domain && git -c commit.gpgsign=false commit -m "feat: reshape items/trips data layer for markets, forms, base-unit pricing"`

---

## Task 5: Markets state rune + draft updates

**Files:** Create `src/lib/state/markets.svelte.ts`; modify `src/lib/state/draft.svelte.ts`; modify `src/App.svelte` (start markets subscription).

- [ ] **Step 1: `markets.svelte.ts`** (mirror `library.svelte.ts`):

```ts
import { db } from '../data/firebase';
import { subscribeMarkets } from '../data/markets';
import type { Market } from '../domain/types';

let _markets = $state<Market[]>([]);
let unsub: (() => void) | null = null;

export const markets = { get all() { return _markets; } };

export function startMarkets(uid: string) {
  if (unsub) return;
  unsub = subscribeMarkets(db, uid, (m) => { _markets = m; });
}
```

- [ ] **Step 2: `draft.svelte.ts`** — `addToDraft` already forwards `NewTripItemInput`, so it carries market/variant once the type changed. Verify it compiles; no logic change needed beyond the type. (The default-market behavior lives in the UI, not the store.)

- [ ] **Step 3: `App.svelte`** — after auth, also `startMarkets(session.uid)` alongside `startLibrary`/`startTrips`. Add the import.

- [ ] **Step 4: `npm run check`** will still show UI errors (later tasks); confirm the three state files + App.svelte have no NEW errors of their own. Commit.

- [ ] **Step 5: Commit** `git add src/lib/state/markets.svelte.ts src/lib/state/draft.svelte.ts src/App.svelte && git -c commit.gpgsign=false commit -m "feat: markets state rune; start it on boot"`

---

## Task 6: UI primitives — FormPicker, CategoryPicker, MarketPicker, QtyField

**Files:** Create the four components under `src/lib/ui/`.

- [ ] **Step 1: `FormPicker.svelte`** — three big tiles:

```svelte
<script lang="ts">
  import { FORMS, type Form } from '../domain/types';
  let { value = $bindable() } = $props<{ value: Form | null }>();
  const labels: Record<Form, string> = { bilang: 'Bilang (piraso)', timbang: 'Timbang (kg)', sukat: 'Sukat (litro)' };
</script>
<div class="grid">
  {#each FORMS as f}
    <button class="tile" class:on={value === f} onclick={() => (value = f)}>{labels[f]}</button>
  {/each}
</div>
<style>
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .tile { min-height: 64px; border: 2px solid var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .tile.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
</style>
```

- [ ] **Step 2: `CategoryPicker.svelte`** — same pattern over `CATEGORIES` with Filipino labels `{ karne:'Karne', gulay:'Gulay', condiments:'Condiments', bigas:'Bigas', iba_pa:'Iba pa' }`, `value: Category | null` bindable, a 2-col grid.

- [ ] **Step 3: `MarketPicker.svelte`** — choose an existing market or create one:

```svelte
<script lang="ts">
  import { markets } from '../state/markets.svelte';
  import { createMarket } from '../data/markets';
  import { db } from '../data/firebase';
  import { session } from '../state/session.svelte';
  import { MARKET_TYPES, type Market, type MarketType } from '../domain/types';
  let { onPick } = $props<{ onPick: (m: Market) => void }>();
  let creating = $state(false);
  let name = $state('');
  let type = $state<MarketType>('palengke');
  async function create() {
    const m = await createMarket(db, session.uid!, { name: name.trim(), type });
    creating = false; name = ''; onPick(m);
  }
</script>
<div class="wrap">
  {#each markets.all as m (m.id)}
    <button class="chip" onclick={() => onPick(m)}>{m.name}</button>
  {/each}
  {#if !creating}
    <button class="chip add" onclick={() => (creating = true)}>＋ Bagong tindahan</button>
  {:else}
    <div class="new">
      <input placeholder="Pangalan ng tindahan" bind:value={name} />
      <div class="types">{#each MARKET_TYPES as t}<button class="chip" class:on={type === t} onclick={() => (type = t)}>{t}</button>{/each}</div>
      <button class="chip save" disabled={!name.trim()} onclick={create}>I-save</button>
    </div>
  {/if}
</div>
<style>
  .wrap { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); font-weight: 700; }
  .chip.on, .chip.save { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .new { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .new input { border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 10px; font-size: var(--fs-body); }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
```

- [ ] **Step 4: `QtyField.svelte`** — form-aware quantity:

```svelte
<script lang="ts">
  import Stepper from './Stepper.svelte';
  import type { Form } from '../domain/types';
  let { form, value = $bindable(1) } = $props<{ form: Form; value: number }>();
</script>
{#if form === 'bilang'}
  <Stepper bind:value step={1} min={0} />
{:else}
  <input class="num" type="number" inputmode="decimal" step="0.01" min="0" bind:value placeholder="Dami" />
{/if}
<style>
  .num { width: 100%; font-size: var(--fs-hero); text-align: center; border: none; border-bottom: 3px solid var(--c-ink); outline: none; }
</style>
```

- [ ] **Step 5:** `npm run check` (these compile on their own; UI screens still pending). `npm run build` may fail until screens compile — skip build here, rely on check for these files. Commit.

- [ ] **Step 6: Commit** `git add src/lib/ui/FormPicker.svelte src/lib/ui/CategoryPicker.svelte src/lib/ui/MarketPicker.svelte src/lib/ui/QtyField.svelte && git -c commit.gpgsign=false commit -m "feat: UI primitives for forms, categories, markets, form-aware quantity"`

---

## Task 7: AddItem single-page form

**Files:** Create `src/routes/AddItem.svelte` (a component used by LogTrip, not a route).

Props: `{ defaultMarketId, defaultMarketName, onSave }`. Internally drives: pick/create item (with form+category for new), market (default from trip), form-aware qty, unit chips, optional variant, price (prefilled via `lastContextFor`), live per-base-unit readout. Calls `onSave(NewTripItemInput)`.

- [ ] **Step 1: Implement `AddItem.svelte`** (uses `ItemPicker` for selection, the new primitives, and `lastContextFor`/units). Full code:

```svelte
<script lang="ts">
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { createItem } from '../lib/data/items';
  import { lastContextFor, type NewTripItemInput } from '../lib/data/trips';
  import { unitsFor, baseUnitFor, baseUnitLabel, pricePerBaseUnit } from '../lib/domain/units';
  import ItemPicker from './ItemPicker.svelte';
  import FormPicker from '../lib/ui/FormPicker.svelte';
  import CategoryPicker from '../lib/ui/CategoryPicker.svelte';
  import MarketPicker from '../lib/ui/MarketPicker.svelte';
  import QtyField from '../lib/ui/QtyField.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import type { Item, Unit, Form, Category, Market } from '../lib/domain/types';

  let { defaultMarketId = null, defaultMarketName = null, onSave } =
    $props<{ defaultMarketId?: string | null; defaultMarketName?: string | null; onSave: (i: NewTripItemInput) => void }>();
  const uid = session.uid!;

  let item = $state<Item | null>(null);
  // new-item creation
  let newName = $state('');
  let newForm = $state<Form | null>(null);
  let newCategory = $state<Category | null>(null);

  let marketId = $state<string | null>(defaultMarketId);
  let marketName = $state<string | null>(defaultMarketName);
  let pickingMarket = $state(false);
  let qty = $state(1);
  let unit = $state<Unit>('piraso');
  let variant = $state('');
  let price = $state<number | null>(null);

  const units = $derived(item ? unitsFor(item.form) : []);
  const baseUnit = $derived(item ? baseUnitFor(item.form) : 'piece');
  const ppu = $derived(pricePerBaseUnit(price, qty, unit));

  async function pick(r: Item | { isNew: true; name: string }) {
    if ('isNew' in r) { newName = r.name; return; } // show the form/category pickers
    item = r; unit = r.defaultUnit; variant = r.lastVariant ?? '';
    const ctx = await lastContextFor(db, uid, r.id, marketId, variant || null);
    if (ctx?.pricePerBaseUnit != null) price = Math.round(ctx.pricePerBaseUnit * qty * (unit === r.defaultUnit ? 1 : 1)); // estimate; user edits
  }

  async function confirmNewItem() {
    if (!newName.trim() || !newForm || !newCategory) return;
    const created = await createItem(db, uid, {
      canonicalName: newName.trim(), category: newCategory, form: newForm, defaultUnit: unitsFor(newForm)[0],
    });
    item = created; unit = created.defaultUnit; newName = '';
  }

  function pickMarket(m: Market) { marketId = m.id; marketName = m.name; pickingMarket = false; }

  function save() {
    if (!item) return;
    onSave({
      itemId: item.id, label: item.canonicalName, quantity: qty, unit, pricePaid: price,
      marketId, marketName, variant: variant.trim() || null, category: item.category,
    });
  }
</script>

<div class="add">
  {#if !item && !newName}
    <ItemPicker onPick={pick} />
  {:else if !item}
    <h2>Bagong item: "{newName}"</h2>
    <p class="lbl">Anong klase?</p><FormPicker bind:value={newForm} />
    <p class="lbl">Kategorya?</p><CategoryPicker bind:value={newCategory} />
    <AppButton onclick={confirmNewItem} disabled={!newForm || !newCategory}>Gumawa</AppButton>
  {:else}
    <h2>{item.canonicalName}</h2>

    <p class="lbl">Saang tindahan?</p>
    {#if pickingMarket}
      <MarketPicker onPick={pickMarket} />
    {:else}
      <button class="market" onclick={() => (pickingMarket = true)}>{marketName ?? 'Pumili ng tindahan'} ▾</button>
    {/if}

    <p class="lbl">Dami</p>
    <QtyField form={item.form} bind:value={qty} />
    <div class="chips">
      {#each units as u}<button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>{/each}
    </div>

    <p class="lbl">Uri (opsyonal) — hal. "3-pack", "225ml"</p>
    <input class="variant" bind:value={variant} placeholder="walang laman = ordinaryo" />

    <p class="lbl">Presyo (kabuuan)</p>
    <input class="price" type="number" inputmode="decimal" bind:value={price} placeholder="₱" />
    {#if ppu != null}<p class="readout">= ₱{Math.round(ppu).toLocaleString('en-PH')} / {baseUnitLabel(baseUnit)}</p>{/if}

    <AppButton onclick={save}>I-save ang item</AppButton>
  {/if}
</div>

<style>
  .add { display: flex; flex-direction: column; gap: 8px; }
  h2 { font-size: 22px; margin: 4px 0; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 12px 0 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .market { text-align: left; border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 12px; background: var(--c-bg); font-weight: 700; }
  .variant { border: 2px solid var(--c-ink); border-radius: var(--radius); padding: 10px; font-size: var(--fs-body); }
  .price { font-size: var(--fs-hero); text-align: center; border: none; border-bottom: 3px solid var(--c-ink); outline: none; }
  .readout { font-size: var(--fs-price); font-weight: 700; color: var(--c-accent); text-align: center; }
</style>
```

(NOTE on the prefill estimate: keep it simple — prefill `price` from `lastContextFor` as `pricePerBaseUnit × qty × unitFactor(unit)` is the honest estimate; the inline `(unit===… ? 1 : 1)` placeholder above must be replaced with the real factor via `unitFactor(unit)` imported from units — import it and compute `Math.round(ctx.pricePerBaseUnit * qty * unitFactor(unit))`. Fix this when implementing.)

- [ ] **Step 2:** `npm run check` for AddItem (depends on ItemPicker which still passes `onPick`). Fix type errors. Commit.

- [ ] **Step 3: Commit** `git add src/routes/AddItem.svelte && git -c commit.gpgsign=false commit -m "feat: single-page AddItem form (market, form-aware qty, variant, live per-base-unit)"`

---

## Task 8: LogTrip — overview grouped by market + AddItem

**Files:** Modify `src/routes/LogTrip.svelte`; modify `src/routes/Home.svelte` (trip start passes default market — optional, can be set later).

- [ ] **Step 1: Rewrite LogTrip** to use `AddItem` instead of the 3-step stepper, and group the overview by market. Keep the `leaving` flag + resume effect from the current file. The overview lists items grouped by `marketName` with subtotals; "＋ Magdagdag ng item" toggles `mode='adding'` and renders `<AddItem defaultMarketId={draft.trip?.defaultMarketId} … onSave={…}>`; on save call `addToDraft(uid, input)` then `mode='overview'`. "Tapos — i-save ang biyahe" calls the existing `finish()`. Use `pricePerBaseUnit`/`baseUnitLabel` to show each line's normalized price. (Full code mirrors the current LogTrip overview structure; replace the stepper block with `<AddItem>` and replace the flat list with a per-market grouped list.)

- [ ] **Step 2:** `npm run check` + `npm run build`. Manual (emulator, `npm run dev`): start trip → add an item via the one-page form (incl. creating a new item with form+category) → see it under its market with the per-base-unit label → add a second item at a different market → both groups show → Tapos → summary.

- [ ] **Step 3: Commit** `git add src/routes/LogTrip.svelte src/routes/Home.svelte && git -c commit.gpgsign=false commit -m "feat: single-page logging — overview grouped by market, AddItem form"`

---

## Task 9: Display — Home, Biyahe, Trip Summary

**Files:** Modify `src/routes/Home.svelte`, `src/routes/Biyahe.svelte`, `src/routes/TripSummary.svelte`.

- [ ] **Step 1: Trip rows show date + markets.** Add a helper (in `domain/` or inline) `marketsLabel(items|trip)`: derive distinct market names. Since the trip list doesn't carry tripItems, show `t.date` plus a market summary where available; for the recent/Biyahe lists show `t.date · t.itemCount item(s)`. (Markets-visited needs the tripItems; for the list rows show date + itemCount + total — the market detail appears on the summary. If you want markets in the row, denormalize `marketNames: string[]` onto the Trip in `saveTrip` — do this: in `saveTrip`, compute distinct market names from tripItems and write `marketNames` onto the trip doc; add `marketNames: string[]` to the `Trip` type. Then rows render `t.date · {marketNames.join(' + ') or 'N tindahan'}`.)

- [ ] **Step 2: TripSummary** groups line items by `marketName` with per-market subtotals, then the grand total; each line shows `qty unit ×` and the normalized `₱X/baseUnitLabel`.

- [ ] **Step 3:** `npm run check`, `npm run build`. Manual: Home/Biyahe rows show date + markets; summary groups by market.

- [ ] **Step 4: Commit** `git add src/routes/Home.svelte src/routes/Biyahe.svelte src/routes/TripSummary.svelte src/lib/domain/types.ts src/lib/data/trips.ts && git -c commit.gpgsign=false commit -m "feat: show date + markets in trip lists; group summary by market"`

---

## Task 10: ItemHistory streams + Items screen edit

**Files:** Modify `src/routes/ItemHistory.svelte`, `src/routes/Items.svelte`.

- [ ] **Step 1: ItemHistory** uses `groupHistoryStreams(history)` to render one block per (market, variant) stream — each with its own giant last price + sparkline + receipts, labelled with `baseUnitLabel`. The headline shows the most recent stream; others listed below for "saan mas mura."

- [ ] **Step 2: Items screen** rows show `₱{lastPricePerBaseUnit}/{baseUnitLabel(lastBaseUnit)}`; tapping opens an edit affordance to correct `form`/`category` (add `updateItemMeta(db, uid, itemId, { form?, category? })` to `items.ts` — when `form` changes, note existing tripItems keep their recorded baseUnit; only future buys use the new form). Add a minimal edit UI (two pickers + save).

- [ ] **Step 3:** `npm run check`, `npm run build`. Manual: an item bought at two markets / two variants shows separate streams; editing an item's category reflects in Gastos on the next save.

- [ ] **Step 4: Commit** `git add src/routes/ItemHistory.svelte src/routes/Items.svelte src/lib/data/items.ts && git -c commit.gpgsign=false commit -m "feat: per-stream price history; editable item form/category"`

---

## Task 11: e2e + full sweep

**Files:** Modify `e2e/core-loop.spec.ts`.

- [ ] **Step 1: Update the e2e** for the single-page flow: start trip → "Bagong item" → set Form (Bilang) + Category → market (create "Palengke") → qty 6 piraso → price 48 → assert readout "= ₱8 / piraso" → I-save → item shows under Palengke → Tapos → summary grouped by market. Add a second test: an item logged by weight (Timbang, kg) shows "/kg". Use text/role selectors; `waitForURL(/#\/log\//)` after starting (as the current spec does).

- [ ] **Step 2: Full sweep:** `npm test`; kill java + `npm run test:emulator`; `npm run check` (0/0); `npm run build`; `npm run e2e`. All green (re-run emulator once if a lone flake).

- [ ] **Step 3: Review e2e screenshots** — confirm no emoji, Filipino copy, per-base-unit labels, market grouping.

- [ ] **Step 4: Commit** any fixes.

---

## Notes / carry-forward

- **Recipes / saved lists** and **recommendations/ML** remain parked (spec "Out of scope").
- **i18n** still pending (hardcoded Tagalog) — see architecture-roadmap.
- Editing an item's `form` after it has history: existing tripItems keep their recorded `baseUnit`/`pricePerBaseUnit` (historically accurate); only future buys use the new form. Documented, intended.
- The recurring emulator `subscribeTripItems` flake (passes on isolated re-run) persists; not a regression.

### Final-review findings (fixed/deferred)
- **FIXED:** the prefilled total now tracks qty/unit until the user edits the price (was computed once at pick-time, drifting from the live readout).
- **Deferred (latent — trip default market not wired yet):** trip-start never sets `defaultMarketId`, so `AddItem` always starts market-unset. The spec's "optional default market at trip start" is unimplemented; when wired, also pass the resolved `defaultMarketName` to `AddItem` (today it's hardcoded `null`, which would put a line under "Walang tindahan" despite having a market id) and resolve the `state_referenced_locally` warnings on those props.
- **Deferred (minor):** LogTrip/TripSummary group by market **name**, so two distinct user-created markets with the same name merge. Group by `marketId` (name for display) if duplicate names appear in practice.
- **Deferred (minor):** clearing the quantity field saves a `null` quantity (no crash; readout just hides). Consider requiring qty before save.
- **Deferred (minor):** once a default market is set, `lastContextFor` requires both market+variant to match and silently falls back to the newest row of any stream if it can't — could prefill a foreign stream's price. Revisit with the default-market wiring.
