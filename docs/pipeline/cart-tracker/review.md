# Review: cart-tracker

## Verdict: PASS ✓

---

### 0. All Green (non-negotiable gate)

| Verify file | Result |
|---|---|
| `verify/cart-data.txt` | **GREEN** — 1 file, 4 emulator tests passed |
| `verify/cart-ui.txt` | **GREEN** — tsc clean, 85 pure tests passed |
| `verify/integration.txt` | **GREEN** — 91 pure (incl. 6 filter tests), 4 cart emulator, 2 integration emulator |

All artifacts present. All in-scope tests 100% passing. Gate: ✓

Pre-existing failures in unowned files (trips.emulator.test.ts:75, subscriptions.emulator.test.ts timeout) confirmed unrelated to cart-tracker — cart-tracker did not modify `recomputeItem`, `saveTrip`, or `subscribeTripItems`.

---

### 1. Product Requirements Met?

| Requirement | Met? |
|---|---|
| Tap full item row to toggle in-cart | ✓ `<button class="row row-pending" onclick={() => onToggleCart(ti)}>` — full row, min-height 44px |
| Pending section (top), market groups preserved | ✓ `pendingGroups = $derived(groupByMarket(pending))` |
| "Na sa cart na" section (bottom), muted + struck-through | ✓ `.row-done { opacity: 0.5 }` + `.done-label { text-decoration: line-through }` |
| Toggle instant (optimistic, offline-first) | ✓ `updateDoc` — Firestore SDK resolves from local cache; no spinner |
| Persisted to Firestore (`inCart` field) | ✓ `toggleCartItem` writes `{ inCart }` via `updateDoc` |
| Draft trips only — saved trips unchanged | ✓ `{#if trip?.status === 'draft'}` gates entire split; saved trips fall through to original `{#each groups}` |
| Filipino labels: "Listahan" / "Na sa cart na" | ✓ `<div class="section-hdr">Listahan ({pending.length})</div>` / `Na sa cart na ({inCartItems.length})` |
| Backward-compatible (`inCart?` undefined = pending) | ✓ `items.filter(i => !i.inCart)` — undefined is falsy; filter test confirms |
| "Bagong dagdag" badge (should-have) | ✓ `{#if isNew(ti)}<span class="new-badge">Bagong dagdag</span>{/if}` |
| Item count in section headers (should-have) | ✓ `Listahan ({pending.length})` / `Na sa cart na ({inCartItems.length})` |

All Must-Haves: ✓. Both Should-Haves: ✓.

### 2. Tech Stack Followed?

TypeScript throughout ✓. Firebase `updateDoc` (not `setDoc`/`updateTripItem`) ✓. Svelte 5 `$derived` (no legacy stores) ✓. Vitest ✓. No new npm packages ✓. Components import from `src/lib/data/` only ✓.

### 3. Module Boundaries

| Module | Files owned | Correct? |
|---|---|---|
| cart-data | `types.ts`, `trips.ts`, `trips.cart.emulator.test.ts` | ✓ |
| cart-ui | `Trip.svelte` | ✓ |
| integration | `cart-tracker.filter.test.ts`, `cart-tracker.integration.emulator.test.ts` | ✓ |

No cross-boundary file ownership. ✓

### 4. Code Quality

- `toggleCartItem`: `updateDoc` field-only patch, silent catch on missing doc, no recomputeTrip. ✓
- `Trip.svelte`: `stopPropagation` wrapper on edit/delete buttons prevents row toggle on those taps. RECENTLY_ADDED_MS named constant. Saved-trip path untouched. ✓

### 5. Test Coverage

- `cart-data`: 4 emulator tests — toggle true, toggle false, missing-doc no-op, no trip total change. ✓
- `cart-ui`: tsc + visual review (coding.md explicitly scoped as "no separate test file" — project has no component testing infra). ✓ within spec.
- Integration: 6 pure filter tests (splitByCart + isNew boundary) + 2 emulator roundtrip tests. ✓

**Note:** No DOM-level component test (button-renders, tap-fires-handler). This project has no @testing-library/svelte setup. The gap is acknowledged: tsc confirms correct wiring, pure tests confirm filter logic, emulator tests confirm Firestore contract. Adding component testing infra is out of scope for this feature.

### 6. Integration Points

| Contract | Met? |
|---|---|
| `toggleCartItem` imported in Trip.svelte from `'../lib/data/trips'` | ✓ |
| `inCart?: boolean` on TripItem (optional, backward-compat) | ✓ |
| `subscribeTripItems` live-pushes inCart changes to `items` automatically | ✓ (no extra wiring needed) |
| `groupByMarket` used on `pending` only, not `inCartItems` | ✓ |
| `updateDoc` — does NOT trigger `recomputeTrip` | ✓ emulator test #4 confirms |

### 7. Scope Creep

No undefined modules introduced. No new Firestore index. No rules change. No new plugin. ✓

---

**PASS** ✓ — All Must-Have and Should-Have requirements met. Data layer, UI wiring, and integration all verified green.
