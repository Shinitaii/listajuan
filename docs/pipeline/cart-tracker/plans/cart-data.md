# Module Plan: cart-data

## Purpose
Extend the domain type and data layer to support per-item cart state on a trip.

## Owned Files
- `src/lib/domain/types.ts` — add `inCart?: boolean` to `TripItem`
- `src/lib/data/trips.ts` — add `toggleCartItem` function
- `src/lib/data/trips.cart.emulator.test.ts` — emulator tests

## Steps

### 1. types.ts — add field
Add `inCart?: boolean` to the `TripItem` interface after `addedAt`:
```ts
inCart?: boolean;  // undefined = false (backward-compat with existing docs)
```
No other types change.

### 2. trips.ts — add toggleCartItem
Add import `updateDoc` to the existing firebase/firestore import line.
Add function:
```ts
export async function toggleCartItem(
  db: Firestore,
  uid: string,
  tripId: string,
  tripItemId: string,
  inCart: boolean,
): Promise<void>
```
Implementation:
- `const ref = doc(tripItemsCol(db, uid, tripId), tripItemId)`
- `try { await updateDoc(ref, { inCart }) } catch { return }`
- Does NOT call `recomputeTrip` or `recomputeItem`.

### 3. trips.cart.emulator.test.ts — 4 tests
Pattern mirrors trips.emulator.test.ts: `setupEmulator` / `teardownEmulator` / `clearFirestore`, `beforeAll`/`afterAll`/`beforeEach`.

Tests:
1. `toggleCartItem(true)` — creates item + trip + tripItem, toggles inCart=true, reads doc back, expects `inCart === true`
2. `toggleCartItem(false)` — set true then false, expects `inCart === false`
3. `toggleCartItem on missing doc` — call with a non-existent tripItemId, expects no throw (silent no-op)
4. `toggleCartItem does not change trip total` — add item with pricePaid=100, toggle inCart=true, reread trip, expect `total` unchanged (recomputeTrip was NOT called)

## Interface Contract (exact)
```ts
// src/lib/domain/types.ts — TripItem addition:
inCart?: boolean

// src/lib/data/trips.ts:
export async function toggleCartItem(
  db: Firestore,
  uid: string,
  tripId: string,
  tripItemId: string,
  inCart: boolean,
): Promise<void>
```
