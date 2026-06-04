# Architecture Context: additem-ui-wiring

## Classification
Brownfield / Trivial — single-file change to `src/routes/AddItem.svelte`. All logic already exists in tested modules; this is wiring only.

## Existing Code (touched/relevant)

- `src/routes/AddItem.svelte`: The item add/edit form. Already imports and uses `isScanAvailable`, `scanBarcode`, `resolveScannedCode` for barcode. Scan button is rendered at lines 148–150 guarded by `{#if scanAvailable}`. State pattern: `let scanAvailable = $state(false); isScanAvailable().then(v => scanAvailable = v)`. The voice wiring must mirror this pattern exactly.
- `src/lib/voice/capture.ts`: `isVoiceAvailable(): Promise<boolean>` + `captureTranscript(): Promise<string | null>`. Same null-safe contract as scanBarcode.
- `src/lib/voice/parse.ts`: `parseVoiceInput(transcript, { searchLibrary }): VoiceParseResult` — returns `{ itemName, qty, unit, price, matchedItem }`.
- `src/lib/state/library.svelte.ts`: exports `searchLibrary(query): Item[]` — the offline-safe library search. Already available in the module graph.

## Tech Debt & Scalability
- No debt worsened. The barcode scan button is the direct template for the mic button.
- The `isVoiceAvailable()` async init pattern (`$state(false)` + `.then()`) is already used for barcode. Reuse it.

## Infra Needs
- None. No Firestore reads/writes, no new indexes, no rules changes, no Capacitor plugin to add (already installed in package.json).

## Architectural Decisions (confirmed)
- **Pattern**: Mirror the scan button exactly — `voiceAvailable` $state(false), `isVoiceAvailable().then(v => voiceAvailable = v)`, `{#if voiceAvailable}` guard, `onVoice()` async handler.
- **Prefill behavior**: if `matchedItem` → call `pick(matchedItem)` to reuse the existing pick path (lastPrice prefill, unit seeding); if no match but `itemName` non-empty → set `newName = result.itemName` to drop into the new-item form. qty/unit/price override the defaults after pick.
- **Graceful null**: if `captureTranscript()` returns null → no-op (no error, no state change). Same as scan.
- **Button position**: render mic button beside/below scan button in the item-picker phase (before an item is selected), inside the existing `{#if !item && !newName}` block.

## Constraints for Spec
- Single file only: `src/routes/AddItem.svelte`. No new files, no new modules.
- Must not break existing scan flow or any existing state.
- The voice button must be hidden on web/dev (guarded by `voiceAvailable`).
- `searchLibrary` is imported from `'../lib/state/library.svelte'` — already in the module graph via ItemPicker.
- RIGHT-SIZING: TRIVIAL. Skip parallel module machinery. Build inline.
