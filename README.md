# ListaJuan

A mobile, offline-first grocery-tracking app for a single Filipino household manager. She logs market trips, reuses an item library, checks what an item cost last time ("magkano ang liempo nung huli?"), sees per-trip totals, and compares this month's spend to last.

Built **accessibility-first**: recognition over recall, one decision per screen, forgiving input, Filipino-first copy, large legible type. There is exactly **one confirmation dialog in the whole app** (delete trip) — everything else is inline edit or undo-friendly.

## Core loop

Log a grocery trip → items build a price history → check an item's last price → see monthly spend. Logging a price denormalizes onto the item so the next time you log it, the price is pre-filled (the first automation layer).

## Stack

- **Svelte 5** (runes) + **Vite** + **TypeScript** — web app
- **Capacitor 8** — wraps the web build into Android/iOS
- **Firebase Web SDK** (Auth + Firestore client SDK) — persistence, **offline-first** via `persistentLocalCache`
- **No API server.** The "backend" is Firestore Security Rules (`firestore.rules`) + Firebase Auth (anonymous, upgradeable to Google later). Shared/external data (e.g. future market-price feeds) may use Firebase Cloud Functions, but user data stays client-only.
- Charts: `layerchart`; icons: `lucide-svelte` (no emoji in the shipped UI)

## Getting started

Requires **Node 20+**, **npm**, and a **Java runtime** (the Firestore emulator needs it).

```bash
npm install
npm run dev                 # boots the Firebase emulators + Vite together
```

`npm run dev` runs against the **local emulators** — config comes from the committed `.env.development`, and the emulators are started for you (needs Java). First start takes ~15–20s.

To run against **real Firebase** instead: `cp .env.example .env.production`, fill in your project's `VITE_FIREBASE_*` values, then `npm run dev:prod` (dev server) or `npm run build` (production build). Enable Anonymous sign-in in the Firebase console. Deploy `firestore.rules` + `firestore.indexes.json` for production.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # production build → dist/ (Capacitor's webDir)
npm run preview        # preview the production build
npm test               # pure unit tests (excludes *.emulator.test.ts)
npm run test:emulator  # data-layer tests against the Firestore emulator
npm run test:all       # everything
npm run e2e            # Playwright end-to-end smoke (boots the emulator + a preview build)
npm run check          # svelte-check + type-check
```

Native shells:

```bash
npm run build && npx cap sync     # push the web build into native projects
npx cap add android               # one-time, creates android/ (gitignored)
npx cap run android               # build/run on a device or emulator
```

## Architecture (the load-bearing rules)

1. **All Firebase access is isolated behind `src/lib/data/`.** Components import functions/stores from the data layer (`createDraftTrip`, `saveTrip`, `searchItems`, `priceHistory`, …) — never `firebase/firestore` directly.
2. **Pure calculations live in `src/lib/domain/calc.ts`** (totals, price-per-unit, month delta) with no Firebase.
3. **Offline-first is mandatory and explicit** — writes hit IndexedDB first and resolve optimistically; no spinners on writes. This is what makes logging at the market (offline) work.
4. **Reactive state** lives in Svelte 5 runes in `src/lib/state/*.svelte.ts`, wrapping the data layer's live `onSnapshot` subscriptions.

### Data model

Everything is scoped under `/users/{uid}/…` so Security Rules are trivial and a future household migration is a clean subtree move.

```
/users/{uid}/items/{itemId}                          the library (denormalized)
/users/{uid}/trips/{tripId}                          one per shopping trip
/users/{uid}/trips/{tripId}/tripItems/{tripItemId}   source of truth for price history
```

The one non-trivial operation is the **save fan-out** (`saveTrip`): a single batched write marks the trip saved and updates each item's denormalized `lastPrice`/`purchaseCount`. Price history uses a **collectionGroup query** on `tripItems` (scoped by `uid`).

## Documentation

- Design spec: [`docs/superpowers/specs/2026-06-01-listahan-v1-design.md`](docs/superpowers/specs/2026-06-01-listahan-v1-design.md)
- Implementation plans: [`docs/superpowers/plans/`](docs/superpowers/plans/)
- Architecture & roadmap: [`docs/architecture-roadmap.md`](docs/architecture-roadmap.md)
- Contributor guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Working agreement for AI assistants: [`CLAUDE.md`](CLAUDE.md)

## Status

v1 core loop is complete and tested: trip logging, item library with autocomplete/recognition tiles, per-item price history, trip summary, and monthly Gastos.

**Shipped (feat/barcode-prefill + feat/voice-entry — pending merge to main):**
- Barcode → name prefill: scan a barcode to match a library item (offline) or fetch a name from Open Food Facts. Scan button wired in AddItem.
- Voice entry: speak "2 kilo repolyo 50 piso" to prefill item name, quantity, unit, and price. Mic button wired in AddItem.

**Shipped (feat/cart-tracker — pending merge to main):**
Cart tracker — during a draft trip, tap any item row to mark it as in-cart ("Na sa cart na"). The list splits into Pending (top, grouped by market) and Done (bottom, struck-through). Items added in the last 5 minutes show a "Bagong dagdag" badge. Saved trips are unchanged.

See `docs/architecture-roadmap.md` for the broader roadmap.
