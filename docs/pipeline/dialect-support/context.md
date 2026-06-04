# Architecture Context: dialect-support

## Classification
Brownfield — extends the shipped voice-entry feature; touches `capture.ts`, `parse.ts`, and `AddItem.svelte`.

## Existing Code (touched/relevant)

### `src/lib/voice/capture.ts`
- `captureTranscript(): Promise<string | null>` — single hardcoded `language: 'fil-PH'` at line 29 inside `SpeechRecognition.start({ language: 'fil-PH', ... })`.
- To support dialect selection this function needs a `language` parameter with `'fil-PH'` as default.
- `isVoiceAvailable()` is unaffected — language-agnostic.

### `src/lib/voice/parse.ts`
- `UNIT_MAP: Record<string, Unit>` — flat map of spoken alias → canonical `Unit`. Already mixes English and Tagalog: `grams`, `piece`, `pieces`, `pcs`, `dozen` are already present.
- Strategy: **additive flat map** — just append Bisaya/Ilocano synonyms. No per-language branching needed; unit words across these dialects don't conflict with each other.
- `UNIT_PATTERN` and `QTY_UNIT_RE` are auto-derived from the map keys — no changes needed there.

### `src/routes/AddItem.svelte`
- Mic button lives at line 171–173 inside the `!item && !newName` block (`capture-row` div).
- `captureTranscript()` called at line 126 in `onVoice()` with no arguments.
- Dialect selector belongs in the same capture-row block; `captureTranscript(lang)` needs to be called with the selected dialect.

## Tech Debt & Scalability
- No debt worsened — the flat UNIT_MAP is the correct architecture; adding keys is additive.
- Scalability: Chrome Web Speech API has no native `ceb-PH` or `ilo-PH` BCP-47 code. Supported codes are `fil-PH` and `en-PH` (Philippines). Bisaya/Ilocano speakers use one of these two codes — the UNIT_MAP expansion still helps because the engine will transcribe phonetically and unit words like "piso" / "gatosan" map correctly.
- Language pref in `localStorage` is correct scope — user preference, not per-trip data.

## Infra Needs
- None. No Firestore changes, no new indexes, no security rule changes.

## Architectural Decisions (confirmed / derived from codebase)

- **UNIT_MAP structure**: keep flat `Record<string, Unit>`, append Bisaya/Ilocano synonyms — the map is already dialect-mixed (English + Tagalog); no restructuring required.
- **BCP-47 codes to support**: `fil-PH` (Tagalog), `en-PH` (English), `ceb-PH` mapped to `fil-PH` for speech engine (Chrome doesn't support `ceb-PH`; `fil-PH` gives best phonetic coverage for Cebuano), `ilo-PH` mapped to `fil-PH` similarly. Selector labels are user-facing ("Tagalog", "Bisaya", "Ilocano", "English") — engine code is an implementation detail.
- **New module `src/lib/voice/lang.ts`**: exports `DIALECT_OPTIONS` (label + BCP-47 code), `getDialect()` / `setDialect()` (localStorage-backed). Keeps capture.ts and AddItem.svelte clean.
- **`captureTranscript(lang?: string)`**: add optional `language` param, default `'fil-PH'`. Backward-compatible — existing tests pass unchanged.
- **Dialect selector in AddItem.svelte**: `<select>` above or alongside mic button in the `capture-row` block; reads/writes `getDialect()`/`setDialect()`.

## Constraints for Spec
- Filipino-first UI labels; dialect selector labels should be in their own language (e.g. "Bisaya", "Ilocano") or a natural label the user recognises.
- Tap target ≥ 44 × 44 pt for the dialect selector.
- `captureTranscript` must remain backward-compatible (default `'fil-PH'`) — existing tests must not need changes.
- No Firestore write for dialect preference — localStorage only.
- The UNIT_MAP addition must not break existing `parse.test.ts` tests.
