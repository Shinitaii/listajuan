# Listahan v1 — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning

## Overview

Listahan is a mobile grocery-tracking app for a single Filipino household manager.
She logs market/grocery trips, reuses a personal item library with autocomplete,
checks what an item cost last time, sees a per-trip total, and compares this
month's spend to last month. Used one-handed, at home, often tired after the
market, and plausibly offline — so the product is thumb-driven, forgiving, and
offline-first.

Reference wireframes and product brief:
`C:\Users\rgvil\coding-projects\extracted-zips\design_handoff_listahan_grocery`
(lo-fi only — use for layout, hierarchy, copy, and flow; do not copy the sketch
styling, emoji icons, or dummy data).

## Stack

- **Svelte 5** (runes) + **Vite** — web app.
- **Capacitor 6** — wraps the built web bundle into Android/iOS.
- **Firebase Web SDK** — Auth + Firestore client SDK. **No API server.**

### Why no API

A server in front of Firestore would add overhead with no payoff for this app:
no secrets to hide, trivial client-side math, single user, no write contention.
Worse, it would break Firestore's offline persistence — the core "log at the
market while offline" scenario. The real backend is **Firestore Security Rules**
+ **Firebase Auth**.

## Architecture

```
Svelte 5 (runes) components
        │  consume reactive stores; never import firebase/firestore directly
        ▼
  Data layer  (src/lib/data/*)  ──►  Firebase Web SDK (Auth + Firestore)
        │                                   │
   stores wrapping                    persistentLocalCache (IndexedDB)
   Firestore listeners                offline-first; syncs when online
        ▼
  Capacitor 6 native shell
```

**Data-layer isolation is the central architectural rule.** All Firebase access
lives behind `src/lib/data/`. Components import functions/stores
(`createTrip()`, `saveTrip(trip)`, `itemsStore`) — never `firebase/firestore`.
Benefits: components stay framework-pure and testable; the denormalization
fan-out lives in one place; Firestore listeners are wrapped in Svelte 5
stores/runes so the UI is reactive to cache + remote changes automatically.

## Authentication & durability

- **Anonymous auth** at first launch — no login screen, zero friction.
- **Linkable later:** data model and a future "back up my data" flow let her
  link a Google account without losing data (Firebase anon → Google upgrade).
- Security rules require auth; anonymous satisfies this.

## Data model

All collections scoped under `/users/{uid}/…` — makes Security Rules trivial
(`request.auth.uid == uid`), keeps a future account-link/export a clean subtree
copy, and leaves a clean path to multi-account/household later
(`/users/{uid}` → `/households/{hid}` with a members array; subtree unchanged).

```
/users/{uid}                          profile, anon/linked status, prefs
/users/{uid}/items/{itemId}           the library (denormalized for autocomplete)
/users/{uid}/trips/{tripId}           one per shopping trip
/users/{uid}/trips/{tripId}/tripItems/{tripItemId}
```

### Item (`/users/{uid}/items/{itemId}`)

Denormalized so autocomplete needs one read per result.

```
{ id, canonicalName, aliases: string[], category, defaultUnit,
  lastPrice, lastPriceUnit, lastPriceDate, lastVendor,
  purchaseCount, nameLower }   // nameLower for prefix search
```

`category` is a fixed short list: **karne, gulay, condiments, bigas, iba pa**.
Drives the "Saan napunta" analytics proportion bars.

### Trip (`/users/{uid}/trips/{tripId}`)

```
{ id, name, date, storeName, vendor?, notes?,
  status: 'draft' | 'saved', total, itemCount }
```

### TripItem (`…/tripItems/{tripItemId}`)

Source of truth for price history.

```
{ id, itemId, label, vendor?, quantity, unit,
  pricePaid, pricePerUnit, tripDate }   // tripDate copied for collectionGroup queries
```

## Core logic — the save fan-out

On `saveTrip()`, in a single Firestore **batched write**:

1. Set trip `status: 'saved'`, write computed `total` + `itemCount`.
2. For each tripItem, upsert its parent `/items/{itemId}` with new `lastPrice`,
   `lastPriceUnit`, `lastPriceDate`, `lastVendor`; increment `purchaseCount`.

This is the only non-trivial logic in the app and lives entirely in the data
layer.

## Reads & queries

- **Autocomplete (Screen 3):** prefix query on `items.nameLower` + alias match;
  each result already carries `lastPrice` (no per-row query).
- **Price history (Screen 4):** **collectionGroup query on `tripItems` where
  `itemId == X`**, ordered by `tripDate`. Requires one composite index
  (`firestore.indexes.json`). `tripDate` is copied onto each tripItem so the
  query needs no joins.
- **Monthly analytics (Screen 6):** query saved trips where `date` in
  [month start, end], sum `total`; group by category via tripItems. Client-side,
  no precomputation in v1.
- **Drafts / resume:** draft = a trip doc with `status:'draft'`. Offline cache +
  the doc means "resume unfinished trip" survives an app kill.

## Screen directions (resolved A/B/C)

**Design bias: accessibility-first.** The target user has a difficult time using
apps. We optimize for **recognition over recall** and **one decision per screen**,
accepting more taps per item as the cost of making every action unmissable. This
deliberately diverges from the README's efficiency-tuned recommendations.

- **Home — A layout, B's dominance:** month-at-a-glance (big spend number, delta
  chip, recent trips) plus B's "resume unfinished trip" row — but the
  "＋ Magsimula ng biyahe" start-trip control is a genuinely dominant card/button,
  not a thin bar, so starting a trip is the single most obvious target.
- **Log a Trip — C (one-thing-at-a-time):** full-screen steps (1 Item · 2 Dami ·
  3 Presyo) with huge targets and a big +/− stepper. This is the DEFAULT primary
  flow — most forgiving when tired. Running total always visible. (Log B's bottom
  sheet is NOT used in v1; revisit only if she outgrows the stepper.)
- **Item Library — C primary, A fallback:** recognition tiles (picture + name +
  last price, tap to add at last price, zero typing) are the PRIMARY way to add a
  regular item. Type-to-search autocomplete (A) is the fallback for new/rare
  items only — never the first thing she must do.
- **Price History — B:** giant last-price number + sparkline + receipts list.
- **Trip Summary — A:** receipt-style total card + itemized rows, inline edit.
- **Monthly Spend — A:** this-vs-last delta, two-bar compare, category bars
  (no pie charts, no percentages — low-numeracy friendly).

## Interaction & error-handling philosophy

- **Offline-first:** `initializeFirestore(app, { localCache: persistentLocalCache(...) })`
  — explicit; not on by default. Writes hit IndexedDB first, resolve
  optimistically. No spinners on writes. Reads render from cache instantly.
- **Forgiving input:** blank price allowed in draft; `pricePerUnit` computed only
  when both qty and price exist.
- **The only confirmation dialog in the whole app is trip-delete.** Everything
  else: inline edit (no confirmation), swipe-to-remove with undo.
- **Errors:** queued writes don't fail visibly offline. Surface only hard errors
  (permission/quota) as a quiet, dismissible toast — never a blocking modal.
  Error handling to be hardened progressively as features are built.
- **Language:** Filipino-first, consistent (per README copy list). Body ≥16px,
  prices/quantities ≥20px, hero numbers 40–48px. Tap targets ≥44×44pt.

## Iconography & assets

- **No emoji anywhere in the shipped app.** The wireframe emoji (🛒 🐔 🍅 …) are
  placeholders only; emoji render inconsistently across devices, read as
  unfinished/AI-generated, and feel out of place. Replace with a single coherent
  **vector icon set** (one library, consistent stroke weight) used everywhere:
  tab bar, list rows, buttons.
- **Category icons** (karne, gulay, condiments, bigas, iba pa) come from that
  same set — used on recognition tiles and analytics rows.
- **Recognition tiles depend on real, recognizable item visuals.** Tiles only
  beat typing if she identifies an item at a glance. Per-item imagery (a small
  curated set of icons/illustrations mapped by category, or a chosen icon per
  item) is a load-bearing asset decision for the Library screen — resolve the
  icon source before building Library C.
- Icon library choice is TBD at scaffold time; constraint: offline-bundled
  (no runtime CDN fetch), tree-shakeable, works inside the Capacitor web bundle.

## Testing

- **Data layer** unit-tested against the **Firestore emulator** — especially the
  save fan-out (item denorm correctness, batch atomicity) and the collectionGroup
  price-history query.
- **Pure helpers** (`domain/calc.ts`: totals, price-per-unit, month delta) —
  plain unit tests, no Firebase.
- **Components** stay thin (logic lives in the data layer) → light testing.

## Project structure

```
src/
  lib/
    data/        firebase.ts (init), auth.ts, trips.ts, items.ts
    domain/      calc.ts, types.ts
    components/  Stepper, ItemRow, TotalBand, ...
  routes/        Home, Log, Library, History, Summary, Gastos
  app.css
capacitor.config.ts
firestore.rules
firestore.indexes.json
```

## Out of scope for v1

- Any API/server backend.
- Multi-account / household sharing (model is forward-compatible, not built).
- Analytics beyond this-vs-last-month + category proportion bars.
- Production icons/fonts/assets (use design system when chosen).
```
