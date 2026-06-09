# Plan: data-layer

## Goal
Replace all `uid` params with `listId` across items.ts, trips.ts, markets.ts. Fix TripItem writes to use `listId` (not `uid`). Fix priceHistory collectionGroup query field.

## Steps

### items.ts
1. Replace every `uid: string` param with `listId: string`.
2. Paths already updated via data-paths (itemsCol, itemDoc now take listId).

### trips.ts
1. Replace every `uid: string` param with `listId: string`.
2. In `addTripItem`: remove `uid` from TripItem doc, add `listId`.
3. In `priceHistory`: change `where('uid', '==', uid)` → `where('listId', '==', listId)`.
4. Paths already updated via data-paths.

### markets.ts
1. Replace every `uid: string` param with `listId: string`.

### Test files (update in-place)
- items.emulator.test.ts: ctx.uid → listId fixture var
- items.barcode.emulator.test.ts: same
- trips.emulator.test.ts: same
- trips.cart.emulator.test.ts: same
- cart-tracker.integration.emulator.test.ts: same
- markets.emulator.test.ts: same
- subscriptions.emulator.test.ts: same

## Test strategy
Existing emulator tests updated in-place. Run via `npm run test:emulator`.

## Files owned
`src/lib/data/items.ts`, `src/lib/data/trips.ts`, `src/lib/data/markets.ts`
+ test files listed above
