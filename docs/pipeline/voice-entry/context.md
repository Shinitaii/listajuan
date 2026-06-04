# Architecture Context: voice-entry

## Classification
Brownfield — touches existing `searchLibrary`, `AddItem.svelte`, and `Item`/`Unit` types; adds a
new Capacitor plugin dependency; slots a new input path alongside the existing barcode scan button.

## Existing Code (touched/relevant)

- **`src/lib/state/library.svelte.ts:searchLibrary`** — in-memory, offline-safe prefix filter over
  the loaded `_items` array. Voice parsing reuses this directly: no new data-layer read needed.
  Signature: `searchLibrary(query: string): Item[]`.

- **`src/lib/domain/types.ts:Unit`** — `'piraso' | 'dosena' | 'kg' | 'g' | 'L' | 'ml'`. Voice
  parsing must map spoken words ("kilo", "gramo", "piraso") to these exact values.

- **`src/routes/AddItem.svelte`** — the add-item UI. Already holds `newName`, `qty`, `unit`,
  `price` as `$state`. Already has `pick(item)` (fills item + seeds prefill) and `confirmNewItem()`
  (creates a new item). Barcode scan (the `onScan` + scan button) is the direct parallel for voice:
  voice slots in as a second prefill path at the same level. Voice does NOT need its own save path
  — it prefills these existing state vars and lets the user confirm.

- **`src/lib/scan/capture.ts`** — the barcode Capacitor wrapper pattern: `isScanAvailable()` +
  `scanBarcode()`, both returning `null` on web/dev. Voice capture follows the exact same pattern.

- **`src/lib/scan/resolveScan.ts`** — resolve-and-dispatch after a code is obtained. Voice has a
  simpler version: parse transcript → call `searchLibrary` → prefill or offer manual. No barcode
  attachment step.

## Tech Debt & Scalability
- **Stale doc:** `docs/coding-design-spec-voice-entry.md` is an early sketch with two errors:
  it references Jest (project uses Vitest) and includes an `OfflineHandler` module that is
  unnecessary — Firestore's `persistentLocalCache` already makes writes offline. This pipeline
  supersedes that doc; it does not need to be updated.
- **Scalability:** voice parsing is pure client-side regex; appropriate for v1 single-user scale.
  Tagalog number-word support (dalawa, tatlo…) is out of scope for v1 but should be noted in the
  coding spec as a planned extension point.

## Infra Needs
- Install `@capacitor-community/speech-recognition` + `npx cap sync`. Verify: plugin resolves,
  build passes. Native recording is out of pipeline test scope (same pattern as barcode).
- No schema changes, no new Firestore indexes, no security-rule changes.

## Architectural Decisions (confirmed with human)
- **Digits-only parsing in v1:** parse "2 kilo repolyo 50 pesos" but NOT "dalawang kilo repolyo".
  Tagalog number words are noted as a planned extension — the parsing module should document the
  extension point clearly. Chosen: simpler, reliable, well-tested. Tagalog words added later.
- **No OfflineHandler module:** voice is a prefill path into the existing AddItem flow, which is
  already offline-first. No new persistence, no sync queue.
- **`searchLibrary` reuse, not `searchItems`:** `searchLibrary` works against the already-loaded
  in-memory snapshot (fully offline, zero reads). `searchItems` does a Firestore read — unnecessary
  when the library state is already live.

## Constraints for Spec
- Two modules only: `voice-capture` (Capacitor wrapper) and `voice-parse` (pure parsing + match).
  No OfflineHandler.
- `voice-parse` must be a pure function with injectable `searchLibrary` dep for testability.
- Tests: Vitest (not Jest). `voice-parse` → pure `*.test.ts`; `voice-capture` → capability-guard
  unit test only (native recording not tested in CI, same as barcode capture).
- The `Unit` type is the exact target: spoken units must map to `'kg' | 'g' | 'L' | 'ml' |
  'piraso' | 'dosena'`. Document the Tagalog→Unit map as an extension table in the module.
- Voice button in `AddItem.svelte` sits alongside the barcode scan button — same gating pattern
  (`isVoiceAvailable()` guard, hidden on web/dev). Integration at this level is in scope for the
  pipeline (the UI wire-up for voice is simpler than barcode since parsing handles everything).
