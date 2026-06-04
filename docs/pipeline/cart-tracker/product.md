# Cart Tracker

## Problem
While shopping, the user has no way to distinguish items already in the cart from items still to be picked up. She re-reads the whole list repeatedly to find what's left — slow, error-prone, exhausting one-handed with a basket. When she or a family member adds an item mid-trip, it blends invisibly into the list, making "just added" items easy to miss.

## Stakeholders
| Role | Friction | Effort they'll accept |
|---|---|---|
| Nanay (household manager) | Re-reads full list to find unpicked items; misses newly added items | One tap per item; no new screens |
| Family member adding mid-trip | Added item looks identical to existing items | Nothing extra — just add as usual |
| Builder | Ship without new infra or plugins | Brownfield 3-file change |

## Core Feature
Tap an item row → it moves to a "Na sa cart na" (Done) section at the bottom. Tap again → moves back to Pending. At a glance: top = still need to find, bottom = already in the cart.

## Must-Have
- Tap anywhere on the item row (not a tiny icon) to toggle in-cart state
- **Pending section** (top): items not yet in cart, in original market groups
- **"Na sa cart na" section** (bottom): all in-cart items collapsed together, visually muted / struck-through label
- Toggle is instant (optimistic, offline-first — no spinner, no network wait)
- Persisted to Firestore (`inCart` field on TripItem) so the state survives app backgrounding
- Only visible/active on **draft trips** — saved trips have no cart toggle
- Filipino labels: pending header "Listahan", done header "Na sa cart na"
- Backward-compatible: existing TripItem docs with no `inCart` field render as pending

## Should-Have
- **"Bagong dagdag" (recently added) badge**: small indicator on items added in the last 5 minutes. Uses `addedAt` timestamp already on every TripItem — no schema change. Helps the user spot what a family member just added.
- Item count in each section header: "Listahan (4)" / "Na sa cart na (3)"

## Won't-Have
- Swipe-to-cart gesture (tap is enough for v1; swipe conflicts with scrolling on mobile)
- Sorting within the pending section by anything other than market group
- Cart state on saved trips (meaningless once a trip is saved)
- Bulk "check all" / "uncheck all"
- Sound/haptic on toggle (Capacitor Haptics is a separate dependency)
- Any server-side aggregation of `inCart` (it's display-only, never queried server-side)

## Success Metrics
- User can identify unpicked items without scrolling past checked-off items (qualitative: UX passes the "at a glance" test)
- Toggle roundtrip is imperceptible — Firestore optimistic write means no latency between tap and visual update
- All existing tests stay green; no `recomputeTrip` triggered by cart toggle

## Architecture Notes (binding — from context.md)
- `inCart?: boolean` added to `TripItem` in `types.ts` (optional, backward-compat)
- New `toggleCartItem(db, uid, tripId, tripItemId, inCart: boolean)` using `updateDoc` — does NOT call `recomputeTrip` (cart state doesn't affect totals)
- Trip.svelte splits `items` into two derived lists: `pending = items.filter(i => !i.inCart)` and `inCartItems = items.filter(i => i.inCart)`. Pending keeps `groupByMarket`; done section is a flat list.
- "Recently added" badge: `Date.now() - ti.addedAt < 5 * 60 * 1000` — pure derived value, no schema change
- No new Firestore index, no rules change, no new plugin

## Effort
**Small** — 3 files (types.ts, trips.ts, Trip.svelte) + 1 test addition. Estimated: half a day.
