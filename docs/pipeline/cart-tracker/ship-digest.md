# Ship Digest: cart-tracker
Branch: feat/cart-tracker · Review: PASS · Status: shipped to branch (NOT merged to main)

## TL;DR
During a draft trip, tapping any item row instantly moves it to a "Na sa cart na" section at the
bottom (struck-through, muted) — and back again. Items added in the last 5 minutes show a "Bagong
dagdag" badge. Saved trips are unchanged. One new Firestore field (`inCart?: boolean`), one new
function (`toggleCartItem`), and UI changes confined to `Trip.svelte`.

## Verify Evidence (the proof)

| Scope | Result | Quoted from verify file |
|---|---|---|
| cart-data | GREEN | `Tests  4 passed (4)` — `verify/cart-data.txt` line 4 |
| cart-ui | GREEN | `Tests  85 passed (85)` + `tsc --noEmit exit 0` — `verify/cart-ui.txt` lines 5–6 |
| integration (pure) | GREEN | `Tests  91 passed (91)` — `verify/integration.txt` line 9 |
| integration (emulator) | GREEN | `Tests  2 passed (2)` — `verify/integration.txt` line 13 |
| cart-data (emulator re-run) | GREEN | `Tests  4 passed (4)` — `verify/integration.txt` line 17 |

## Mechanism Overview (factual — NOT your ownership explanation)

1. **Field-only cart toggle (no price recompute)** — `toggleCartItem` in
   `src/lib/data/trips.ts:301` calls `updateDoc(ref, { inCart })` — a partial write that patches
   only the `inCart` field. It does NOT call `recomputeTrip` or `recomputeItem`, so toggling
   never changes the trip total. Missing-doc is caught silently. Emulator test #4 confirms total
   unchanged after toggle: `verify/cart-data.txt` line 4.

2. **Reactive pending/done split in Trip.svelte** — Two `$derived` values at
   `src/routes/Trip.svelte:37–38` partition the live `items` array:
   `pending = items.filter(i => !i.inCart)` and `inCartItems = items.filter(i => i.inCart)`.
   Since `subscribeTripItems` already pushes all field changes live, the split re-evaluates the
   moment `toggleCartItem`'s `updateDoc` propagates — no extra subscription needed. Pure filter
   tests at `src/lib/data/cart-tracker.filter.test.ts:16–42` confirm `undefined` is treated as
   pending (backward-compat).

3. **Draft-only gate** — The entire split view, tap-to-toggle, and badge are wrapped in
   `{#if trip?.status === 'draft'}` at `src/routes/Trip.svelte` (template block ~line 73).
   Saved trips fall through to the unchanged `{#each groups}` path with no toggle affordance,
   preserving all existing saved-trip rendering exactly.

## Decisions Made

- **`updateDoc` not `updateTripItem`** — `updateTripItem` triggers `recomputeTrip` + `recomputeItem` (full fan-out). Cart state is display-only and must not touch price totals. Field-only patch chosen. (`context.md`)
- **`inCart?: boolean` optional** — Existing Firestore docs have no `inCart` field; `undefined` is falsy so `!i.inCart` is `true` for all legacy items. No migration needed. (`coding.md`)
- **`stopPropagation` wrapper on edit/delete buttons** — `IconButton.onclick` is typed `() => void` (no event param). Rather than changing `IconButton`, a `<div onclick={(e) => e.stopPropagation()}>` wrapper intercepts bubbling before the row `<button>` fires. (`src/routes/Trip.svelte`, review Phase A)
- **5-minute "recently added" threshold** — `RECENTLY_ADDED_MS = 5 * 60 * 1000` at `Trip.svelte:36`. Boundary test at `cart-tracker.filter.test.ts:56` confirms off-by-one is correct.

## Edge Cases Handled

- `inCart` undefined (legacy docs) treated as pending · `cart-tracker.filter.test.ts:17`
- Toggle true → false (un-cart) works · `trips.cart.emulator.test.ts:32`
- Toggle on non-existent tripItemId is silent no-op (no throw) · `trips.cart.emulator.test.ts:43`
- Cart toggle does not change trip total · `trips.cart.emulator.test.ts:53`
- `isNew` boundary: item at exactly `RECENTLY_ADDED_MS + 1ms` old returns false · `cart-tracker.filter.test.ts:56`
- Full roundtrip: toggle→getTripItems→splitByCart correctly moves item between sections · `cart-tracker.integration.emulator.test.ts:20`
- Saved trips: no `{#if trip?.status === 'draft'}` path → original render, no regression · `verify/cart-ui.txt` (tsc green, no type errors on saved-trip path)

## Files Touched

**cart-data module:**
- `src/lib/domain/types.ts` — `inCart?: boolean` added to `TripItem` at line 76
- `src/lib/data/trips.ts` — `toggleCartItem` added at line 301; `updateDoc` added to import
- `src/lib/data/trips.cart.emulator.test.ts` — 4 emulator tests (new file)

**cart-ui module:**
- `src/routes/Trip.svelte` — pending/done split, `onToggleCart`, `isNew` badge, section headers

**integration:**
- `src/lib/data/cart-tracker.filter.test.ts` — 6 pure filter/isNew tests (new file)
- `src/lib/data/cart-tracker.integration.emulator.test.ts` — 2 emulator roundtrip tests (new file)

**pipeline docs:**
- `docs/pipeline/cart-tracker/` — context, product, coding, plans, verify, review, this digest

## Gaps / Caveats

- **No DOM-level component test.** The project has no `@testing-library/svelte` / jsdom setup.
  The toggle button's render and click behaviour is covered by tsc (type-correct wiring) + filter
  logic pure tests + emulator Firestore tests, but there is no test that simulates a tap in the
  component and asserts the DOM updates. This is the one verification gap; adding component
  testing infra was out of scope for this feature.
- **Two pre-existing emulator failures** (not introduced by this feature):
  `trips.emulator.test.ts:75` (saveTrip fan-out assertion off by one price) and
  `subscriptions.emulator.test.ts` (RESOURCE_EXHAUSTED timeout). Neither is in cart-tracker's
  owned paths. Both need a separate fix.

## Own-before-merge
Non-trivial. Run `code-explain-before-ship`, write the 3 mechanisms in your own words,
then merge `feat/cart-tracker` → `main` when ready.
