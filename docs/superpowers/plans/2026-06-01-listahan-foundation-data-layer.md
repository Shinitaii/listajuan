# Listahan Foundation & Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Svelte 5 + Capacitor 6 + Firebase project skeleton with an offline-first, fully-tested data layer (auth, domain calculations, items, trips, the save fan-out, and the price-history query) — no UI screens yet.

**Architecture:** A Vite/Svelte 5 web app wrapped by Capacitor. All Firebase access is isolated behind `src/lib/data/`; components (built in later plans) will consume that layer and never import `firebase/firestore` directly. Pure calculations live in `src/lib/domain/` and are unit-tested with no Firebase. The data layer is tested against the Firestore emulator.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, Firebase Web SDK v11 (Auth + Firestore with `persistentLocalCache`), Capacitor 6, Vitest, Firebase Emulator Suite.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, svelte.config.js   scaffold
capacitor.config.ts                                              Capacitor native shell config
firebase.json, .firebaserc                                       emulator + deploy config
firestore.rules                                                  security rules (UID-scoped)
firestore.indexes.json                                           composite index for price-history query
.env, .env.example                                               Firebase web config (gitignored)
src/lib/domain/types.ts        Item, Trip, TripItem, Category types
src/lib/domain/calc.ts         pure: tripTotal, pricePerUnit, monthDelta, lineTotal
src/lib/domain/calc.test.ts    unit tests (no Firebase)
src/lib/data/firebase.ts       app/auth/db init + persistentLocalCache + emulator wiring
src/lib/data/auth.ts           anonymous sign-in, current-uid accessor
src/lib/data/paths.ts          collection-path helpers (userDoc, itemsCol, tripsCol, ...)
src/lib/data/items.ts          createItem, searchItems, item upsert-on-save
src/lib/data/trips.ts          createDraft, addTripItem, saveTrip (fan-out), priceHistory
src/lib/data/testing/emulator.ts   test helper: connect + clear emulator data
src/lib/data/items.emulator.test.ts
src/lib/data/trips.emulator.test.ts
```

---

## Task 1: Scaffold the Vite + Svelte 5 + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `svelte.config.js`, `index.html`, `src/main.ts`, `src/App.svelte`, `.gitignore`

- [ ] **Step 1: Scaffold with the Svelte+TS Vite template**

The directory already contains `docs/`, so scaffold in place. Run:

```bash
npm create vite@latest . -- --template svelte-ts
```

If prompted that the directory is not empty, choose **"Ignore files and continue"** (it will not delete `docs/`).

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

- [ ] **Step 3: Verify the dev scaffold runs**

Run: `npm run build`
Expected: build completes with no TypeScript errors, emits `dist/`.

- [ ] **Step 4: Add .gitignore entries for env + build + native**

Append to `.gitignore`:

```
.env
.env.local
dist/
android/
ios/
.firebase/
*.log
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Svelte 5 + TypeScript + Vite project"
```

---

## Task 2: Add Vitest and the test scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,emulator.test}.ts'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

Add to the `"scripts"` object:

```json
"test": "vitest run --exclude '**/*.emulator.test.ts'",
"test:emulator": "firebase emulators:exec --only auth,firestore \"vitest run src/lib/data\"",
"test:all": "vitest run"
```

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" or similar (no failures).

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts package-lock.json
git commit -m "chore: add Vitest with unit and emulator test scripts"
```

---

## Task 3: Domain types

**Files:**
- Create: `src/lib/domain/types.ts`

- [ ] **Step 1: Write the types**

```ts
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
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/types.ts
git commit -m "feat: add domain types"
```

---

## Task 4: Domain calculations (pure, TDD)

**Files:**
- Create: `src/lib/domain/calc.ts`
- Test: `src/lib/domain/calc.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { lineTotal, pricePerUnit, tripTotal, monthDelta } from './calc';

describe('lineTotal', () => {
  it('returns pricePaid when set', () => {
    expect(lineTotal({ pricePaid: 320 })).toBe(320);
  });
  it('returns 0 when pricePaid is null', () => {
    expect(lineTotal({ pricePaid: null })).toBe(0);
  });
});

describe('pricePerUnit', () => {
  it('divides price by quantity', () => {
    expect(pricePerUnit(300, 1.5)).toBe(200);
  });
  it('returns null when quantity is missing or zero', () => {
    expect(pricePerUnit(300, null)).toBeNull();
    expect(pricePerUnit(300, 0)).toBeNull();
  });
  it('returns null when price is missing', () => {
    expect(pricePerUnit(null, 2)).toBeNull();
  });
});

describe('tripTotal', () => {
  it('sums line totals, ignoring blank prices', () => {
    expect(tripTotal([{ pricePaid: 320 }, { pricePaid: 300 }, { pricePaid: null }])).toBe(620);
  });
  it('returns 0 for an empty trip', () => {
    expect(tripTotal([])).toBe(0);
  });
});

describe('monthDelta', () => {
  it('returns the signed difference this minus last', () => {
    expect(monthDelta(8420, 7780)).toBe(640);
    expect(monthDelta(7000, 7780)).toBe(-780);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `calc` module not found / functions undefined.

- [ ] **Step 3: Implement `calc.ts`**

```ts
export function lineTotal(item: { pricePaid: number | null }): number {
  return item.pricePaid ?? 0;
}

export function pricePerUnit(price: number | null, quantity: number | null): number | null {
  if (price == null || quantity == null || quantity === 0) return null;
  return price / quantity;
}

export function tripTotal(items: Array<{ pricePaid: number | null }>): number {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function monthDelta(thisMonth: number, lastMonth: number): number {
  return thisMonth - lastMonth;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — all calc tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/calc.ts src/lib/domain/calc.test.ts
git commit -m "feat: add pure domain calculations with tests"
```

---

## Task 5: Firebase config files (emulator + rules + indexes)

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `.env.example`

- [ ] **Step 1: Install Firebase CLI as a dev dependency**

```bash
npm install -D firebase-tools
```

- [ ] **Step 2: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 3: Create `.firebaserc`**

```json
{
  "projects": { "default": "listahan-dev" }
}
```

- [ ] **Step 4: Create `firestore.rules` (UID-scoped, single user)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

- [ ] **Step 5: Create `firestore.indexes.json` (price-history collectionGroup query)**

```json
{
  "indexes": [
    {
      "collectionGroup": "tripItems",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "itemId", "order": "ASCENDING" },
        { "fieldPath": "tripDate", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 6: Create `.env.example`**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=listahan-dev
VITE_FIREBASE_APP_ID=
VITE_USE_EMULATOR=true
```

- [ ] **Step 7: Verify the emulator starts**

Run: `npx firebase emulators:start --only auth,firestore --project listahan-dev`
Expected: emulators boot, Firestore on :8080, Auth on :9099. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json .env.example package.json package-lock.json
git commit -m "chore: add Firebase emulator config, security rules, and indexes"
```

---

## Task 6: Firebase initialization with offline persistence

**Files:**
- Create: `src/lib/data/firebase.ts`

- [ ] **Step 1: Install the Firebase SDK**

```bash
npm install firebase
```

- [ ] **Step 2: Implement `firebase.ts`**

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

export const app: FirebaseApp = initializeApp(config);

// Offline-first: writes hit IndexedDB first and sync when online.
// This is the single most important configuration in the app.
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
});

export const auth: Auth = getAuth(app);

if (useEmulator) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/firebase.ts package.json package-lock.json
git commit -m "feat: initialize Firebase with persistent offline cache and emulator wiring"
```

---

## Task 7: Path helpers

**Files:**
- Create: `src/lib/data/paths.ts`

- [ ] **Step 1: Implement `paths.ts`**

```ts
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/paths.ts
git commit -m "feat: add Firestore collection-path helpers"
```

---

## Task 8: Anonymous auth

**Files:**
- Create: `src/lib/data/auth.ts`

- [ ] **Step 1: Implement `auth.ts`**

```ts
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from './firebase';

/** Ensures a signed-in user (anonymous if none) and resolves with the uid. */
export function ensureSignedIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      unsub();
      if (user) {
        resolve(user.uid);
        return;
      }
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user.uid);
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function currentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/auth.ts
git commit -m "feat: add anonymous auth with ensureSignedIn"
```

---

## Task 9: Emulator test helper

**Files:**
- Create: `src/lib/data/testing/emulator.ts`

- [ ] **Step 1: Implement the helper**

This connects to the running emulator with a non-persistent (memory) cache, signs in anonymously, and clears Firestore data between tests via the emulator REST endpoint.

```ts
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';

const PROJECT_ID = 'listahan-dev';

export interface TestCtx {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  uid: string;
}

export async function setupEmulator(): Promise<TestCtx> {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-key' }, `t-${Date.now()}-${Math.random()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await signInAnonymously(auth);
  return { app, db, auth, uid: cred.user.uid };
}

export async function teardownEmulator(ctx: TestCtx): Promise<void> {
  await deleteApp(ctx.app);
}

export async function clearFirestore(): Promise<void> {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/testing/emulator.ts
git commit -m "test: add Firestore emulator test helper"
```

---

## Task 10: Items data layer (create + search), emulator-tested

**Files:**
- Create: `src/lib/data/items.ts`
- Test: `src/lib/data/items.emulator.test.ts`

- [ ] **Step 1: Write the failing emulator test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, searchItems } from './items';

let ctx: TestCtx;

beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createItem', () => {
  it('creates an item with derived nameLower and zeroed denorm fields', async () => {
    const item = await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Liempo',
      category: 'karne',
      defaultUnit: 'kg',
    });
    expect(item.id).toBeTruthy();
    expect(item.nameLower).toBe('liempo');
    expect(item.purchaseCount).toBe(0);
    expect(item.lastPrice).toBeNull();
    expect(item.aliases).toEqual([]);
  });
});

describe('searchItems', () => {
  it('matches by name prefix, case-insensitive', async () => {
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Bigas', category: 'bigas', defaultUnit: 'kg' });
    const results = await searchItems(ctx.db, ctx.uid, 'li');
    expect(results.map((r) => r.canonicalName)).toEqual(['Liempo']);
  });

  it('matches by alias', async () => {
    await createItem(ctx.db, ctx.uid, {
      canonicalName: 'Chicken breast', category: 'karne', defaultUnit: 'kg', aliases: ['manok'],
    });
    const results = await searchItems(ctx.db, ctx.uid, 'manok');
    expect(results.map((r) => r.canonicalName)).toEqual(['Chicken breast']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:emulator`
Expected: FAIL — `items` module/functions not found.

- [ ] **Step 3: Implement `items.ts`**

```ts
import { doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { itemsCol, itemDoc } from './paths';
import type { Item, Category, Unit } from '../domain/types';

export interface NewItemInput {
  canonicalName: string;
  category: Category;
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
    defaultUnit: input.defaultUnit,
    lastPrice: null,
    lastPriceUnit: null,
    lastPriceDate: null,
    lastVendor: null,
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:emulator`
Expected: PASS — createItem and searchItems tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/items.ts src/lib/data/items.emulator.test.ts
git commit -m "feat: add items data layer (create, get, search) with emulator tests"
```

---

## Task 11: Trips data layer — draft + add item, emulator-tested

**Files:**
- Create: `src/lib/data/trips.ts`
- Test: `src/lib/data/trips.emulator.test.ts`

- [ ] **Step 1: Write the failing tests for draft + add item**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem } from './items';
import { createDraftTrip, addTripItem, getTripItems } from './trips';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('createDraftTrip', () => {
  it('creates a draft with zero total and itemCount', async () => {
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    expect(trip.status).toBe('draft');
    expect(trip.total).toBe(0);
    expect(trip.itemCount).toBe(0);
  });
});

describe('addTripItem', () => {
  it('appends a tripItem with computed pricePerUnit and copied tripDate', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Chicken breast', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    const ti = await addTripItem(ctx.db, ctx.uid, trip.id, {
      itemId: item.id, label: 'Chicken breast', quantity: 1.5, unit: 'kg', pricePaid: 300, vendor: null,
    });
    expect(ti.pricePerUnit).toBe(200);
    expect(ti.tripDate).toBe('2026-05-31');
    const items = await getTripItems(ctx.db, ctx.uid, trip.id);
    expect(items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:emulator`
Expected: FAIL — `trips` module/functions not found.

- [ ] **Step 3: Implement the draft + add-item parts of `trips.ts`**

```ts
import {
  doc, getDoc, getDocs, setDoc, writeBatch, increment,
  query, collectionGroup, where, orderBy, type Firestore,
} from 'firebase/firestore';
import { tripsCol, tripDoc, tripItemsCol, itemDoc } from './paths';
import { pricePerUnit, tripTotal } from '../domain/calc';
import type { Trip, TripItem, Unit } from '../domain/types';

export interface NewTripInput {
  name: string;
  storeName: string;
  date: string; // ISO
  vendor?: string | null;
  notes?: string | null;
}

export async function createDraftTrip(db: Firestore, uid: string, input: NewTripInput): Promise<Trip> {
  const ref = doc(tripsCol(db, uid));
  const trip: Trip = {
    id: ref.id,
    name: input.name,
    date: input.date,
    storeName: input.storeName,
    vendor: input.vendor ?? null,
    notes: input.notes ?? null,
    status: 'draft',
    total: 0,
    itemCount: 0,
  };
  await setDoc(ref, trip);
  return trip;
}

export interface NewTripItemInput {
  itemId: string;
  label: string;
  quantity: number | null;
  unit: Unit;
  pricePaid: number | null;
  vendor: string | null;
}

export async function addTripItem(
  db: Firestore, uid: string, tripId: string, input: NewTripItemInput,
): Promise<TripItem> {
  const tripSnap = await getDoc(tripDoc(db, uid, tripId));
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const tripDate = (tripSnap.data() as Trip).date;

  const ref = doc(tripItemsCol(db, uid, tripId));
  const tripItem: TripItem = {
    id: ref.id,
    itemId: input.itemId,
    label: input.label,
    vendor: input.vendor,
    quantity: input.quantity,
    unit: input.unit,
    pricePaid: input.pricePaid,
    pricePerUnit: pricePerUnit(input.pricePaid, input.quantity),
    tripDate,
  };
  await setDoc(ref, tripItem);
  return tripItem;
}

export async function getTripItems(db: Firestore, uid: string, tripId: string): Promise<TripItem[]> {
  const snap = await getDocs(tripItemsCol(db, uid, tripId));
  return snap.docs.map((d) => d.data() as TripItem);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:emulator`
Expected: PASS — draft + add-item tests green (existing items tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/trips.ts src/lib/data/trips.emulator.test.ts
git commit -m "feat: add trips data layer (draft + add item) with emulator tests"
```

---

## Task 12: The save fan-out, emulator-tested

**Files:**
- Modify: `src/lib/data/trips.ts`
- Test: `src/lib/data/trips.emulator.test.ts` (add cases)

- [ ] **Step 1: Add the failing fan-out tests**

Append to `src/lib/data/trips.emulator.test.ts`:

```ts
import { saveTrip } from './trips';
import { getItem } from './items';

describe('saveTrip fan-out', () => {
  it('marks the trip saved with correct total and itemCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, vendor: 'Cartimar' });

    const saved = await saveTrip(ctx.db, ctx.uid, trip.id);
    expect(saved.status).toBe('saved');
    expect(saved.total).toBe(620);
    expect(saved.itemCount).toBe(2);
  });

  it('updates the parent item lastPrice/lastVendor/lastPriceDate and bumps purchaseCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const trip = await createDraftTrip(ctx.db, ctx.uid, { name: 'Palengke', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, trip.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });

    await saveTrip(ctx.db, ctx.uid, trip.id);

    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.lastPrice).toBe(320);
    expect(updated?.lastVendor).toBe('Cartimar');
    expect(updated?.lastPriceDate).toBe('2026-05-31');
    expect(updated?.purchaseCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:emulator`
Expected: FAIL — `saveTrip` not exported.

- [ ] **Step 3: Implement `saveTrip` in `trips.ts`**

Append to `src/lib/data/trips.ts`:

```ts
export async function saveTrip(db: Firestore, uid: string, tripId: string): Promise<Trip> {
  const tripRef = tripDoc(db, uid, tripId);
  const tripSnap = await getDoc(tripRef);
  if (!tripSnap.exists()) throw new Error(`Trip ${tripId} not found`);
  const trip = tripSnap.data() as Trip;

  const tripItems = await getTripItems(db, uid, tripId);
  const total = tripTotal(tripItems);
  const itemCount = tripItems.length;

  const batch = writeBatch(db);
  batch.set(tripRef, { ...trip, status: 'saved', total, itemCount });

  // Fan-out: each tripItem updates its parent item's denormalized last-price fields.
  // Last write wins per item, so apply in array order (latest line for an item sticks).
  for (const ti of tripItems) {
    if (ti.pricePaid == null) continue;
    batch.set(
      itemDoc(db, uid, ti.itemId),
      {
        lastPrice: ti.pricePaid,
        lastPriceUnit: ti.unit,
        lastPriceDate: ti.tripDate,
        lastVendor: ti.vendor,
        purchaseCount: increment(1),
      },
      { merge: true },
    );
  }

  await batch.commit();
  return { ...trip, status: 'saved', total, itemCount };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:emulator`
Expected: PASS — fan-out tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/trips.ts src/lib/data/trips.emulator.test.ts
git commit -m "feat: implement saveTrip batched fan-out to item denorm fields"
```

---

## Task 13: Price-history query (collectionGroup), emulator-tested

**Files:**
- Modify: `src/lib/data/trips.ts`
- Test: `src/lib/data/trips.emulator.test.ts` (add cases)

- [ ] **Step 1: Add the failing price-history test**

Append to `src/lib/data/trips.emulator.test.ts`:

```ts
import { priceHistory } from './trips';

describe('priceHistory', () => {
  it('returns an items price points across trips, newest first', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });

    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', storeName: 'Cartimar', date: '2026-05-04' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 310, vendor: 'Puregold' });
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', storeName: 'Cartimar', date: '2026-05-31' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: 'Cartimar' });

    const history = await priceHistory(ctx.db, ctx.uid, item.id);
    expect(history.map((h) => h.pricePaid)).toEqual([320, 310]);
    expect(history[0].tripDate).toBe('2026-05-31');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:emulator`
Expected: FAIL — `priceHistory` not exported. (The emulator auto-creates the composite index, so no index error locally.)

- [ ] **Step 3: Implement `priceHistory` in `trips.ts`**

Append to `src/lib/data/trips.ts`:

```ts
/**
 * Price-over-time for a single item across all trips.
 * Uses a collectionGroup query on tripItems; relies on the composite index
 * declared in firestore.indexes.json (itemId ASC, tripDate DESC).
 */
export async function priceHistory(db: Firestore, uid: string, itemId: string): Promise<TripItem[]> {
  const q = query(
    collectionGroup(db, 'tripItems'),
    where('itemId', '==', itemId),
    orderBy('tripDate', 'desc'),
  );
  const snap = await getDocs(q);
  // collectionGroup spans all users; filter to this uid via the doc path.
  return snap.docs
    .filter((d) => d.ref.path.startsWith(`users/${uid}/`))
    .map((d) => d.data() as TripItem);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:emulator`
Expected: PASS — price-history test green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/trips.ts src/lib/data/trips.emulator.test.ts
git commit -m "feat: add collectionGroup price-history query with emulator test"
```

---

## Task 14: Add Capacitor 6 shell

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Capacitor**

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
```

- [ ] **Step 2: Initialize Capacitor (non-interactive)**

```bash
npx cap init Listahan com.listahan.app --web-dir dist
```

Expected: creates `capacitor.config.ts` with `webDir: 'dist'`.

- [ ] **Step 3: Verify the config points at the Vite build dir**

Open `capacitor.config.ts` and confirm `webDir: 'dist'`. If not, set it.

- [ ] **Step 4: Build the web app so a webDir exists**

Run: `npm run build`
Expected: `dist/` is produced.

- [ ] **Step 5: Commit**

```bash
git add capacitor.config.ts package.json package-lock.json
git commit -m "chore: add Capacitor 6 shell configured for the Vite dist build"
```

---

## Task 15: Full test sweep

**Files:** none

- [ ] **Step 1: Run pure unit tests**

Run: `npm test`
Expected: PASS — domain calc tests green; emulator tests excluded.

- [ ] **Step 2: Run emulator tests**

Run: `npm run test:emulator`
Expected: PASS — all items + trips emulator tests green.

- [ ] **Step 3: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: clean build, `dist/` emitted.

- [ ] **Step 5: Commit any incidental fixes**

```bash
git add -A
git commit -m "test: full sweep — unit, emulator, type-check, build green" || echo "nothing to commit"
```

---

## Notes for the next plan (Plan 2 — Core logging loop)

- Wrap the data-layer reads in Svelte 5 stores/runes (e.g. a `trips` store backed by `onSnapshot`) — kept out of this plan because there is no UI to consume them yet.
- `saveTrip` currently re-reads tripItems; when the live draft is held in a store, pass the in-memory items to avoid the extra read.
- Resolve the icon library before building Library C tiles (see spec "Iconography & assets").
```
