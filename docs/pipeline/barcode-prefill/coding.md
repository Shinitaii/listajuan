# Coding Design Spec: Barcode → Name Prefill

## Tech Stack Decisions
- Svelte 5 + Capacitor 8 + Firestore client SDK (existing). No new server (forbidden).
- Tests: **Vitest** — pure `*.test.ts`; data-layer `*.emulator.test.ts` (Firestore emulator, Java).
- Barcode scanning: a Capacitor barcode-scanning plugin (infra step below).
- External lookup: Open Food Facts public REST, called from the client, best-effort only.

## Modules

1. **item-barcodes** (data layer — the library-first core)
   - Purpose: store barcodes on library items and look an item up by code, fully offline.
   - Owns: `barcodes: string[]` on `Item`; `findItemByBarcode(db, uid, code)`; `attachBarcode(db, uid, itemId, code)`.
   - Files: `src/lib/domain/types.ts` (add field), `src/lib/data/items.ts` (add functions),
     `src/lib/data/items.barcode.emulator.test.ts` (new test file — do NOT edit existing items.emulator.test.ts)
   - Dependencies: none.
   - Tech: Firestore client SDK; follows the `searchItems` client-side-filter pattern.

2. **product-lookup** (API cold-start fallback)
   - Purpose: best-effort external name suggestion for an unknown barcode.
   - Owns: `lookupProductName(code, deps?)` → `string | null`; offline/not-found/error all → `null`.
   - Files: `src/lib/scan/lookup.ts`, `src/lib/scan/lookup.test.ts` (new; mock `fetch`)
   - Dependencies: none (pure, injectable fetch).
   - Tech: `fetch` (Open Food Facts); Vitest unit with mocked fetch.

3. **scan-capture** (Capacitor wrapper)
   - Purpose: trigger a scan; detect capability (no camera in web/dev → graceful absence).
   - Owns: `isScanAvailable()`; `scanBarcode()` → `string | null`.
   - Files: `src/lib/scan/capture.ts`, `src/lib/scan/capture.test.ts` (new; capability-logic test)
   - Dependencies: barcode plugin (infra).
   - Tech: Capacitor plugin. NOTE: native scan itself is verified on-device, not in CI; the
     capability guard + the no-camera fallback path ARE unit-tested.

## Module Dependencies
scan-capture (code) → item-barcodes.findItemByBarcode (library first)
                    → product-lookup.lookupProductName (only if unmatched + online)

## Infra Steps (non-code — from context.md)
- Install a Capacitor barcode-scanning plugin + `npx cap sync`. Verify: plugin resolves, build
  passes. (Native on-device scan is out of pipeline test scope.)

## Integration Points (output → input contracts)
- `scanBarcode()` → `string | null` (the raw code)
- `findItemByBarcode(code)` → `Item | null` (library hit)
- `lookupProductName(code)` → `string | null` (cold-start suggestion)
- AddItem flow consumes: code → matched Item (prefill name) | suggested name (new item) | manual.

## Constraints & Rules
- Data-layer isolation: all Firestore access stays in `src/lib/data/`; components never import firebase.
- Offline-first: scan + library match work offline; only `product-lookup` touches network, best-effort, never blocking.
- Recognition-over-recall, Filipino-first UI, tap targets ≥44pt (applies at integration/UI).

## Project Context
- Framework: Svelte 5 (runes) + Vite + Capacitor 8
- Data layer pattern: functions in `src/lib/data/`, types in `src/lib/domain/types.ts`
- Testing: Vitest; TDD is house style (failing test → minimal impl → green)
