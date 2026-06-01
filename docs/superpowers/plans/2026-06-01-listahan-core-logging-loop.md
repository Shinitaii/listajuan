# Listahan Core Logging Loop Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the accessibility-first core logging loop UI — app shell + Home, Log-a-Trip (one-thing-at-a-time stepper), Item Library (recognition tiles + search fallback), and Trip Summary — on top of Plan 1's data layer.

**Architecture:** Capacitor SPA. `svelte-spa-router` (hash routing) drives a persistent bottom tab bar plus pushed detail screens. Lucide icons replace all emoji. Reactive state lives in Svelte 5 runes inside `.svelte.ts` modules that wrap the Plan 1 data layer's Firestore `onSnapshot` subscriptions; components never touch `firebase/firestore`. New data-layer functions (live subscriptions, inline edit/delete, monthly total) are added first and emulator-tested before any UI consumes them.

**Tech Stack:** Svelte 5 (runes), svelte-spa-router, lucide-svelte, Vite, TypeScript, Firebase v12, Vitest + Firestore emulator.

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-06-01-listahan-foundation-data-layer.md`). Spec: `docs/superpowers/specs/2026-06-01-listahan-v1-design.md`. Read the spec's "Screen directions" and "Interaction & error-handling philosophy" sections before building screens.

---

## Conventions for this plan

- **No emoji** anywhere. Use `lucide-svelte` icon components.
- **Filipino-first** copy (see spec copy list). English only as code comments.
- **Forgiving input:** inline edits with no confirmation; the ONLY confirmation dialog is delete-trip.
- **Offline:** never block UI on network; no spinners on writes (writes resolve from local cache).
- Emulator tests run serially (`npm run test:emulator`, already configured `--no-file-parallelism`). Kill stale java before runs: `powershell -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"`.
- Run a single unit test file: `npx vitest run path/to/file.test.ts`.

## File Structure

```
src/lib/data/trips.ts        (extend) getTrip, updateTripItem, removeTripItem, deleteTrip,
                                       subscribeRecentTrips, subscribeDraftTrips,
                                       subscribeTripItems, monthlyTotal
src/lib/data/items.ts        (extend) subscribeItems
src/lib/domain/calc.ts       (extend) monthRange(year, month) -> {startISO, endISO}
src/lib/state/session.svelte.ts     uid + auth-ready rune (bootstraps ensureSignedIn)
src/lib/state/library.svelte.ts     reactive items library (subscribeItems)
src/lib/state/trips.svelte.ts       reactive recent + draft trips
src/lib/state/draft.svelte.ts       the active trip being logged (items + running total)
src/lib/ui/tokens.css               design tokens (color, type scale, spacing, tap targets)
src/lib/ui/TabBar.svelte            persistent 4-tab bottom nav (Lucide icons)
src/lib/ui/AppButton.svelte         full-width primary / ghost button (>=52pt)
src/lib/ui/Stepper.svelte           big +/- quantity stepper (>=48pt targets)
src/lib/ui/ConfirmDialog.svelte     the single confirmation dialog (delete trip only)
src/lib/ui/categoryIcon.ts          maps Category -> Lucide icon component
src/routes/Home.svelte
src/routes/LogTrip.svelte           the stepper flow (1 Item / 2 Dami / 3 Presyo)
src/routes/ItemPicker.svelte        recognition tiles + search fallback (used by LogTrip)
src/routes/TripSummary.svelte
src/App.svelte               (replace) Router + auth gate + TabBar
src/main.ts                  (verify) mounts App, imports tokens.css
```

---

## Task 1: Domain — month range helper (pure, TDD)

**Files:** Modify `src/lib/domain/calc.ts`; Test `src/lib/domain/calc.test.ts`.

- [ ] **Step 1: Add failing tests** (append to `calc.test.ts`):

```ts
import { monthRange } from './calc';

describe('monthRange', () => {
  it('returns ISO start (inclusive) and end (exclusive) for a month', () => {
    // June 2026
    expect(monthRange(2026, 6)).toEqual({ startISO: '2026-06-01', endISO: '2026-07-01' });
  });
  it('rolls over the year in December', () => {
    expect(monthRange(2026, 12)).toEqual({ startISO: '2026-12-01', endISO: '2027-01-01' });
  });
});
```

- [ ] **Step 2: Run `npx vitest run src/lib/domain/calc.test.ts` — confirm FAIL.**

- [ ] **Step 3: Implement** (append to `calc.ts`):

```ts
/** Inclusive start / exclusive end ISO dates for a 1-based month. */
export function monthRange(year: number, month: number): { startISO: string; endISO: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const startISO = `${year}-${pad(month)}-01`;
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const endISO = `${ny}-${pad(nm)}-01`;
  return { startISO, endISO };
}
```

- [ ] **Step 4: Run `npm test` — confirm PASS.**

- [ ] **Step 5: Commit** `git add src/lib/domain && git -c commit.gpgsign=false commit -m "feat: add monthRange domain helper"`

---

## Task 2: Data layer — trip read + mutations (emulator TDD)

**Files:** Modify `src/lib/data/trips.ts`; Test `src/lib/data/trips.emulator.test.ts`.

Adds: `getTrip`, `updateTripItem` (recomputes pricePerUnit), `removeTripItem`, `deleteTrip` (deletes the trip and all its tripItems), `monthlyTotal`.

- [ ] **Step 1: Add failing tests** (append):

```ts
import { getTrip, updateTripItem, removeTripItem, deleteTrip, monthlyTotal } from './trips';

describe('getTrip', () => {
  it('returns the trip or null', async () => {
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    expect((await getTrip(ctx.db, ctx.uid, t.id))?.id).toBe(t.id);
    expect(await getTrip(ctx.db, ctx.uid, 'nope')).toBeNull();
  });
});

describe('updateTripItem', () => {
  it('updates fields and recomputes pricePerUnit', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await updateTripItem(ctx.db, ctx.uid, t.id, ti.id, { quantity: 2, pricePaid: 700 });
    const items = await getTripItems(ctx.db, ctx.uid, t.id);
    expect(items[0].quantity).toBe(2);
    expect(items[0].pricePaid).toBe(700);
    expect(items[0].pricePerUnit).toBe(350);
  });
});

describe('removeTripItem', () => {
  it('deletes a single line', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    const ti = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await removeTripItem(ctx.db, ctx.uid, t.id, ti.id);
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('deleteTrip', () => {
  it('deletes the trip and its tripItems', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await deleteTrip(ctx.db, ctx.uid, t.id);
    expect(await getTrip(ctx.db, ctx.uid, t.id)).toBeNull();
    expect(await getTripItems(ctx.db, ctx.uid, t.id)).toHaveLength(0);
  });
});

describe('monthlyTotal', () => {
  it('sums saved-trip totals within the month, excluding drafts and other months', async () => {
    const a = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', storeName: 'C', date: '2026-06-03' });
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    await addTripItem(ctx.db, ctx.uid, a.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, vendor: null });
    await saveTrip(ctx.db, ctx.uid, a.id);
    // a draft in the same month should NOT count
    const d = await createDraftTrip(ctx.db, ctx.uid, { name: 'D', storeName: 'C', date: '2026-06-10' });
    await addTripItem(ctx.db, ctx.uid, d.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 999, vendor: null });
    // a saved trip in a different month should NOT count
    const b = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', storeName: 'C', date: '2026-05-30' });
    await addTripItem(ctx.db, ctx.uid, b.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 500, vendor: null });
    await saveTrip(ctx.db, ctx.uid, b.id);

    expect(await monthlyTotal(ctx.db, ctx.uid, 2026, 6)).toBe(320);
  });
});
```

- [ ] **Step 2: Run `npm run test:emulator` — confirm FAIL.**

- [ ] **Step 3: Implement** (append to `trips.ts`; add `deleteDoc, limit, where, query, orderBy` to the firestore import as needed — `query/where/orderBy` already imported, add `deleteDoc, limit`):

```ts
export async function getTrip(db: Firestore, uid: string, tripId: string): Promise<Trip | null> {
  const snap = await getDoc(tripDoc(db, uid, tripId));
  return snap.exists() ? (snap.data() as Trip) : null;
}

export interface TripItemPatch {
  quantity?: number | null;
  pricePaid?: number | null;
  unit?: Unit;
  vendor?: string | null;
  label?: string;
}

export async function updateTripItem(
  db: Firestore, uid: string, tripId: string, tripItemId: string, patch: TripItemPatch,
): Promise<void> {
  const ref = doc(tripItemsCol(db, uid, tripId), tripItemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`TripItem ${tripItemId} not found`);
  const current = snap.data() as TripItem;
  const next: TripItem = { ...current, ...patch };
  next.pricePerUnit = pricePerUnit(next.pricePaid, next.quantity);
  await setDoc(ref, next);
}

export async function removeTripItem(
  db: Firestore, uid: string, tripId: string, tripItemId: string,
): Promise<void> {
  await deleteDoc(doc(tripItemsCol(db, uid, tripId), tripItemId));
}

export async function deleteTrip(db: Firestore, uid: string, tripId: string): Promise<void> {
  const items = await getTripItems(db, uid, tripId);
  const batch = writeBatch(db);
  for (const ti of items) batch.delete(doc(tripItemsCol(db, uid, tripId), ti.id));
  batch.delete(tripDoc(db, uid, tripId));
  await batch.commit();
}

export async function monthlyTotal(db: Firestore, uid: string, year: number, month: number): Promise<number> {
  const { startISO, endISO } = monthRange(year, month);
  const q = query(
    tripsCol(db, uid),
    where('status', '==', 'saved'),
    where('date', '>=', startISO),
    where('date', '<', endISO),
  );
  const snap = await getDocs(q);
  return snap.docs.reduce((sum, d) => sum + ((d.data() as Trip).total ?? 0), 0);
}
```

Add the import for `monthRange`: `import { pricePerUnit, tripTotal, monthRange } from '../domain/calc';`

- [ ] **Step 4: Run `npm run test:emulator` — confirm all PASS.** (The status+date range query needs a composite index; the emulator auto-creates it. ALSO add it to `firestore.indexes.json` for production — see Step 5.)

- [ ] **Step 5: Add the production index** to `firestore.indexes.json` `indexes` array:

```json
{
  "collectionGroup": "trips",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 6: Commit** `git add src/lib/data/trips.ts src/lib/data/trips.emulator.test.ts firestore.indexes.json && git -c commit.gpgsign=false commit -m "feat: add trip read/update/delete and monthlyTotal data-layer fns"`

---

## Task 3: Data layer — live subscriptions (emulator TDD)

**Files:** Modify `src/lib/data/items.ts`, `src/lib/data/trips.ts`; Test new `src/lib/data/subscriptions.emulator.test.ts`.

Adds `onSnapshot`-based subscriptions returning an unsubscribe function. Each takes a callback.

- [ ] **Step 1: Write failing test** `src/lib/data/subscriptions.emulator.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { createItem, subscribeItems } from './items';
import { createDraftTrip, addTripItem, saveTrip, subscribeRecentTrips, subscribeDraftTrips, subscribeTripItems } from './trips';
import type { Item, Trip, TripItem } from '../domain/types';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

// Helper: wait until a predicate over the latest callback value holds, or time out.
function waitFor<T>(subscribe: (cb: (v: T) => void) => () => void, pred: (v: T) => boolean, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => { unsub(); reject(new Error('timeout')); }, ms);
    unsub = subscribe((v) => { if (pred(v)) { clearTimeout(timer); unsub(); resolve(v); } });
  });
}

describe('subscribeItems', () => {
  it('emits the library and updates on insert', async () => {
    await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const items = await waitFor<Item[]>((cb) => subscribeItems(ctx.db, ctx.uid, cb), (v) => v.length === 1);
    expect(items[0].canonicalName).toBe('Liempo');
  });
});

describe('subscribeRecentTrips', () => {
  it('emits only saved trips, newest first', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'Old', storeName: 'C', date: '2026-05-01' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'L', quantity: 1, unit: 'kg', pricePaid: 100, vendor: null });
    await saveTrip(ctx.db, ctx.uid, t1.id);
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'New', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'L', quantity: 1, unit: 'kg', pricePaid: 200, vendor: null });
    await saveTrip(ctx.db, ctx.uid, t2.id);
    const trips = await waitFor<Trip[]>((cb) => subscribeRecentTrips(ctx.db, ctx.uid, cb), (v) => v.length === 2);
    expect(trips.map((t) => t.name)).toEqual(['New', 'Old']);
  });
});

describe('subscribeDraftTrips', () => {
  it('emits only drafts', async () => {
    await createDraftTrip(ctx.db, ctx.uid, { name: 'Draft', storeName: 'C', date: '2026-06-01' });
    const drafts = await waitFor<Trip[]>((cb) => subscribeDraftTrips(ctx.db, ctx.uid, cb), (v) => v.length === 1);
    expect(drafts[0].name).toBe('Draft');
  });
});

describe('subscribeTripItems', () => {
  it('emits the live items of one trip in entry order', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'P', storeName: 'C', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'first', quantity: 1, unit: 'kg', pricePaid: 100, vendor: null });
    await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'second', quantity: 1, unit: 'kg', pricePaid: 200, vendor: null });
    const items = await waitFor<TripItem[]>((cb) => subscribeTripItems(ctx.db, ctx.uid, t.id, cb), (v) => v.length === 2);
    expect(items.map((i) => i.label)).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 2: Run `npm run test:emulator` — confirm FAIL.**

- [ ] **Step 3: Implement.** In `items.ts` add (and import `onSnapshot`):

```ts
import { /* existing */ onSnapshot } from 'firebase/firestore';

export function subscribeItems(db: Firestore, uid: string, cb: (items: Item[]) => void): () => void {
  return onSnapshot(itemsCol(db, uid), (snap) => cb(snap.docs.map((d) => d.data() as Item)));
}
```

In `trips.ts` add (`onSnapshot`, `limit` to imports):

```ts
export function subscribeRecentTrips(
  db: Firestore, uid: string, cb: (trips: Trip[]) => void, max = 20,
): () => void {
  const q = query(tripsCol(db, uid), where('status', '==', 'saved'), orderBy('date', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Trip)));
}

export function subscribeDraftTrips(db: Firestore, uid: string, cb: (trips: Trip[]) => void): () => void {
  const q = query(tripsCol(db, uid), where('status', '==', 'draft'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Trip)));
}

export function subscribeTripItems(
  db: Firestore, uid: string, tripId: string, cb: (items: TripItem[]) => void,
): () => void {
  const q = query(tripItemsCol(db, uid, tripId), orderBy('addedAt', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as TripItem)));
}
```

Note: `subscribeRecentTrips` and `subscribeDraftTrips` need a `(status, date)` composite index — the same one added in Task 2 Step 5 covers status+date. Confirm direction: Task 2's index is `status ASC, date ASC`; these queries use `orderBy('date','desc')`. Firestore can serve a descending orderBy from an ascending index, but to be safe add a second index `status ASC, date DESC` to `firestore.indexes.json` and note it. The emulator auto-creates; production needs it.

- [ ] **Step 4: Run `npm run test:emulator` — confirm all PASS.**

- [ ] **Step 5: Add `status ASC, date DESC` index** to `firestore.indexes.json` (mirrors the recent/draft subscription order).

- [ ] **Step 6: Commit** `git add src/lib/data firestore.indexes.json && git -c commit.gpgsign=false commit -m "feat: add live Firestore subscriptions for items and trips"`

---

## Task 4: App shell — deps, design tokens, main wiring

**Files:** install deps; create `src/lib/ui/tokens.css`; modify `src/main.ts`.

- [ ] **Step 1: Install deps** `npm install svelte-spa-router lucide-svelte`

- [ ] **Step 2: Create `src/lib/ui/tokens.css`** — design tokens from the spec (accessibility-first sizes). Define CSS custom properties on `:root` and base resets:

```css
:root {
  /* color — one accent, one emphasis, one destructive, neutrals */
  --c-bg: #ffffff;
  --c-surface: #f6f5f3;
  --c-ink: #2b2a27;
  --c-ink-soft: #6b6a66;
  --c-accent: #2f6fa8;      /* primary action only */
  --c-accent-ink: #ffffff;
  --c-emphasis: #f0d978;    /* surfaced data: totals, deltas */
  --c-danger: #c2543a;      /* destructive only */
  /* type scale — body >=16, prices/qty >=20, hero 40-48 */
  --fs-label: 14px;
  --fs-body: 16px;
  --fs-price: 22px;
  --fs-hero: 44px;
  /* spacing + targets */
  --sp-screen: 16px;
  --tap-min: 44px;
  --btn-h: 54px;
  --stepper-h: 56px;
  --radius: 14px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: var(--fs-body);
  color: var(--c-ink);
  background: var(--c-bg);
  -webkit-tap-highlight-color: transparent;
}
button { font: inherit; }
```

- [ ] **Step 3: Wire tokens in `src/main.ts`** — ensure it imports the tokens before mounting:

```ts
import { mount } from 'svelte';
import './lib/ui/tokens.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });
export default app;
```

(Adjust to match the existing scaffold's mount style if it differs — keep whatever the scaffold generated, only ADD the tokens.css import and remove the demo `app.css` import if present.)

- [ ] **Step 4: Verify build** `npm run build` — confirm clean.

- [ ] **Step 5: Commit** `git add -A && git -c commit.gpgsign=false commit -m "chore: add routing + icon deps and design tokens"`

---

## Task 5: State — session (auth bootstrap) rune

**Files:** Create `src/lib/state/session.svelte.ts`.

- [ ] **Step 1: Implement** — a singleton rune that signs in and exposes uid + readiness:

```ts
import { ensureSignedIn } from '../data/auth';

let _uid = $state<string | null>(null);
let _ready = $state(false);
let _error = $state<unknown>(null);

export const session = {
  get uid() { return _uid; },
  get ready() { return _ready; },
  get error() { return _error; },
};

let started = false;
export async function startSession(): Promise<void> {
  if (started) return;
  started = true;
  try {
    _uid = await ensureSignedIn();
  } catch (e) {
    _error = e;
  } finally {
    _ready = true;
  }
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` (svelte-check covers .svelte.ts via `npm run check`). Run `npm run check`.

- [ ] **Step 3: Commit** `git add src/lib/state && git -c commit.gpgsign=false commit -m "feat: add session rune that bootstraps anonymous auth"`

---

## Task 6: State — library, trips, draft runes

**Files:** Create `src/lib/state/library.svelte.ts`, `trips.svelte.ts`, `draft.svelte.ts`.

These wrap the Plan 1/Task 3 subscriptions. Each exposes reactive `$state` and a `start(uid)` that opens the subscription (idempotent), used after `session.ready`.

- [ ] **Step 1: `library.svelte.ts`**

```ts
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
```

(Note: search filters the already-subscribed list in memory — no extra query. `searchItemsData` import is optional; prefer the in-memory `searchLibrary`. Remove the unused import if not needed.)

- [ ] **Step 2: `trips.svelte.ts`**

```ts
import { db } from '../data/firebase';
import { subscribeRecentTrips, subscribeDraftTrips } from '../data/trips';
import type { Trip } from '../domain/types';

let _recent = $state<Trip[]>([]);
let _drafts = $state<Trip[]>([]);
let unsubR: (() => void) | null = null;
let unsubD: (() => void) | null = null;

export const trips = {
  get recent() { return _recent; },
  get drafts() { return _drafts; },
};

export function startTrips(uid: string) {
  if (!unsubR) unsubR = subscribeRecentTrips(db, uid, (t) => { _recent = t; });
  if (!unsubD) unsubD = subscribeDraftTrips(db, uid, (t) => { _drafts = t; });
}
```

- [ ] **Step 3: `draft.svelte.ts`** — the active trip being logged. Holds the current trip id + live items + derived total.

```ts
import { db } from '../data/firebase';
import {
  createDraftTrip, addTripItem, subscribeTripItems, updateTripItem,
  removeTripItem, saveTrip, getTrip,
  type NewTripInput, type NewTripItemInput, type TripItemPatch,
} from '../data/trips';
import { tripTotal } from '../domain/calc';
import type { Trip, TripItem } from '../domain/types';

let _trip = $state<Trip | null>(null);
let _items = $state<TripItem[]>([]);
let unsub: (() => void) | null = null;

export const draft = {
  get trip() { return _trip; },
  get items() { return _items; },
  get total() { return tripTotal(_items); },
};

function watch(uid: string, tripId: string) {
  unsub?.();
  unsub = subscribeTripItems(db, uid, tripId, (i) => { _items = i; });
}

export async function startNewTrip(uid: string, input: NewTripInput): Promise<string> {
  _trip = await createDraftTrip(db, uid, input);
  _items = [];
  watch(uid, _trip.id);
  return _trip.id;
}

export async function resumeTrip(uid: string, tripId: string): Promise<void> {
  _trip = await getTrip(db, uid, tripId);
  if (!_trip) throw new Error('Draft not found');
  watch(uid, tripId);
}

export async function addToDraft(uid: string, input: NewTripItemInput): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await addTripItem(db, uid, _trip.id, input);
}

export async function editDraftItem(uid: string, tripItemId: string, patch: TripItemPatch): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await updateTripItem(db, uid, _trip.id, tripItemId, patch);
}

export async function removeDraftItem(uid: string, tripItemId: string): Promise<void> {
  if (!_trip) throw new Error('No active trip');
  await removeTripItem(db, uid, _trip.id, tripItemId);
}

export async function commitDraft(uid: string): Promise<string> {
  if (!_trip) throw new Error('No active trip');
  const saved = await saveTrip(db, uid, _trip.id);
  const id = saved.id;
  unsub?.(); unsub = null; _trip = null; _items = [];
  return id;
}
```

- [ ] **Step 4: Verify** `npm run check`.

- [ ] **Step 5: Commit** `git add src/lib/state && git -c commit.gpgsign=false commit -m "feat: add library, trips, and draft state runes"`

---

## Task 7: UI primitives — TabBar, AppButton, Stepper, ConfirmDialog, categoryIcon

**Files:** Create the five files under `src/lib/ui/`.

- [ ] **Step 1: `categoryIcon.ts`** — map Category to a Lucide icon component:

```ts
import { Beef, Carrot, Soup, Wheat, ShoppingBasket } from 'lucide-svelte';
import type { Category } from '../domain/types';

export function categoryIcon(c: Category) {
  switch (c) {
    case 'karne': return Beef;
    case 'gulay': return Carrot;
    case 'condiments': return Soup;
    case 'bigas': return Wheat;
    default: return ShoppingBasket;
  }
}
```

- [ ] **Step 2: `AppButton.svelte`** — full-width, >=54pt, primary/ghost variants:

```svelte
<script lang="ts">
  let { variant = 'primary', onclick, children, disabled = false } =
    $props<{ variant?: 'primary' | 'ghost' | 'danger'; onclick?: () => void; children: any; disabled?: boolean }>();
</script>

<button class="btn {variant}" {disabled} onclick={onclick}>{@render children()}</button>

<style>
  .btn { width: 100%; min-height: var(--btn-h); border: none; border-radius: var(--radius);
    font-size: var(--fs-price); font-weight: 700; cursor: pointer; }
  .primary { background: var(--c-accent); color: var(--c-accent-ink); }
  .ghost { background: transparent; color: var(--c-ink); border: 2px solid var(--c-ink); }
  .danger { background: var(--c-danger); color: #fff; }
  .btn:disabled { opacity: .5; }
</style>
```

- [ ] **Step 3: `Stepper.svelte`** — big +/- around a bound value (>=56pt targets):

```svelte
<script lang="ts">
  let { value = $bindable(1), step = 1, min = 0 } = $props<{ value?: number; step?: number; min?: number }>();
  const dec = () => { value = Math.max(min, +(value - step).toFixed(2)); };
  const inc = () => { value = +(value + step).toFixed(2); };
</script>

<div class="stepper">
  <button onclick={dec} aria-label="Bawasan">−</button>
  <span class="val">{value}</span>
  <button onclick={inc} aria-label="Dagdagan">＋</button>
</div>

<style>
  .stepper { display: flex; align-items: center; gap: 18px; justify-content: center; }
  button { width: var(--stepper-h); height: var(--stepper-h); border-radius: 50%;
    border: 2px solid var(--c-ink); background: var(--c-surface); font-size: 28px; }
  .val { font-size: var(--fs-hero); min-width: 80px; text-align: center; }
</style>
```

- [ ] **Step 4: `ConfirmDialog.svelte`** — the single confirmation dialog (Filipino copy):

```svelte
<script lang="ts">
  let { title, message, confirmLabel, onConfirm, onCancel } =
    $props<{ title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }>();
</script>

<div class="scrim" onclick={onCancel} role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <h2>{title}</h2>
    <p>{message}</p>
    <button class="confirm" onclick={onConfirm}>{confirmLabel}</button>
    <button class="cancel" onclick={onCancel}>Huwag na</button>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(43,42,39,.35);
    display: flex; align-items: center; justify-content: center; padding: 22px; z-index: 100; }
  .dialog { background: var(--c-bg); border-radius: var(--radius); padding: 20px; width: 100%; max-width: 360px; }
  h2 { font-size: 19px; margin: 0 0 8px; }
  p { color: var(--c-ink-soft); margin: 0 0 16px; }
  button { width: 100%; min-height: var(--btn-h); border-radius: var(--radius); border: none;
    font-size: var(--fs-body); font-weight: 700; margin-top: 8px; }
  .confirm { background: var(--c-danger); color: #fff; }
  .cancel { background: transparent; border: 2px solid var(--c-ink); }
</style>
```

- [ ] **Step 5: `TabBar.svelte`** — persistent bottom nav with Lucide icons and Filipino labels, using svelte-spa-router's `link`/active state:

```svelte
<script lang="ts">
  import { location, push } from 'svelte-spa-router';
  import { House, ListChecks, Tag, ChartColumn } from 'lucide-svelte';
  const tabs = [
    { path: '/', label: 'Home', icon: House },
    { path: '/biyahe', label: 'Biyahe', icon: ListChecks },
    { path: '/items', label: 'Items', icon: Tag },
    { path: '/gastos', label: 'Gastos', icon: ChartColumn },
  ];
  const isActive = (p: string) => (p === '/' ? $location === '/' : $location.startsWith(p));
</script>

<nav class="tabbar">
  {#each tabs as t}
    <button class="tab" class:on={isActive(t.path)} onclick={() => push(t.path)}>
      <t.icon size={24} />
      <span>{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex;
    border-top: 1px solid var(--c-surface); background: var(--c-bg); }
  .tab { flex: 1; min-height: 60px; background: none; border: none; display: flex;
    flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    color: var(--c-ink-soft); font-size: 12px; }
  .tab.on { color: var(--c-accent); }
</style>
```

- [ ] **Step 6: Verify** `npm run check` and `npm run build`.

- [ ] **Step 7: Commit** `git add src/lib/ui && git -c commit.gpgsign=false commit -m "feat: add UI primitives (TabBar, AppButton, Stepper, ConfirmDialog, categoryIcon)"`

---

## Task 8: App shell — Router + auth gate

**Files:** Replace `src/App.svelte`. Create placeholder route components so routing compiles (`src/routes/Biyahe.svelte`, `src/routes/Items.svelte`, `src/routes/Gastos.svelte` as minimal stubs; Home/LogTrip/TripSummary built in later tasks — stub them too for now and fill in).

- [ ] **Step 1: Create minimal stubs** for all routes so the router resolves. Each stub e.g. `src/routes/Gastos.svelte`:

```svelte
<script lang="ts"></script>
<section class="screen"><h1>Gastos</h1><p>Plan 3.</p></section>
<style>.screen{padding:var(--sp-screen);padding-bottom:80px;}</style>
```

Make stubs for: `Home.svelte`, `Biyahe.svelte`, `Items.svelte`, `Gastos.svelte`, `LogTrip.svelte`, `TripSummary.svelte` (Home/LogTrip/TripSummary will be replaced in Tasks 9–11).

- [ ] **Step 2: Replace `src/App.svelte`** with the router + auth gate + persistent tab bar:

```svelte
<script lang="ts">
  import Router from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { session, startSession } from './lib/state/session.svelte';
  import { startLibrary } from './lib/state/library.svelte';
  import { startTrips } from './lib/state/trips.svelte';
  import TabBar from './lib/ui/TabBar.svelte';
  import Home from './routes/Home.svelte';
  import Biyahe from './routes/Biyahe.svelte';
  import Items from './routes/Items.svelte';
  import Gastos from './routes/Gastos.svelte';
  import LogTrip from './routes/LogTrip.svelte';
  import TripSummary from './routes/TripSummary.svelte';

  const routes = {
    '/': Home,
    '/biyahe': Biyahe,
    '/items': Items,
    '/gastos': Gastos,
    '/log/:tripId': LogTrip,
    '/trip/:tripId': TripSummary,
  };

  onMount(async () => {
    await startSession();
    if (session.uid) { startLibrary(session.uid); startTrips(session.uid); }
  });

  // hide the tab bar on the focused logging flow (full-screen stepper)
  import { location } from 'svelte-spa-router';
  const showTabs = $derived(!$location.startsWith('/log/'));
</script>

{#if !session.ready}
  <div class="boot">Naglo-load…</div>
{:else if session.error}
  <div class="boot">May problema sa pag-load. Subukan ulit.</div>
{:else}
  <main><Router {routes} /></main>
  {#if showTabs}<TabBar />{/if}
{/if}

<style>
  .boot { display: flex; height: 100%; align-items: center; justify-content: center; color: var(--c-ink-soft); }
  main { min-height: 100%; }
</style>
```

- [ ] **Step 3: Verify** `npm run check` and `npm run build`. Then `npm run dev` and confirm the app boots, signs in anonymously, shows Home stub + tab bar, and tab navigation works. (Manual: requires a real `.env` with Firebase config OR `VITE_USE_EMULATOR=true` + a running emulator. Create `.env` from `.env.example` with `VITE_USE_EMULATOR=true` for local dev, and run `npx firebase emulators:start --only auth,firestore` in another terminal.)

- [ ] **Step 4: Commit** `git add -A && git -c commit.gpgsign=false commit -m "feat: app shell with hash router, auth gate, and tab bar"`

---

## Task 9: Home screen

**Files:** Replace `src/routes/Home.svelte`. Uses `trips` (recent + drafts) and `monthlyTotal`.

Acceptance (from spec Home — A layout, dominant start control):
- Greeting row ("Kumusta, Aling Rosa").
- Large monthly-spend card: `monthlyTotal` for the current month, hero size (`--fs-hero`), with `₱` and a vs-last-month delta chip (`monthDelta(thisMonth, lastMonth)`) using `monthlyTotal` for the previous month.
- If a draft trip exists: a prominent "Ipagpatuloy — {name}" resume row that routes to `/log/{id}`.
- "Mga huling biyahe" list from `trips.recent` (name, itemCount, storeName, total) — each routes to `/trip/{id}`.
- A dominant, full-width primary "＋ Bagong biyahe" control pinned above the tab bar that creates a draft and routes to `/log/{id}`.

- [ ] **Step 1: Implement `Home.svelte`:**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { trips } from '../lib/state/trips.svelte';
  import { session } from '../lib/state/session.svelte';
  import { startNewTrip } from '../lib/state/draft.svelte';
  import { monthlyTotal } from '../lib/data/trips';
  import { db } from '../lib/data/firebase';
  import { monthDelta } from '../lib/domain/calc';
  import AppButton from '../lib/ui/AppButton.svelte';

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;

  let thisMonth = $state(0), lastMonth = $state(0);
  $effect(() => {
    const uid = session.uid; if (!uid) return;
    monthlyTotal(db, uid, y, m).then((v) => (thisMonth = v));
    monthlyTotal(db, uid, prevY, prevM).then((v) => (lastMonth = v));
  });
  const delta = $derived(monthDelta(thisMonth, lastMonth));
  const peso = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH');

  async function newTrip() {
    const uid = session.uid!; 
    const today = new Date().toISOString().slice(0, 10);
    const id = await startNewTrip(uid, { name: 'Biyahe', storeName: '', date: today });
    push(`/log/${id}`);
  }
</script>

<section class="screen">
  <div class="greet">Kumusta, Aling Rosa 👋</div>

  <div class="spend">
    <div class="lbl">Gastos ngayong buwan</div>
    <div class="hero">{peso(thisMonth)}</div>
    {#if lastMonth > 0}
      <span class="chip">{delta >= 0 ? '▲' : '▼'} {peso(Math.abs(delta))} vs nakaraan</span>
    {/if}
  </div>

  {#if trips.drafts.length}
    <button class="resume" onclick={() => push(`/log/${trips.drafts[0].id}`)}>
      Ipagpatuloy — {trips.drafts[0].name} ›
    </button>
  {/if}

  <div class="lbl">Mga huling biyahe</div>
  <div class="list">
    {#each trips.recent as t}
      <button class="row" onclick={() => push(`/trip/${t.id}`)}>
        <div><div class="name">{t.name}</div><div class="sub">{t.itemCount} items · {t.storeName}</div></div>
        <div class="price">{peso(t.total)}</div>
      </button>
    {/each}
  </div>

  <div class="cta"><AppButton onclick={newTrip}>＋ Bagong biyahe</AppButton></div>
</section>

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 140px; }
  .greet { font-size: 19px; font-weight: 700; margin-bottom: 12px; }
  .spend { background: var(--c-surface); border-radius: var(--radius); padding: 16px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); margin: 16px 0 6px; }
  .spend .lbl { margin: 0; }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chip { display: inline-block; background: var(--c-emphasis); border-radius: 999px; padding: 4px 10px; font-size: 13px; font-weight: 700; }
  .resume { width: 100%; text-align: left; margin-top: 14px; padding: 12px 14px; border-radius: var(--radius);
    border: 2px solid var(--c-ink); background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .list { display: flex; flex-direction: column; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px;
    background: none; border: none; border-bottom: 1px solid var(--c-surface); text-align: left; }
  .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .cta { position: fixed; left: var(--sp-screen); right: var(--sp-screen); bottom: 72px; }
</style>
```

(The greeting still shows an emoji 👋 — REPLACE with a Lucide `Hand` icon or remove it to honor the no-emoji rule. Use `import { Hand } from 'lucide-svelte'` and `<Hand size={20} />`.)

- [ ] **Step 2: Verify** `npm run check`, `npm run build`. Manual: with emulator + a saved trip, Home shows the total and recent list; "Bagong biyahe" creates a draft and routes to `/log/:id`.

- [ ] **Step 3: Commit** `git add src/routes/Home.svelte && git -c commit.gpgsign=false commit -m "feat: Home screen with monthly spend, recents, resume, and start-trip"`

---

## Task 10: Item Picker (recognition tiles + search) and Log stepper

**Files:** Replace `src/routes/ItemPicker.svelte` (create) and `src/routes/LogTrip.svelte`.

### ItemPicker — recognition-first (spec Library: C tiles primary, A search fallback)

A reusable component (not a routed screen) that lets her pick an item with zero typing when possible. Props: `onPick(item: Item | { isNew: true; name: string })`.

- [ ] **Step 1: Implement `ItemPicker.svelte`:**

```svelte
<script lang="ts">
  import { library, searchLibrary } from '../lib/state/library.svelte';
  import { categoryIcon } from '../lib/ui/categoryIcon';
  import { Search } from 'lucide-svelte';
  import type { Item } from '../lib/domain/types';

  let { onPick } = $props<{ onPick: (r: Item | { isNew: true; name: string }) => void }>();
  let q = $state('');
  // Tiles: frequently bought (by purchaseCount) when not searching; results when searching.
  const tiles = $derived(
    q.trim()
      ? searchLibrary(q)
      : [...library.items].sort((a, b) => b.purchaseCount - a.purchaseCount).slice(0, 8),
  );
  const peso = (n: number | null) => (n == null ? '' : '₱' + Math.round(n));
</script>

<div class="picker">
  <div class="search">
    <Search size={18} />
    <input placeholder="Hanapin o pumili…" bind:value={q} />
  </div>

  <div class="grid">
    {#each tiles as it (it.id)}
      {@const Icon = categoryIcon(it.category)}
      <button class="tile" onclick={() => onPick(it)}>
        <Icon size={26} />
        <div class="t-name">{it.canonicalName}</div>
        <div class="t-price">{peso(it.lastPrice)}{it.lastPriceUnit ? '/' + it.lastPriceUnit : ''}</div>
      </button>
    {/each}
  </div>

  {#if q.trim() && !tiles.some((t) => t.nameLower === q.trim().toLowerCase())}
    <button class="newitem" onclick={() => onPick({ isNew: true, name: q.trim() })}>
      ＋ Bagong item: "{q.trim()}"
    </button>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 12px; }
  .search { display: flex; align-items: center; gap: 8px; border: 2px solid var(--c-ink);
    border-radius: var(--radius); padding: 10px 12px; }
  .search input { border: none; outline: none; flex: 1; font-size: var(--fs-body); background: none; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tile { display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
    background: var(--c-surface); border: none; border-radius: var(--radius); padding: 12px; min-height: 84px; }
  .t-name { font-weight: 700; } .t-price { color: var(--c-accent); font-weight: 700; }
  .newitem { background: none; border: 2px dashed var(--c-ink); border-radius: var(--radius);
    padding: 12px; font-weight: 700; font-size: var(--fs-body); }
</style>
```

### LogTrip — one-thing-at-a-time stepper (spec Log: C default)

Full-screen, three steps: 1 Item (ItemPicker) → 2 Dami (Stepper + unit chips) → 3 Presyo (price entry). Running total visible. On save-item, append to draft and return to step 1 for the next item. "Tapos" finishes → routes to `/trip/:id`. New items are created on the fly via `createItem` with the item's default category prompt deferred (default 'iba_pa', editable later).

- [ ] **Step 2: Implement `LogTrip.svelte`:**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { draft, resumeTrip, addToDraft, commitDraft } from '../lib/state/draft.svelte';
  import { createItem } from '../lib/data/items';
  import { db } from '../lib/data/firebase';
  import ItemPicker from './ItemPicker.svelte';
  import Stepper from '../lib/ui/Stepper.svelte';
  import AppButton from '../lib/ui/AppButton.svelte';
  import { X } from 'lucide-svelte';
  import type { Item, Unit } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;

  // Ensure the draft store points at this trip (e.g. on resume/deeplink).
  $effect(() => {
    if (draft.trip?.id !== params.tripId) resumeTrip(uid, params.tripId);
  });

  let step = $state<1 | 2 | 3>(1);
  let picked = $state<Item | null>(null);
  let pickedLabel = $state('');
  let qty = $state(1);
  let unit = $state<Unit>('kg');
  let price = $state<number | null>(null);
  const units: Unit[] = ['kg', 'g', 'pcs', 'pack', 'dosena', 'ml'];
  const peso = (n: number) => '₱' + Math.round(n);

  async function onPick(r: Item | { isNew: true; name: string }) {
    if ('isNew' in r) {
      const created = await createItem(db, uid, { canonicalName: r.name, category: 'iba_pa', defaultUnit: 'pcs' });
      picked = created; pickedLabel = created.canonicalName; unit = created.defaultUnit;
    } else {
      picked = r; pickedLabel = r.canonicalName; unit = r.defaultUnit;
      if (r.lastPrice != null) price = r.lastPrice;
    }
    step = 2;
  }

  async function saveItem() {
    await addToDraft(uid, {
      itemId: picked!.id, label: pickedLabel, quantity: qty, unit, pricePaid: price, vendor: null,
    });
    // reset for the next item
    picked = null; pickedLabel = ''; qty = 1; price = null; step = 1;
  }

  async function finish() {
    const id = await commitDraft(uid);
    push(`/trip/${id}`);
  }
</script>

<section class="flow">
  <header>
    <button class="x" onclick={finish} aria-label="Tapos"><X size={24} /></button>
    <div class="steps">
      <span class:on={step === 1}>1 Item</span>
      <span class:on={step === 2}>2 Dami</span>
      <span class:on={step === 3}>3 Presyo</span>
    </div>
    <div class="total">{peso(draft.total)}</div>
  </header>

  {#if step === 1}
    <h1>Anong idadagdag?</h1>
    <ItemPicker {onPick} />
  {:else if step === 2}
    <h1>Ilang <u>{pickedLabel}</u>?</h1>
    <Stepper bind:value={qty} />
    <div class="chips">
      {#each units as u}
        <button class="chip" class:on={unit === u} onclick={() => (unit = u)}>{u}</button>
      {/each}
    </div>
    <div class="spacer"></div>
    <AppButton onclick={() => (step = 3)}>Susunod ›</AppButton>
  {:else}
    <h1>Magkano ang {pickedLabel}?</h1>
    <input class="price" type="number" inputmode="decimal" placeholder="₱" bind:value={price} />
    <div class="spacer"></div>
    <AppButton onclick={saveItem}>I-save ang item</AppButton>
  {/if}
</section>

<style>
  .flow { display: flex; flex-direction: column; min-height: 100vh; padding: var(--sp-screen); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .x { background: none; border: none; }
  .steps { display: flex; gap: 6px; }
  .steps span { font-size: 12px; color: var(--c-ink-soft); }
  .steps .on { color: var(--c-accent); font-weight: 700; }
  .total { font-size: var(--fs-price); font-weight: 800; }
  h1 { font-size: 26px; margin: 18px 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .chip { border: 2px solid var(--c-ink); border-radius: 999px; padding: 8px 14px; background: var(--c-bg); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .price { font-size: var(--fs-hero); text-align: center; width: 100%; border: none;
    border-bottom: 3px solid var(--c-ink); outline: none; }
  .spacer { flex: 1; }
</style>
```

- [ ] **Step 3: Verify** `npm run check`, `npm run build`. Manual (emulator): start a trip from Home → pick a tile (or create new) → set dami + unit → enter presyo → save → total updates and flow resets → repeat → Tapos routes to summary.

- [ ] **Step 4: Commit** `git add src/routes/ItemPicker.svelte src/routes/LogTrip.svelte && git -c commit.gpgsign=false commit -m "feat: item picker tiles and one-thing-at-a-time log stepper"`

---

## Task 11: Trip Summary + the single delete confirmation

**Files:** Replace `src/routes/TripSummary.svelte`. Reuse `subscribeTripItems` + `getTrip` + `editDraftItem`-style updates via data layer; use `ConfirmDialog` for delete-trip.

Acceptance (spec Summary A): total card (hero), date + item-count + store chips, itemized rows (label, qty × unit price, line total), tap row → inline edit (no confirmation), trash button → the ONE ConfirmDialog ("Burahin ang biyahe? / Hindi na ito maibabalik." / "Oo, burahin" / "Huwag na").

- [ ] **Step 1: Implement `TripSummary.svelte`:**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { getTrip, subscribeTripItems, updateTripItem, removeTripItem, deleteTrip } from '../lib/data/trips';
  import { tripTotal } from '../lib/domain/calc';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import { Trash2 } from 'lucide-svelte';
  import type { Trip, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;
  let trip = $state<Trip | null>(null);
  let items = $state<TripItem[]>([]);
  let editing = $state<string | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    getTrip(db, uid, params.tripId).then((t) => (trip = t));
    const unsub = subscribeTripItems(db, uid, params.tripId, (i) => (items = i));
    return () => unsub();
  });

  const total = $derived(tripTotal(items));
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  async function saveEdit(ti: TripItem, quantity: number | null, pricePaid: number | null) {
    await updateTripItem(db, uid, params.tripId, ti.id, { quantity, pricePaid });
    editing = null;
  }
  async function doDelete() {
    await deleteTrip(db, uid, params.tripId);
    push('/');
  }
</script>

<section class="screen">
  <div class="card">
    <div class="lbl">Kabuuang gastos · {trip?.date ?? ''}</div>
    <div class="hero">{peso(total)}</div>
    <div class="chips"><span>{items.length} items</span>{#if trip?.storeName}<span>{trip.storeName}</span>{/if}</div>
  </div>

  <div class="list">
    {#each items as ti (ti.id)}
      {#if editing === ti.id}
        <div class="edit">
          <span class="name">{ti.label}</span>
          <input type="number" inputmode="decimal" value={ti.quantity} id="q-{ti.id}" />
          <input type="number" inputmode="decimal" value={ti.pricePaid} id="p-{ti.id}" />
          <button onclick={() => saveEdit(ti,
            Number((document.getElementById('q-' + ti.id) as HTMLInputElement).value),
            Number((document.getElementById('p-' + ti.id) as HTMLInputElement).value))}>Tapos</button>
        </div>
      {:else}
        <button class="row" onclick={() => (editing = ti.id)}>
          <div><div class="name">{ti.label}</div>
            <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePerUnit)}</div></div>
          <div class="price">{peso(ti.pricePaid)}</div>
        </button>
      {/if}
    {/each}
  </div>

  <button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={20} /> Burahin ang biyahe</button>
</section>

{#if confirmDelete}
  <ConfirmDialog title="Burahin ang biyahe?" message="Hindi na ito maibabalik."
    confirmLabel="Oo, burahin" onConfirm={doDelete} onCancel={() => (confirmDelete = false)} />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chips { display: flex; gap: 8px; margin-top: 6px; }
  .chips span { background: var(--c-bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .list { margin-top: 10px; }
  .row, .edit { display: flex; justify-content: space-between; align-items: center; gap: 8px;
    width: 100%; padding: 11px 4px; border: none; border-bottom: 1px solid var(--c-surface); background: none; text-align: left; }
  .edit input { width: 70px; font-size: var(--fs-body); }
  .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .trash { margin-top: 20px; background: none; border: 2px solid var(--c-danger); color: var(--c-danger);
    border-radius: var(--radius); padding: 12px; width: 100%; font-weight: 700; display: flex;
    align-items: center; justify-content: center; gap: 8px; }
</style>
```

- [ ] **Step 2: Verify** `npm run check`, `npm run build`. Manual (emulator): open a saved trip → tap a row → edit qty/price inline (total updates, no confirmation) → trash → the one ConfirmDialog appears → confirm deletes and routes Home.

- [ ] **Step 3: Commit** `git add src/routes/TripSummary.svelte && git -c commit.gpgsign=false commit -m "feat: trip summary with inline edit and the single delete confirmation"`

---

## Task 12: Full sweep

- [ ] **Step 1:** `npm test` — unit tests green.
- [ ] **Step 2:** kill java, `npm run test:emulator` — all data-layer tests green.
- [ ] **Step 3:** `npm run check` — no svelte-check/type errors.
- [ ] **Step 4:** `npm run build` — clean.
- [ ] **Step 5:** Manual smoke against the emulator: full loop Home → start trip → log 3 items → Tapos → summary → edit one → back Home shows updated monthly total and recent trip. Confirm NO emoji render anywhere (greeting uses Lucide), Filipino labels throughout, tab bar hidden during `/log/`.
- [ ] **Step 6:** Commit any incidental fixes.

---

## Notes / carry-forward to Plan 3 (Insights)

- Price History screen (giant last-price + sparkline + receipts) uses Plan 1's `priceHistory`.
- Monthly Gastos screen (this-vs-last, category proportion bars) uses `monthlyTotal` + category grouping over tripItems — may need a small category-rollup data-layer fn.
- `Biyahe` and `Items` tab screens are still stubs after Plan 2 — full versions (all-trips list, full item library management) are Plan 3 or a Plan 2.5.
- New-item creation in LogTrip defaults category to `iba_pa`; a later task should let her set/correct category (affects analytics accuracy).
- Consider extracting the inline-edit `document.getElementById` pattern in TripSummary into bound state if it proves fragile.
```
