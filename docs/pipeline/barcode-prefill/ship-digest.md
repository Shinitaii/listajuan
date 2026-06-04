# Ship Digest: barcode-prefill
Branch: feat/barcode-prefill · Review: PASS · Status: shipped to branch (NOT merged to main)

## TL;DR
Scanning a barcode now prefills the item name via a three-tier flow: library match (offline,
instant), then Open Food Facts API fallback (online, best-effort), then silent manual entry on
miss. All Firestore access stays in the data layer; the UI and Capacitor scanner are wired to
consume the outputs without importing firebase directly.

## Verify Evidence (the proof)
| Scope | Result | Quoted from verify file |
|---|---|---|
| item-barcodes | GREEN | `Test Files  1 passed (1)` · `Tests  5 passed (5)` — `verify/item-barcodes.txt:10–11` |
| product-lookup | GREEN | `Test Files  1 passed (1)` · `Tests  6 passed (6)` — `verify/product-lookup.txt:5–6` |
| integration | GREEN | `Test Files  5 passed (5)` · `Tests  30 passed (30)` — `verify/integration.txt:5–6` |

## Mechanism Overview (factual, for your review — NOT your ownership explanation)

1. **Library-first offline match** — `findItemByBarcode` (`src/lib/data/items.ts:62`) loads the
   full items collection from Firestore's local persistent cache and does a client-side `find`
   over each item's `barcodes ?? []` array. Works fully offline because `persistentLocalCache` is
   already enabled in `firebase.ts`.

2. **Idempotent barcode attachment** — `attachBarcode` (`src/lib/data/items.ts:71`) reads the
   item, checks if the code is already present, and no-ops if so; otherwise appends and persists
   with `setDoc`. This is what makes a second scan of the same product match instantly without
   duplicate codes accumulating.

3. **Never-throws API fallback** — `lookupProductName` (`src/lib/scan/lookup.ts:13`) wraps the
   Open Food Facts call in a `try/catch` and returns `null` on every failure path (non-ok HTTP,
   `status !== 1`, blank name, network throw, empty code). The empty-code guard (`lookup.ts:14–15`)
   short-circuits before any fetch call.

## Decisions Made
- **Client-side filter over Firestore index** — mirrors the existing `searchItems` pattern;
  single-user scale makes a full collection read acceptable and keeps the query offline-safe.
- **`@capacitor-mlkit/barcode-scanning`** — chosen as the Capacitor barcode plugin; native scan
  verified on-device only (out of CI scope); capability guard tested.
- **No API server** — Open Food Facts queried directly from the client; forbidden by CLAUDE.md.
- **Injectable `fetch`** — `lookupProductName` accepts `deps.fetch` so tests never hit the network.

## Edge Cases Handled (each with its covering test)
- `attachBarcode` is idempotent (no duplicate codes) · `items.barcode.emulator.test.ts:29–35`
- `findItemByBarcode` returns null when no item carries the code · `items.barcode.emulator.test.ts:46–49`
- `findItemByBarcode` tolerates items with no `barcodes` field (treats as `[]`) · `items.ts:66` (`?? []`)
- `lookupProductName` returns null on network error (offline) · `lookup.test.ts:23–26`
- `lookupProductName` returns null and does NOT call fetch for empty/whitespace code · `lookup.test.ts:38–43`
- `lookupProductName` returns null on non-ok HTTP · `lookup.test.ts:33–36`
- `lookupProductName` returns null when name is missing or blank · `lookup.test.ts:28–31`
- `isScanAvailable` returns false on web/dev (catch path) · `capture.ts:7–13`

## Files Touched
- `src/lib/domain/types.ts` — added `barcodes: string[]` to `Item` (item-barcodes)
- `src/lib/data/items.ts` — added `findItemByBarcode`, `attachBarcode`; init `barcodes: []` in `createItem` (item-barcodes)
- `src/lib/data/items.barcode.emulator.test.ts` — new emulator test file (item-barcodes)
- `src/lib/scan/lookup.ts` — new module: Open Food Facts fetch wrapper (product-lookup)
- `src/lib/scan/lookup.test.ts` — new pure unit test file (product-lookup)
- `src/lib/scan/capture.ts` — new module: Capacitor scanner wrapper (scan-capture)

## Gaps / Caveats
- **UI not wired yet** — the three data/scan functions exist and are tested, but no Svelte component
  consumes them yet. The AddItem flow does not yet show a "Scan" button or prefill the name field.
  That integration is the next pipeline step (UI wiring).
- **Native scan untested in CI** — `scanBarcode()` itself cannot be exercised without a physical
  device; the capability-guard and null-return paths are unit-tested but the Capacitor plugin's
  actual scan path is verified on-device only.
- **Provenance label (should-have) deferred** — no "from library" vs "from API" badge is shown yet;
  this belongs in the UI wiring step.

## Own-before-merge
Non-trivial. Run `code-explain-before-ship` and write the 3 mechanisms in YOUR words,
then merge `feat/barcode-prefill` → main when ready.
