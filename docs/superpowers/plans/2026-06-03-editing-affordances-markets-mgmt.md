# Editing, Affordances & Markets Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trips always-editable with one merged Trip screen (add/edit/remove lines, icon buttons, full line editing via AddItem), derive item denorm from history, add a Settings-based default market with sticky/market-aware behaviour, and add Markets + Settings management under a new "Iba pa" tab — with full Items CRUD.

**Architecture:** Continues the app (Svelte 5 runes + svelte-spa-router@5 + Firestore behind `src/lib/data/`). Drops the save-lock: item `last*`/`purchaseCount` become **derived** via `recomputeItem`; trip totals via `recomputeTrip`, both called after every line mutation. `/log` and `draft.svelte.ts` are retired — one `/trip/:id` screen loads by id and mutates the data layer directly.

**Tech Stack:** Svelte 5, TypeScript, Firebase v12, lucide-svelte, Vitest + Firestore emulator, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-06-03-editing-affordances-markets-mgmt-design.md`.

## Conventions

- Filipino-first, no emoji (lucide icons). Offline-first; no write spinners. Only delete-trip and delete-item/market confirm.
- Type gate: `npm run check` (bare `tsc` checks nothing here). A lone `subscribeTripItems` timeout that passes on isolated re-run is the known flake.
- **Emulator shutdown is NOT automatic** — the JVM lingers after `firebase emulators:exec`. So **kill java BEFORE *and* AFTER every `npm run test:emulator`**, non-interactively (no prompt):
  `powershell -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"`
  Use exactly this form (`-Force` + `-ErrorAction SilentlyContinue`) — it never asks for confirmation. Do the post-run kill even when tests pass, so the emulator never stays up or blocks the next run's port 8080.

## File Structure

```
src/lib/domain/types.ts        TripItem gains tripId; Trip gains defaultMarketName; UserSettings type
src/lib/data/paths.ts          userDoc already exists (verify)
src/lib/data/trips.ts          recomputeItem, recomputeTrip; saveTrip (no guard/increment); add/update/remove call recompute; addTripItem writes tripId; groupByMarket pure helper; setTripMarket
src/lib/data/items.ts          deleteItem; updateItemMeta(+canonicalName)
src/lib/data/markets.ts        updateMarket, deleteMarket
src/lib/data/settings.ts       NEW getUserSettings/subscribeUserSettings/setDefaultMarket
src/lib/state/settings.svelte.ts   NEW reactive user settings
src/lib/state/draft.svelte.ts      DELETED (retired)
src/lib/ui/IconButton.svelte       NEW edit/remove icon button
src/routes/AddItem.svelte          edit-mode + market-change callback + market-aware prefill
src/routes/Trip.svelte             NEW the one trip screen (replaces TripSummary + LogTrip)
src/routes/TripSummary.svelte      DELETED
src/routes/LogTrip.svelte          DELETED
src/routes/Items.svelte            full CRUD (add/edit incl rename/remove, icon buttons)
src/routes/More.svelte             NEW menu page
src/routes/Markets.svelte          NEW markets management
src/routes/Settings.svelte         NEW default-market setting
src/lib/ui/TabBar.svelte           add "Iba pa" tab
src/App.svelte                     routes: /trip/:id, /more, /markets, /settings; remove /log; start settings
src/routes/Home.svelte             Bagong biyahe → createDraftTrip(seed market) → /trip/:id
src/routes/Biyahe.svelte           rows → /trip/:id (drafts and saved)
```

---

## Task 1: Data layer — derived recompute + always-editable trips (emulator TDD)

**Files:** Modify `src/lib/domain/types.ts`, `src/lib/data/trips.ts`, `src/lib/data/trips.emulator.test.ts`.

- [ ] **Step 1: Types.** In `types.ts`: add `tripId: string;` to `TripItem` (denormalized, so we can count distinct trips). Add `defaultMarketName: string | null;` to `Trip`. Add:
```ts
export interface UserSettings {
  defaultMarketId: string | null;
  defaultMarketName: string | null;
}
```

- [ ] **Step 2: Failing tests** — append to `trips.emulator.test.ts`:
```ts
import { recomputeItem, recomputeTrip, groupByMarket } from './trips';

describe('always-editable recompute', () => {
  it('recomputeItem derives last* + purchaseCount from history (distinct trips)', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t1 = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-01' });
    await addTripItem(ctx.db, ctx.uid, t1.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', date: '2026-06-02' });
    await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm2', marketName: 'SM', variant: null, category: 'karne' });
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(2);              // two distinct trips
    expect(updated?.lastPricePerBaseUnit).toBe(320);     // newest
    expect(updated?.lastMarketName).toBe('SM');
  });

  it('removing the newest line recomputes back to the prior line', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-01' });
    const a = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    const t2 = await createDraftTrip(ctx.db, ctx.uid, { name: 'B', date: '2026-06-02' });
    const b = await addTripItem(ctx.db, ctx.uid, t2.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 320, marketId: 'm2', marketName: 'SM', variant: null, category: 'karne' });
    await removeTripItem(ctx.db, ctx.uid, t2.id, b.id);
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(updated?.purchaseCount).toBe(1);
    expect(updated?.lastPricePerBaseUnit).toBe(300);
  });

  it('editing a saved trip recomputes its total and never double-counts purchaseCount', async () => {
    const item = await createItem(ctx.db, ctx.uid, { canonicalName: 'Liempo', category: 'karne', form: 'timbang', defaultUnit: 'kg' });
    const t = await createDraftTrip(ctx.db, ctx.uid, { name: 'A', date: '2026-06-01' });
    const a = await addTripItem(ctx.db, ctx.uid, t.id, { itemId: item.id, label: 'Liempo', quantity: 1, unit: 'kg', pricePaid: 300, marketId: 'm1', marketName: 'Palengke', variant: null, category: 'karne' });
    await saveTrip(ctx.db, ctx.uid, t.id);
    await updateTripItem(ctx.db, ctx.uid, t.id, a.id, { pricePaid: 350 });
    const trip = await getTrip(ctx.db, ctx.uid, t.id);
    const updated = await getItem(ctx.db, ctx.uid, item.id);
    expect(trip?.total).toBe(350);
    expect(updated?.purchaseCount).toBe(1); // still one trip; no double-count
  });

  it('groupByMarket keys by marketId, not name (same-named markets stay separate)', async () => {
    const a = { marketId: 'm1', marketName: 'Palengke', pricePaid: 10 } as any;
    const b = { marketId: 'm2', marketName: 'Palengke', pricePaid: 20 } as any;
    const groups = groupByMarket([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.subtotal)).toEqual([10, 20]);
  });
});
```

- [ ] **Step 3: Run `npm run test:emulator` — FAIL** (recompute*/groupByMarket missing; tripId not written).

- [ ] **Step 4: Implement.** In `trips.ts`:
  - Add `tripId` to the object built in `addTripItem` (`tripId: tripId,` — the function already has `tripId` as the resolved trip date variable name? NO: rename. The current code does `const tripDate = (...).date;`. Add `tripId` = the passed `tripId` param: set `tripId,` in the TripItem.)
  - `priceHistory` unchanged (returns TripItem[] which now include tripId).
  - Add the pure helper:
```ts
export interface MarketGroup { marketId: string | null; marketName: string | null; items: TripItem[]; subtotal: number; }
export function groupByMarket(items: TripItem[]): MarketGroup[] {
  const map = new Map<string, MarketGroup>();
  for (const ti of items) {
    const key = ti.marketId ?? '__none__';
    let g = map.get(key);
    if (!g) { g = { marketId: ti.marketId, marketName: ti.marketName, items: [], subtotal: 0 }; map.set(key, g); }
    g.items.push(ti);
    g.subtotal += ti.pricePaid ?? 0;
  }
  return [...map.values()];
}
```
  - Add recompute functions:
```ts
export async function recomputeTrip(db: Firestore, uid: string, tripId: string): Promise<void> {
  const ref = tripDoc(db, uid, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const items = await getTripItems(db, uid, tripId);
  const total = tripTotal(items);
  const itemCount = items.length;
  const marketNames = [...new Set(items.map((i) => i.marketName).filter((n): n is string => !!n))];
  await setDoc(ref, { ...(snap.data() as Trip), total, itemCount, marketNames });
}

export async function recomputeItem(db: Firestore, uid: string, itemId: string): Promise<void> {
  const history = await priceHistory(db, uid, itemId); // newest first
  const ref = itemDoc(db, uid, itemId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const newest = history[0] ?? null;
  const distinctTrips = new Set(history.map((h) => h.tripId)).size;
  await setDoc(ref, {
    ...(snap.data() as Item),
    lastPricePerBaseUnit: newest?.pricePerBaseUnit ?? null,
    lastUnit: newest?.unit ?? null,
    lastBaseUnit: newest?.baseUnit ?? null,
    lastPriceDate: newest?.tripDate ?? null,
    lastMarketId: newest?.marketId ?? null,
    lastMarketName: newest?.marketName ?? null,
    lastVariant: newest?.variant ?? null,
    purchaseCount: distinctTrips,
  });
}
```
  (Add `Item` to the type import in trips.ts.)
  - `addTripItem`: after `setDoc(ref, tripItem)`, add `await recomputeTrip(db, uid, tripId); await recomputeItem(db, uid, input.itemId);` and `return tripItem;`.
  - `updateTripItem`: after the `setDoc`, `await recomputeTrip(db, uid, tripId); await recomputeItem(db, uid, next.itemId);`.
  - `removeTripItem`: capture the line's `itemId` before deleting (read the doc), delete, then `await recomputeTrip(db, uid, tripId); await recomputeItem(db, uid, itemId);`.
  - `saveTrip`: REMOVE the `if (trip.status !== 'draft') throw` guard and the entire `latestByItem` fan-out loop. New body: read trip, set `status: 'saved'` + recomputed total/itemCount/marketNames (call the same logic as recomputeTrip inline or call recomputeTrip then set status), return the saved trip. Simplest:
```ts
export async function saveTrip(db: Firestore, uid: string, tripId: string): Promise<Trip> {
  await recomputeTrip(db, uid, tripId);
  const ref = tripDoc(db, uid, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Trip ${tripId} not found`);
  const trip = { ...(snap.data() as Trip), status: 'saved' as const };
  await setDoc(ref, trip);
  return trip;
}
```
  - `createDraftTrip`: `NewTripInput` add `defaultMarketName?: string | null;`; set `defaultMarketName: input.defaultMarketName ?? null` and keep `defaultMarketId`. Also init `marketNames: []` (already) and `defaultMarketName`.
  - Add `setTripMarket`:
```ts
export async function setTripMarket(db: Firestore, uid: string, tripId: string, marketId: string | null, marketName: string | null): Promise<void> {
  const ref = tripDoc(db, uid, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await setDoc(ref, { ...(snap.data() as Trip), defaultMarketId: marketId, defaultMarketName: marketName });
}
```

- [ ] **Step 5: Update existing emulator tests** that asserted the old fan-out: the test "refuses to re-save an already-saved trip" must be DELETED (re-save is now allowed). The "updates the parent item last context fields and bumps purchaseCount" and "counts the same item on multiple lines… latest line wins" tests still pass IF re-expressed against recompute (purchaseCount = distinct trips). Update them: a single trip with one item → purchaseCount 1; two lines same item same trip → still purchaseCount 1 (distinct trips = 1), newest line wins for last*. Adjust assertions accordingly. Add `tripId`/`marketId` fields already present.

- [ ] **Step 6: kill java, `npm run test:emulator` — all PASS.**

- [ ] **Step 7: Commit** `git add src/lib/domain/types.ts src/lib/data/trips.ts src/lib/data/trips.emulator.test.ts && git -c commit.gpgsign=false commit -m "feat: always-editable trips via derived recomputeItem/recomputeTrip; group by marketId"`

---

## Task 2: Data layer — settings, market & item CRUD (emulator TDD)

**Files:** Create `src/lib/data/settings.ts`, `src/lib/data/settings.emulator.test.ts`; modify `src/lib/data/markets.ts`, `src/lib/data/items.ts` and their emulator tests.

- [ ] **Step 1: Failing tests.** New `settings.emulator.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEmulator, teardownEmulator, clearFirestore, type TestCtx } from './testing/emulator';
import { getUserSettings, setDefaultMarket } from './settings';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupEmulator(); });
afterAll(async () => { await teardownEmulator(ctx); });
beforeEach(async () => { await clearFirestore(); });

describe('user settings', () => {
  it('defaults to nulls then round-trips the default market', async () => {
    expect((await getUserSettings(ctx.db, ctx.uid)).defaultMarketId).toBeNull();
    await setDefaultMarket(ctx.db, ctx.uid, 'm1', 'Palengke');
    const s = await getUserSettings(ctx.db, ctx.uid);
    expect(s.defaultMarketId).toBe('m1');
    expect(s.defaultMarketName).toBe('Palengke');
  });
});
```
  Append to `markets.emulator.test.ts`: a test for `updateMarket` (rename → nameLower changes) and `deleteMarket` (getMarket → null).
  Append to `items.emulator.test.ts`: `deleteItem` (getItem → null) and `updateItemMeta` rename (canonicalName + nameLower change).

- [ ] **Step 2: Run `npm run test:emulator` — FAIL.**

- [ ] **Step 3: Implement `settings.ts`:**
```ts
import { getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { userDoc } from './paths';
import type { UserSettings } from '../domain/types';

const EMPTY: UserSettings = { defaultMarketId: null, defaultMarketName: null };

export async function getUserSettings(db: Firestore, uid: string): Promise<UserSettings> {
  const snap = await getDoc(userDoc(db, uid));
  return { ...EMPTY, ...((snap.data() as any)?.settings ?? {}) };
}

export function subscribeUserSettings(db: Firestore, uid: string, cb: (s: UserSettings) => void): () => void {
  return onSnapshot(userDoc(db, uid), (snap) => cb({ ...EMPTY, ...((snap.data() as any)?.settings ?? {}) }));
}

export async function setDefaultMarket(db: Firestore, uid: string, marketId: string | null, marketName: string | null): Promise<void> {
  await setDoc(userDoc(db, uid), { settings: { defaultMarketId: marketId, defaultMarketName: marketName } }, { merge: true });
}
```
  (Verify `userDoc` exists in `paths.ts`; it does from Plan 1. If not, add `export const userDoc = (db, uid) => doc(db, 'users', uid);`.)

  In `markets.ts` add:
```ts
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
```
  (add `deleteDoc` import.)

  In `items.ts`:
```ts
export async function deleteItem(db: Firestore, uid: string, itemId: string): Promise<void> {
  await deleteDoc(itemDoc(db, uid, itemId));
}
```
  Extend `updateItemMeta` patch to `{ form?: Form; category?: Category; canonicalName?: string }`; when `canonicalName` is set, also write `nameLower: canonicalName.toLowerCase()`. (add `deleteDoc` import.)

- [ ] **Step 4: kill java, `npm run test:emulator` — all PASS.**

- [ ] **Step 5: Commit** `git add src/lib/data/settings.ts src/lib/data/settings.emulator.test.ts src/lib/data/markets.ts src/lib/data/items.ts src/lib/data/*.emulator.test.ts && git -c commit.gpgsign=false commit -m "feat: user settings (default market); market & item update/delete"`

---

## Task 3: settings rune; retire draft rune

**Files:** Create `src/lib/state/settings.svelte.ts`; delete `src/lib/state/draft.svelte.ts`; modify `src/App.svelte`.

- [ ] **Step 1: `settings.svelte.ts`** (mirror markets rune):
```ts
import { db } from '../data/firebase';
import { subscribeUserSettings } from '../data/settings';
import type { UserSettings } from '../domain/types';

let _settings = $state<UserSettings>({ defaultMarketId: null, defaultMarketName: null });
let unsub: (() => void) | null = null;

export const settings = { get value() { return _settings; } };

export function startSettings(uid: string) {
  if (unsub) return;
  unsub = subscribeUserSettings(db, uid, (s) => { _settings = s; });
}
```

- [ ] **Step 2: App.svelte** — import `startSettings`; in onMount after uid, call `startSettings(session.uid)` alongside the others.

- [ ] **Step 3: Delete `src/lib/state/draft.svelte.ts`** (`git rm`). Its consumers (LogTrip) are deleted in Task 5; AddItem will be refactored in Task 4 to not depend on it (it currently imports only types/data, not draft — verify). After deletion, `npm run check` will error only where draft is imported (LogTrip — deleted in Task 5). Sequence: do Task 4 + 5 before running a clean check; commit this rune addition now.

- [ ] **Step 4: Commit** `git add src/lib/state/settings.svelte.ts src/App.svelte && git rm src/lib/state/draft.svelte.ts && git -c commit.gpgsign=false commit -m "feat: settings rune; retire draft store"`

---

## Task 4: IconButton + AddItem edit-mode / market-aware

**Files:** Create `src/lib/ui/IconButton.svelte`; modify `src/routes/AddItem.svelte`.

- [ ] **Step 1: `IconButton.svelte`:**
```svelte
<script lang="ts">
  let { onclick, label, variant = 'default', children } =
    $props<{ onclick: () => void; label: string; variant?: 'default' | 'danger'; children: any }>();
</script>
<button class="ib {variant}" aria-label={label} onclick={onclick}>{@render children()}</button>
<style>
  .ib { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; border-radius: 10px; color: var(--c-ink); }
  .danger { color: var(--c-danger); }
</style>
```

- [ ] **Step 2: AddItem edit-mode + market-change.** Add props: `existing?: TripItem | null` (edit mode) and `onMarketChange?: (id: string|null, name: string|null) => void`. When `existing` is set: skip item-pick (item is fixed — load it via `getItem(existing.itemId)` or accept the item via a prop), seed `marketId/marketName/qty/unit/variant/price` from `existing`, and `onSave` emits the updated `NewTripItemInput` (the Trip screen maps it to `updateTripItem`). When the market is picked (`pickMarket`), call `onMarketChange?.(m.id, m.name)` so the parent can `setTripMarket` (sticky). Keep the market-aware prefill (`lastContextFor(item, marketId, variant)`) — already present; ensure it uses the current `marketId` (now seeded from the trip's default market via props). Concrete diffs:
  - props: `let { defaultMarketId = null, defaultMarketName = null, existing = null, onMarketChange, onSave } = $props<{ defaultMarketId?: string|null; defaultMarketName?: string|null; existing?: TripItem|null; onMarketChange?: (id: string|null, name: string|null) => void; onSave: (i: NewTripItemInput) => void }>();`
  - On mount/init for edit mode: if `existing`, set `item = await getItem(db, uid, existing.itemId)`, `marketId = existing.marketId`, `marketName = existing.marketName`, `qty = existing.quantity ?? 1`, `unit = existing.unit`, `variant = existing.variant ?? ''`, `price = existing.pricePaid`, `priceTouched = true` (don't auto-prefill over an existing price).
  - `pickMarket(m)`: also `onMarketChange?.(m.id, m.name)`.

- [ ] **Step 3:** `npm run check` — AddItem + IconButton error-free (Trip screen pending). Commit.
- [ ] **Step 4: Commit** `git add src/lib/ui/IconButton.svelte src/routes/AddItem.svelte && git -c commit.gpgsign=false commit -m "feat: IconButton; AddItem edit-mode + sticky market callback"`

---

## Task 5: The ONE Trip screen

**Files:** Create `src/routes/Trip.svelte`; delete `src/routes/TripSummary.svelte` and `src/routes/LogTrip.svelte`; modify `src/App.svelte` (route `/trip/:tripId` → Trip; remove `/log`).

- [ ] **Step 1: Implement `Trip.svelte`** — loads trip by id (`getTrip`) + live items (`subscribeTripItems`); groups via `groupByMarket`; per-line IconButton edit (opens AddItem edit-mode in an overlay/section) and remove (`removeTripItem`); "＋ Magdagdag" opens AddItem add-mode passing the trip's `defaultMarketId/Name` and an `onMarketChange` that calls `setTripMarket`; on add `addTripItem`; total card; delete-trip ConfirmDialog; "Tapos — i-save" shown only when `trip.status === 'draft'` (calls `saveTrip` then `push('/')`). Empty trip (no items) opens AddItem immediately. Full code:

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { session } from '../lib/state/session.svelte';
  import { db } from '../lib/data/firebase';
  import { getTrip, subscribeTripItems, addTripItem, updateTripItem, removeTripItem, deleteTrip, saveTrip, setTripMarket, groupByMarket, type NewTripItemInput } from '../lib/data/trips';
  import { tripTotal } from '../lib/domain/calc';
  import { baseUnitLabel } from '../lib/domain/units';
  import AddItem from './AddItem.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import ConfirmDialog from '../lib/ui/ConfirmDialog.svelte';
  import { Pencil, Trash2, ChevronLeft } from 'lucide-svelte';
  import type { Trip, TripItem } from '../lib/domain/types';

  let { params } = $props<{ params: { tripId: string } }>();
  const uid = session.uid!;
  const tripId = params.tripId;

  let trip = $state<Trip | null>(null);
  let items = $state<TripItem[]>([]);
  let mode = $state<'view' | 'add' | 'edit'>('view');
  let editing = $state<TripItem | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    getTrip(db, uid, tripId).then((t) => {
      trip = t;
      if (t && items.length === 0) mode = 'add'; // brand-new/empty → start adding
    });
    const unsub = subscribeTripItems(db, uid, tripId, (i) => { items = i; });
    return () => unsub();
  });

  const total = $derived(tripTotal(items));
  const groups = $derived(groupByMarket(items));
  const peso = (n: number | null) => (n == null ? '—' : '₱' + Math.round(n).toLocaleString('en-PH'));

  async function onAdd(input: NewTripItemInput) { await addTripItem(db, uid, tripId, input); mode = 'view'; }
  async function onEditSave(input: NewTripItemInput) {
    if (editing) await updateTripItem(db, uid, tripId, editing.id, { quantity: input.quantity, pricePaid: input.pricePaid, unit: input.unit, variant: input.variant, marketId: input.marketId, marketName: input.marketName });
    editing = null; mode = 'view';
  }
  function onMarketChange(id: string | null, name: string | null) { setTripMarket(db, uid, tripId, id, name); }
  async function remove(ti: TripItem) { await removeTripItem(db, uid, tripId, ti.id); }
  function startEdit(ti: TripItem) { editing = ti; mode = 'edit'; }
  async function finish() { await saveTrip(db, uid, tripId); push('/'); }
</script>

<section class="screen">
  <header>
    <IconButton label="Bumalik" onclick={() => push('/')}><ChevronLeft size={26} /></IconButton>
    <div class="h">{trip?.name ?? 'Biyahe'} · {trip?.date ?? ''}</div>
    <div class="sp"></div>
  </header>

  {#if mode === 'add'}
    <AddItem defaultMarketId={trip?.defaultMarketId ?? null} defaultMarketName={trip?.defaultMarketName ?? null} {onMarketChange} onSave={onAdd} />
    {#if items.length}<button class="link" onclick={() => (mode = 'view')}>Bumalik sa listahan</button>{/if}
  {:else if mode === 'edit' && editing}
    <AddItem existing={editing} defaultMarketId={editing.marketId} defaultMarketName={editing.marketName} {onMarketChange} onSave={onEditSave} />
    <button class="link" onclick={() => { editing = null; mode = 'view'; }}>Kanselahin</button>
  {:else}
    <div class="card"><div class="lbl">Kabuuan</div><div class="hero">{peso(total)}</div>
      <div class="chips"><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div></div>

    {#each groups as g (g.marketId ?? '__none__')}
      <div class="mkt">{g.marketName ?? 'Walang tindahan'}</div>
      {#each g.items as ti (ti.id)}
        <div class="row">
          <div class="grow"><div class="name">{ti.label}</div>
            <div class="sub">{ti.quantity ?? '?'} {ti.unit} × {peso(ti.pricePaid)}{#if ti.pricePerBaseUnit != null} · ₱{Math.round(ti.pricePerBaseUnit)}/{baseUnitLabel(ti.baseUnit)}{/if}</div></div>
          <div class="price">{peso(ti.pricePaid)}</div>
          <IconButton label="I-edit" onclick={() => startEdit(ti)}><Pencil size={18} /></IconButton>
          <IconButton label="Tanggalin" variant="danger" onclick={() => remove(ti)}><Trash2 size={18} /></IconButton>
        </div>
      {/each}
      <div class="subtotal"><span>Subtotal</span><span>{peso(g.subtotal)}</span></div>
    {/each}

    <button class="addrow" onclick={() => (mode = 'add')}>＋ Magdagdag ng item</button>
    {#if trip?.status === 'draft'}<button class="finish" onclick={finish}>Tapos — i-save ang biyahe</button>{/if}
    <button class="trash" onclick={() => (confirmDelete = true)}><Trash2 size={18} /> Burahin ang biyahe</button>
  {/if}
</section>

{#if confirmDelete}
  <ConfirmDialog title="Burahin ang biyahe?" message="Hindi na ito maibabalik." confirmLabel="Oo, burahin"
    onConfirm={async () => { await deleteTrip(db, uid, tripId); push('/'); }} onCancel={() => (confirmDelete = false)} />
{/if}

<style>
  .screen { padding: var(--sp-screen); padding-bottom: 90px; }
  header { display: flex; align-items: center; gap: 8px; }
  .h { font-weight: 700; font-size: 17px; } .sp { flex: 1; }
  .card { background: var(--c-surface); border-radius: var(--radius); padding: 16px; margin-top: 8px; }
  .lbl { color: var(--c-ink-soft); font-size: var(--fs-label); }
  .hero { font-size: var(--fs-hero); font-weight: 800; }
  .chips span { background: var(--c-bg); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .mkt { font-weight: 700; margin-top: 16px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 9px 0; border-bottom: 1px solid var(--c-surface); }
  .grow { flex: 1; } .name { font-weight: 700; } .sub { color: var(--c-ink-soft); font-size: 13px; }
  .price { font-size: var(--fs-price); font-weight: 700; }
  .subtotal { display: flex; justify-content: space-between; padding: 8px 0; font-weight: 700; color: var(--c-ink-soft); }
  .addrow { width: 100%; padding: 14px; margin-top: 14px; border: 2px dashed var(--c-ink); border-radius: var(--radius); background: var(--c-bg); font-weight: 700; }
  .finish { width: 100%; padding: 14px; margin-top: 10px; border: none; border-radius: var(--radius); background: var(--c-accent); color: #fff; font-weight: 700; font-size: var(--fs-price); }
  .trash { width: 100%; padding: 12px; margin-top: 10px; border: 2px solid var(--c-danger); color: var(--c-danger); border-radius: var(--radius); background: none; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .link { background: none; border: none; color: var(--c-accent); font-weight: 700; margin-top: 10px; }
</style>
```

- [ ] **Step 2: App.svelte** — replace TripSummary/LogTrip imports with `Trip`; routes: `'/trip/:tripId': Trip`; REMOVE `'/log/:tripId'`. `git rm src/routes/TripSummary.svelte src/routes/LogTrip.svelte`.

- [ ] **Step 3:** `npm run check` — Trip error-free. Home/Biyahe still reference `/log` (fixed Task 6). Build may fail until Task 6. Commit.
- [ ] **Step 4: Commit** `git add src/routes/Trip.svelte src/App.svelte && git rm src/routes/TripSummary.svelte src/routes/LogTrip.svelte && git -c commit.gpgsign=false commit -m "feat: one always-editable Trip screen (replaces LogTrip + TripSummary)"`

---

## Task 6: Wire Home/Biyahe to /trip; seed market from settings

**Files:** Modify `src/routes/Home.svelte`, `src/routes/Biyahe.svelte`.

- [ ] **Step 1: Home `newTrip()`** — seed the market from settings:
```ts
import { settings } from '../lib/state/settings.svelte';
// ...
async function newTrip() {
  const today = new Date().toISOString().slice(0, 10);
  const s = settings.value;
  const id = await startNewTripDoc(today, s.defaultMarketId, s.defaultMarketName);
  push(`/trip/${id}`);
}
```
  Replace the old `startNewTrip` (draft store, deleted) with a direct `createDraftTrip` call:
```ts
import { createDraftTrip } from '../lib/data/trips';
import { db } from '../lib/data/firebase';
async function newTrip() {
  const today = new Date().toISOString().slice(0, 10);
  const s = settings.value;
  const trip = await createDraftTrip(db, session.uid!, { name: 'Biyahe', date: today, defaultMarketId: s.defaultMarketId, defaultMarketName: s.defaultMarketName });
  push(`/trip/${trip.id}`);
}
```
  Recent-trip rows + resume row already `push('/trip/:id')`? Home's resume row currently pushes `/log/:id` — change to `/trip/:id`. Recent rows already → `/trip/:id` (keep).

- [ ] **Step 2: Biyahe** — draft "Ipagpatuloy" rows currently `push('/log/:id')` → change to `/trip/:id`. Saved rows already → `/trip/:id`.

- [ ] **Step 3:** `npm run check` (0 errors now — no `/log` refs, draft store gone) and `npm run build` (clean). Manual (`npm run dev`): Bagong biyahe → Trip screen opens in add mode; add items; back leaves a draft (Biyahe shows it); reopen; Tapos saves.

- [ ] **Step 4: Commit** `git add src/routes/Home.svelte src/routes/Biyahe.svelte && git -c commit.gpgsign=false commit -m "feat: route trip entry points to the unified /trip screen; seed market from settings"`

---

## Task 7: Items full CRUD

**Files:** Modify `src/routes/Items.svelte`.

- [ ] **Step 1:** Add **"＋ Bagong item"** (name input + FormPicker + CategoryPicker → `createItem`); convert the "I-edit" text link to an **IconButton (Pencil)** next to the price plus an **IconButton (Trash2, danger)** that opens a ConfirmDialog → `deleteItem`. The edit panel gains a **rename** field (text input bound to a `editName`) and passes `canonicalName` to `updateItemMeta`. Keep row-tap → `/item/:id`. Full code mirrors the current Items.svelte structure with these additions (use `IconButton`, `ConfirmDialog`, `createItem`, `deleteItem`, `updateItemMeta`).

- [ ] **Step 2:** `npm run check`, `npm run build`. Manual: create an item from Items; rename it; delete it (confirm); verify the row icons.

- [ ] **Step 3: Commit** `git add src/routes/Items.svelte && git -c commit.gpgsign=false commit -m "feat: Items full CRUD (add, rename, delete) with icon buttons"`

---

## Task 8: "Iba pa" tab — More menu, Markets page, Settings page

**Files:** Modify `src/lib/ui/TabBar.svelte`, `src/App.svelte`; create `src/routes/More.svelte`, `src/routes/Markets.svelte`, `src/routes/Settings.svelte`.

- [ ] **Step 1: TabBar** — add a 5th tab `{ path: '/more', label: 'Iba pa', icon: Menu }` (import `Menu` from lucide-svelte). The `isActive('/more')` highlights for `/more`, `/markets`, `/settings` (startsWith on those — simplest: highlight when location starts with `/more` || `/markets` || `/settings`).

- [ ] **Step 2: `More.svelte`** — a simple menu list: "Mga tindahan" → push('/markets'); "Mga setting" → push('/settings'). Rows with chevrons.

- [ ] **Step 3: `Markets.svelte`** — `markets.all` list; each row name + type with IconButton edit (inline rename + type chips → `updateMarket`) and IconButton delete (ConfirmDialog → `deleteMarket`); "＋ Bagong tindahan" reusing the create UI (name + MARKET_TYPES chips → `createMarket`).

- [ ] **Step 4: `Settings.svelte`** — shows the current default market (`settings.value.defaultMarketName ?? 'Wala'`); a MarketPicker to choose one → `setDefaultMarket(db, uid, m.id, m.name)`; a "Alisin" to clear (`setDefaultMarket(..., null, null)`).

- [ ] **Step 5: App.svelte** — add routes `'/more': More, '/markets': Markets, '/settings': Settings`. Keep the tab bar visible on these (it's hidden only for… currently `showTabs = !router.location.startsWith('/log/')` — `/log` is gone; set `showTabs = true` always, or hide on `/trip/` if you want the trip screen full-bleed — keep tabs visible everywhere for simplicity).

- [ ] **Step 6:** `npm run check`, `npm run build`. Manual: Iba pa tab → More → Markets (add/edit/delete) and Settings (set default market) → start a new trip and confirm the market is preselected.

- [ ] **Step 7: Commit** `git add src/lib/ui/TabBar.svelte src/App.svelte src/routes/More.svelte src/routes/Markets.svelte src/routes/Settings.svelte && git -c commit.gpgsign=false commit -m "feat: Iba pa tab — More menu, Markets management, Settings (default market)"`

---

## Task 9: e2e + full sweep

**Files:** Modify `e2e/core-loop.spec.ts`.

- [ ] **Step 1: Update e2e** for the unified flow + new capabilities. Tests:
  1. Core loop on `/trip/:id`: Bagong biyahe → add a new item (form+category) at a created market → Tapos → reopen the saved trip from Biyahe → **add another item** (proves always-editable) → total updates.
  2. Edit a line via the AddItem editor (change price) → total updates; remove a line → it disappears and total drops.
  3. Items page: create an item, rename it, delete it (confirm).
  4. Settings: set a default market under Iba pa → start a new trip → the market is preselected in AddItem.
  Use `waitForURL(/#\/trip\//)` after Bagong biyahe; scope ambiguous ₱ assertions.

- [ ] **Step 2: Full sweep:** `npm test`; kill java + `npm run test:emulator`; `npm run check` (0 errors); `npm run build`; `npm run e2e`. All green (re-run emulator once on a lone flake).

- [ ] **Step 3: Review screenshots** — icon buttons present, Filipino copy, no emoji, market grouping by id.

- [ ] **Step 4: Commit** any incidental fixes.

---

## Notes / carry-forward

- **Google sign-in** is the next round (Settings page already hosts the future "I-link ang Google account"). Web flow first (emulator), then native Capacitor plugin once Android/iOS projects exist.
- Recipes/saved lists, recommendations/ML, i18n still parked.
- `cleared quantity → null` (from the prior round) still applies to AddItem; consider requiring qty before save in a polish pass.

### Final-review findings
**Fixed this round:**
- Deleting a library item no longer makes its existing trip lines uneditable — AddItem edit-mode synthesizes a fallback item from the line (via `formForUnit`) instead of hanging on `getItem` returning null.
- `Trip.svelte` `tripId` is now `$derived(params.tripId)` so the screen re-fetches/re-subscribes if the route id ever changes on a reused instance.
- Editing a line's market no longer rewrites the trip's default market (the sticky `onMarketChange` fires only in add mode).

**Deferred (carry-forward):**
- **Draft lines count toward `purchaseCount` and drive an item's `lastPrice*` before "Tapos."** Because `recomputeItem` uses the status-less `priceHistory` collectionGroup, an in-progress/abandoned draft inflates the item's "N biyahe" and shows its tentative price as the item's last price — inconsistent with analytics ignoring drafts. Settling this needs trip `status` denormalized onto each tripItem so recompute can filter to saved trips. Confirm intended behaviour next round.
- **Per-mutation recompute isn't serialized/transactional** (full read-modify-write `setDoc`). Two fast mutations on the same item could clobber `lastPrice`. Low risk for one-handed single-user; revisit with a queue/transaction or `updateDoc` field-merge if it ever bites.
- **Deleting a market** leaves tripItems with a dangling `marketId` (they keep `marketName` for display, so it's cosmetic only).
