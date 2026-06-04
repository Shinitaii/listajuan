# Coding Design Spec: Cart Tracker

## Tech Stack Decisions
- TypeScript throughout — matches existing codebase; no new language introduced
- Firebase `updateDoc` (not `setDoc`) for cart toggle — field-only patch, no recomputeTrip
- Svelte 5 `$derived` for pending/inCart split — reactive, no manual sync
- Vitest for all tests — existing runner, no new setup

## Coding Patterns

- **Async style:** Data-layer functions that touch Firestore are `async`. Derived list filtering in Svelte is synchronous `$derived`. `toggleCartItem` is `async` (returns `Promise<void>`).
- **Error handling:** Data functions return `void` or a value; never throw across module boundaries — consistent with existing `trips.ts` pattern (`if (!snap.exists()) throw` only for internal invariant violations, not for normal "not found" paths).
- **Naming:** camelCase functions, PascalCase types/interfaces. Test files: `*.emulator.test.ts` for Firestore tests, `*.test.ts` for pure unit tests.
- **Data-layer access:** Components import from `src/lib/data/trips` only — never import `firebase/firestore` directly in `.svelte` files.
- **Test/mock conventions:** Emulator tests use `setupEmulator`/`clearFirestore` from `src/lib/data/testing/emulator.ts`. Mocks declared at module level with `vi.mock`, not inside `beforeEach`.
- **Imports:** Relative paths only — no barrel aliases. `$lib` path alias not used in this project.

## New Dependencies (npm)
none

## Modules

### 1. cart-data
- **Purpose:** Add `inCart` to the domain type and expose a lightweight toggle function in the data layer.
- **Owns:** The `inCart` field on `TripItem`, and the `toggleCartItem` function.
- **Files:**
  - `src/lib/domain/types.ts` — add `inCart?: boolean` to `TripItem` interface
  - `src/lib/data/trips.ts` — add `toggleCartItem` function
  - `src/lib/data/trips.cart.emulator.test.ts` — emulator tests for `toggleCartItem`
- **Dependencies:** None (types are self-contained; `trips.ts` already imports `updateDoc` from firebase)
- **Tech:** TypeScript, Firebase Web SDK (`updateDoc`)
- **Interface Contract:**
  ```ts
  // In src/lib/domain/types.ts — added field on TripItem:
  inCart?: boolean   // optional; undefined or false = pending

  // In src/lib/data/trips.ts:
  export async function toggleCartItem(
    db: Firestore,
    uid: string,
    tripId: string,
    tripItemId: string,
    inCart: boolean,
  ): Promise<void>
  // Uses updateDoc — does NOT call recomputeTrip or recomputeItem.
  // Writes only { inCart } to the tripItem doc.
  // No-ops silently if the doc does not exist (updateDoc on missing doc throws;
  // catch and return without rethrowing — consistent with removeTripItem pattern).
  ```

### 2. cart-ui
- **Purpose:** Wire the cart-tracker into Trip.svelte — split view, tap-to-toggle, recently-added badge.
- **Owns:** All visual and interaction changes in Trip.svelte.
- **Files:**
  - `src/routes/Trip.svelte` — add pending/inCartItems derived split, toggleCartItem call, section headers, recently-added badge
- **Dependencies:** cart-data (`toggleCartItem` from `trips.ts`; `inCart` field on `TripItem`)
- **Tech:** Svelte 5 (runes), TypeScript
- **Interface Contract:**
  ```
  // New $derived values in Trip.svelte script:
  const RECENTLY_ADDED_MS = 5 * 60 * 1000   // 5 minutes, named constant
  const pending   = $derived(items.filter(i => !i.inCart))
  const inCartItems = $derived(items.filter(i =>  i.inCart))
  const pendingGroups = $derived(groupByMarket(pending))
  const isNew = (ti: TripItem) => Date.now() - ti.addedAt < RECENTLY_ADDED_MS

  // New handler (async, no spinner — optimistic):
  async function onToggleCart(ti: TripItem) {
    await toggleCartItem(db, uid, tripId, ti.id, !ti.inCart)
  }

  // UI structure (draft trips only, i.e. trip?.status === 'draft'):
  // Pending section header:  "Listahan ({pending.length})"
  //   → each market group with existing row structure
  //   → tapping the row calls onToggleCart(ti)
  //   → rows with isNew(ti) === true show a "Bagong dagdag" badge
  // Done section header:     "Na sa cart na ({inCartItems.length})"  [only if inCartItems.length > 0]
  //   → flat list, no market grouping, label struck-through + muted
  //   → tapping the row calls onToggleCart(ti)
  // Saved trips: no section split, no tap handler, no badge (status === 'saved')
  ```

## Module Dependencies

```
cart-data  ──(inCart field, toggleCartItem)──▶  cart-ui
```

cart-data has no upstream dependencies within this feature.
cart-ui consumes cart-data's exports and mutates Trip.svelte only.

## Infra Steps
none — no new Firestore index, no rules change, no migrations.

## Integration Points
- `toggleCartItem` is imported into `Trip.svelte` alongside the existing `updateTripItem`, `removeTripItem` imports from `'../lib/data/trips'`.
- `subscribeTripItems` already live-pushes all TripItem field changes to `items` — the `inCart` field update will propagate automatically without any extra subscription wiring.
- `groupByMarket` is reused on the `pending` derived list only (not on `inCartItems`).

## UI Integration
- **Component to wire:** `src/routes/Trip.svelte`
- **User-facing contract:** On a draft trip, the list is split into two sections. Tap any pending item row → it moves instantly to "Na sa cart na" at the bottom (struck-through, muted). Tap any done item → moves back to pending. Items added in the last 5 minutes show a "Bagong dagdag" label. Section headers show counts. Saved trips are unchanged.
- **Built modules consumed:** `toggleCartItem` (cart-data), `inCart` field (cart-data types)
- **Owned files:** `src/routes/Trip.svelte` (cart-ui owns this)

## Constraints & Rules
- `inCart?: boolean` must be optional — missing field is treated as `false` everywhere.
- `toggleCartItem` must use `updateDoc`, not `setDoc` or `updateTripItem` — no `recomputeTrip` side effect.
- Cart toggle and its UI are only active when `trip?.status === 'draft'`. Saved trips render identically to today.
- Tap target for the row toggle must be ≥44×44pt (full row tap, not a small icon).
- No new npm packages.
- All existing emulator + unit tests must stay green.

## Project Context
- **Framework:** Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`) — no legacy `writable` stores
- **Data layer pattern:** All Firestore access via `src/lib/data/` functions only; components never import firebase SDK directly
- **Testing approach:** Pure tests (`*.test.ts`) run with `npm test`; emulator tests (`*.emulator.test.ts`) run with `npm run test:emulator`. TDD: failing test → implement → pass.
