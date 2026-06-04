# Architecture Context: cart-tracker

## Classification
Brownfield / Lightweight — touches 3 existing files plus tests. No new module boundary, no new Firestore index, no rules change.

## Existing Code (touched/relevant)

- **`src/lib/domain/types.ts`**: `TripItem` already has `addedAt: number` (Unix ms timestamp set in `addTripItem`). Currently no `inCart` field. Adding `inCart?: boolean` (optional; undefined ≡ false for all existing docs).
- **`src/lib/data/trips.ts`**:
  - `TripItemPatch` controls what `updateTripItem` can patch. Must add `inCart?: boolean` here.
  - `updateTripItem` does a full doc spread + price recompute then `recomputeTrip`. For a cart toggle, this is heavier than needed (rewrites the whole doc + recomputes the trip total) — but it's correct and the overhead is one Firestore write. For v1 cart toggle, acceptable.
  - Alternative: add a dedicated `toggleCartItem(db, uid, tripId, tripItemId, inCart)` using `updateDoc` for a field-only patch — lighter, no recomputeTrip/recomputeItem needed since `inCart` doesn't affect price or totals.
  - `getTripItems` orders by `addedAt asc` — "recently added" is already a natural sort property; no schema change needed.
  - `subscribeTripItems` subscribes to real-time updates — in-cart toggle will propagate live to the UI automatically.
- **`src/routes/Trip.svelte`**: Renders `items` grouped by market. Currently each row has edit + delete icon buttons. The cart toggle affordance goes here. `groupByMarket` groups items by marketId — whether in-cart items move to a "done" section or stay in place is the key UX decision (see below).
- **`firestore.rules`**: The `/users/{uid}/{document=**}` rule already covers all tripItem writes. No rule change needed for `inCart`.

## Tech Debt & Scalability
- `updateTripItem` does full-doc write + recomputeTrip for every cart toggle. A dedicated `toggleCartItem` using `updateDoc({ inCart })` avoids the recompute overhead. This is the recommended approach: add a thin dedicated function rather than routing cart toggles through the heavyweight patch path.
- No new Firestore index needed — `inCart` is not queried server-side, only filtered client-side via the already-subscribed `items` array.

## Infra Needs
- No new Firestore index.
- No security rules change.
- No new Capacitor plugin.
- One new optional field on TripItem documents: `inCart?: boolean`. Backward-compatible (missing field = false).

## Architectural Decisions (open — for product spec to resolve)

- **Cart UX pattern**: Two options:
  - A. *Move in-cart items to a "done" section* — items checked off visually separate from pending list. More satisfying, matches mental model of a grocery list being checked off.
  - B. *In-place checkbox/check with visual muting* — items stay in their market group, just get a struck-through or muted look. Simpler, no reordering.
  - Option A is the recommended choice (accessibility-first: recognition of what's left vs done), but it changes the `groupByMarket` output or the rendering loop in Trip.svelte.

- **"Recently added" definition**: Since `addedAt` is already on every TripItem, the UI can mark an item as "new" if `Date.now() - ti.addedAt < X ms`. Threshold is a product decision (suggested: 60 seconds). No data change.

## Constraints for Spec
- `inCart` field must be optional (`?`) on TripItem — existing saved docs have no such field and must render correctly.
- Cart toggle must use `updateDoc` (field-only patch), NOT `updateTripItem` — the cart state does not affect price totals and should not trigger `recomputeTrip`.
- The feature is **draft-trip only** — no cart state is needed once a trip is saved.
- Offline-first: Firestore SDK's optimistic local writes mean the toggle is instant even without network (consistent with the app's core contract).
- Security rules: the existing `/users/{uid}/{document=**}` write rule covers the `updateDoc` call.
