# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ListaJuan is a mobile, offline-first grocery-tracking app for a **single** Filipino household manager who has difficulty using apps. She logs market trips, reuses an item library, checks an item's last price, sees per-trip totals, and compares this month's spend to last. Built one-handed, at home, often offline at the market.

Design philosophy is **accessibility-first**: recognition over recall, one decision per screen, forgiving input. There is exactly **one confirmation dialog in the entire app** (delete trip); everything else is inline edit or swipe-with-undo. Filipino-first copy throughout. No emoji in the shipped UI — use a single bundled vector icon set (see spec "Iconography & assets").

The authoritative documents are:
- Design spec: `docs/superpowers/specs/2026-06-01-listahan-v1-design.md`
- Implementation plan (foundation/data layer): `docs/superpowers/plans/2026-06-01-listahan-foundation-data-layer.md`

Read the spec before making product/UX decisions; it records resolved choices (e.g. trip logging uses the one-thing-at-a-time stepper, not a bottom sheet; the item library leads with recognition tiles, search is the fallback).

## Stack

Svelte 5 (runes) + Vite + TypeScript, wrapped by Capacitor 8 for Android/iOS. Persistence is the **Firebase Web SDK** (Auth + Firestore client SDK) directly — **there is no API server, and we are not adding one.** The "backend" is Firestore Security Rules (`firestore.rules`) + Firebase Auth (anonymous, upgradeable to Google later).

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # production build → dist/ (Capacitor's webDir)
npm test               # pure unit tests only (excludes *.emulator.test.ts)
npm run test:emulator  # data-layer tests against the Firestore emulator
npm run test:all       # everything
npx tsc --noEmit       # type-check
npx vitest run path/to/file.test.ts          # a single test file
npx vitest run -t "test name substring"      # a single test by name
```

`test:emulator` runs via `firebase emulators:exec`, which boots Auth (:9099) and Firestore (:8080) around the test run. **The Firestore emulator requires a Java runtime** — if emulator tests fail to start, check that Java is installed.

Native shells:
```bash
npm run build && npx cap sync     # push the web build into native projects
npx cap add android               # one-time, creates android/ (gitignored)
```

## Architecture — the load-bearing rules

**1. All Firebase access is isolated behind `src/lib/data/`.** Components MUST NOT import `firebase/firestore` directly — they import functions and stores from the data layer (`createDraftTrip`, `saveTrip`, `searchItems`, `priceHistory`, `findItemByBarcode`, `attachBarcode`, etc.). This keeps components framework-pure and testable and keeps the one piece of real logic in one place.

**2. Pure calculations live in `src/lib/domain/calc.ts`** (totals, price-per-unit, month delta) with no Firebase — plain Vitest unit tests. Types live in `src/lib/domain/types.ts`.

**3. Offline-first is mandatory and explicit.** `src/lib/data/firebase.ts` initializes Firestore with `persistentLocalCache` (NOT on by default). Writes hit IndexedDB first and resolve optimistically — never block the UI on the network, never show spinners on writes. This is what makes logging at the market (offline) work.

### Data model

Everything is scoped under `/users/{uid}/…` so Security Rules are trivial and a future multi-account/household migration is a clean subtree move.

```
/users/{uid}/items/{itemId}                          the library (denormalized)
/users/{uid}/trips/{tripId}                          one per shopping trip
/users/{uid}/trips/{tripId}/tripItems/{tripItemId}   source of truth for price history
```

**The one non-trivial operation is the save fan-out** (`saveTrip` in `src/lib/data/trips.ts`): on save, a single batched write marks the trip saved with its computed total/itemCount, and for each tripItem upserts its parent item's denormalized `lastPrice`/`lastPriceUnit`/`lastPriceDate`/`lastVendor` and increments `purchaseCount`. The denormalized `lastPrice` is what makes autocomplete show last price in one read per result.

**Price history** uses a **collectionGroup query on `tripItems` where `uid == me AND itemId == X` ordered by `tripDate`** (`priceHistory` in `trips.ts`). The `uid` clause is mandatory — Firestore rejects a collectionGroup query whose rule checks `resource.data.uid` unless the query constrains `uid` — so each tripItem denormalizes `uid` (and `tripDate`) for this purpose. It depends on the composite index `(uid, itemId, tripDate desc)` in `firestore.indexes.json` AND a dedicated collectionGroup read rule in `firestore.rules` (the nested `/users/{uid}/{document=**}` rule does NOT cover collectionGroup queries). The emulator auto-creates indexes, but the index + rules must be deployed for production.

**Emulator tests run serially** (`--no-file-parallelism`): they share one emulator and each clears the whole DB in `beforeEach`, so parallel test files would wipe each other.

### Voice entry (feat/voice-entry)

Speak "2 kilo repolyo 50 piso" → prefills item name, qty, unit, and price in AddItem for one-tap confirmation.

- **`src/lib/voice/capture.ts`** — `isVoiceAvailable()` + `captureTranscript()`: Capacitor `@capacitor-community/speech-recognition` wrapper; returns `null` on web/dev, permission denied, or any error. Language: `fil-PH`. Mirrors `src/lib/scan/capture.ts` pattern.
- **`src/lib/voice/parse.ts`** — `parseVoiceInput(transcript, deps?)`: pure synchronous function. Extracts qty (digits only, v1), unit (mapped to `Unit` type via `UNIT_MAP`), price (`₱N`, `N piso/pesos`, or fallback last-number), and `itemName` (remaining text). Calls `deps.searchLibrary(itemName)[0]` for `matchedItem`. Tagalog number words (dalawa, tatlo…) documented as extension in comment block — NOT implemented.
- Tests: `src/lib/voice/capture.test.ts` (8 pure), `src/lib/voice/parse.test.ts` (40 pure), `src/lib/voice/voice-entry.integration.test.ts` (7 integration).
- UI wiring (mic button in AddItem.svelte) is **not yet done** — voice layer only.

### Barcode prefill (feat/barcode-prefill)

Three-tier scan flow: library-first offline match → Open Food Facts API fallback → silent manual entry.

- **`src/lib/data/items.ts`** — `findItemByBarcode(db, uid, code)` (client-side filter, offline-safe) and `attachBarcode(db, uid, itemId, code)` (idempotent append). `Item` carries `barcodes: string[]` (`src/lib/domain/types.ts`).
- **`src/lib/scan/lookup.ts`** — `lookupProductName(code, deps?)`: Open Food Facts fetch wrapper; never throws; offline/not-found/error → `null`. `fetch` is injectable for testing.
- **`src/lib/scan/capture.ts`** — `isScanAvailable()` + `scanBarcode()`: Capacitor `@capacitor-mlkit/barcode-scanning` wrapper; returns `null` on web/dev or permission denied.
- Tests: `src/lib/data/items.barcode.emulator.test.ts` (5 emulator tests), `src/lib/scan/lookup.test.ts` (6 pure unit tests).
- UI wiring (Scan button, prefill field) is **not yet done** — data/scan layer only.

## Testing conventions

- `*.test.ts` — pure, no Firebase, run by `npm test`.
- `*.emulator.test.ts` — exercise the data layer against the emulator; use the helper in `src/lib/data/testing/emulator.ts` (`setupEmulator`/`teardownEmulator`/`clearFirestore`). Clear Firestore in `beforeEach`.
- This project uses TDD: write the failing test, see it fail, implement minimally, see it pass, commit. The plans are written this way — follow them step-by-step.

## Conventions

- Filipino-first labels in the UI; English only as a translation reference, never shipped.
- Prices/quantities ≥20px, body ≥16px, tap targets ≥44×44pt.
- `.env` holds Firebase web config and is gitignored; copy `.env.example`. `VITE_USE_EMULATOR=true` routes the SDK to local emulators.
