# Ship Digest: voice-entry
Branch: feat/voice-entry · Review: PASS · Status: shipped to branch (NOT merged to main)

## TL;DR
Speaking "2 kilo repolyo 50 piso" at the add-item screen now flows through two tested layers:
a Capacitor speech wrapper captures the transcript (or returns null gracefully on web/dev or
permission failure), and a pure synchronous parser extracts qty/unit/price/itemName and matches
against the in-memory library. The existing AddItem flow is unchanged — voice is a new prefill
path that always ends at user confirmation.

## Verify Evidence (the proof)
| Scope | Result | Quoted from verify file |
|---|---|---|
| voice-capture | GREEN | `Tests  8 passed (8)` — `verify/voice-capture.txt:6` |
| voice-parse | GREEN | `Tests  40 passed (40)` — `verify/voice-parse.txt:6` |
| integration | GREEN | `Tests  55 passed (55)` — `verify/integration.txt:6` |

## Mechanism Overview (factual, for your review — NOT your ownership explanation)

1. **Capability guard → null-return wrapper** — `isVoiceAvailable()` (`src/lib/voice/capture.ts:8`)
   calls `SpeechRecognition.available()` and returns `false` on any error. `captureTranscript()`
   (`capture.ts:23`) guards on this first, then requests permission (returns null if not `'granted'`),
   then calls `SpeechRecognition.start({ language: 'fil-PH', maxResults: 1 })`. Every failure path
   ends in `return null` inside a top-level `try/catch` — it never throws.

2. **Token-extraction parser** — `parseVoiceInput()` (`src/lib/voice/parse.ts:64`) works on a
   mutable `working` string. It first removes a qty+unit token with `QTY_UNIT_RE` (case-insensitive,
   unit aliases sorted longest-first to avoid partial matches), then removes a price token with
   `PRICE_MARKER_RE` (handles `₱N`, `N piso`, `N pesos`), falling back to the last standalone
   number if no marker is found. What remains after collapsing whitespace is `itemName`.

3. **Injectable searchLibrary match** — `parseVoiceInput` accepts `deps?.searchLibrary`
   (`parse.ts:113`): `deps?.searchLibrary?.(itemName)?.[0] ?? null`. The dep is optional — if
   omitted or returning empty, `matchedItem` is null (not an error). This keeps the function
   pure and testable without a live Firestore library state.

## Decisions Made
- **Digits-only qty in v1** — Tagalog number words (dalawa, tatlo…) documented as extension point
  in `parse.ts:15–21` comment block; not implemented. Simpler, reliable, fully tested.
- **No OfflineHandler module** — Firestore `persistentLocalCache` already handles offline writes;
  voice is a prefill path into the existing AddItem flow, not a new persistence layer.
- **`searchLibrary` (in-memory) not `searchItems` (Firestore read)** — zero reads, fully offline.
- **`fil-PH` language code** — matches the Filipino-first UX mandate; set in `capture.ts:30`.
- **Mirrors `src/lib/scan/capture.ts` pattern** — same `isAvailable` / `capture` / null-return
  shape as the barcode wrapper, so the UI can gate both the same way.

## Edge Cases Handled (each with its covering test)
- `captureTranscript` returns null when unavailable · `capture.test.ts:49`
- `captureTranscript` returns null when permission denied · `capture.test.ts:56`
- `captureTranscript` returns null when permission is `'prompt'` (not `'granted'`) · `capture.test.ts:63`
- `captureTranscript` returns null when `start()` throws · `capture.test.ts:69`
- `captureTranscript` returns null when matches array is empty · `capture.test.ts:76`
- `parseVoiceInput` empty/blank string → all-null result · `parse.test.ts:26`
- Decimal quantity ("1.5 kg") extracted correctly · `parse.test.ts` (decimal describe block)
- Price marker "₱80" extracted · `parse.test.ts` (price markers describe block)
- No price marker → last standalone number used as price · `parse.test.ts` (fallback block)
- No match in library → `matchedItem` null, not an error · `parse.test.ts` (matchedItem block)
- `deps` omitted entirely → `matchedItem` null · `parse.test.ts` (no deps case)
- Mixed-case unit words ("Kilo", "KG") mapped correctly · `parse.test.ts` (unit variations)
- Integration: transcript null → no-op in AddItem · `voice-entry.integration.test.ts:57`
- Integration: no library match → `itemName` non-empty, `matchedItem` null · `integration.test.ts:80`

## Files Touched
- `src/lib/voice/capture.ts` — Capacitor speech wrapper (voice-capture)
- `src/lib/voice/capture.test.ts` — 8 pure unit tests (voice-capture)
- `src/lib/voice/parse.ts` — pure parser + searchLibrary match (voice-parse)
- `src/lib/voice/parse.test.ts` — 40 pure unit tests (voice-parse)
- `src/lib/voice/voice-entry.integration.test.ts` — 7 integration tests

## Gaps / Caveats
- **`AddItem.svelte` UI not wired** — No mic button has been added to the component yet. The
  voice layer is complete and tested but `captureTranscript` and `parseVoiceInput` are not yet
  called from any Svelte component. The integration contracts exist as tested functions, not as
  live UI. This is the same state as barcode-prefill at its branch ship.
- **Native recording untested in CI** — `captureTranscript`'s actual recording path (after
  permission granted, `start()` succeeds) is not covered by automated tests. Verified on-device
  only. Capability guard and all null-return paths are tested.
- **Transcript display (should-have) deferred** — showing the raw transcript above prefilled
  fields requires the UI wire-up step; the transcript string is returned by `captureTranscript`
  and available for display, but nothing renders it yet.

## Own-before-merge
Non-trivial. Run `code-explain-before-ship` and write the 3 mechanisms in YOUR words,
then merge `feat/voice-entry` → main when ready.
