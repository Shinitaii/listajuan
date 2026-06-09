# Ship Digest: dialect-support
Branch: feat/dialect-support · Review: PASS · Status: shipped to branch (NOT merged to main)

## TL;DR
Voice entry now supports four dialects: Tagalog, Bisaya, Ilocano, and English. A "Wika" dropdown
appears above the mic button when voice is available; the selection persists across sessions via
localStorage. Bisaya and Ilocano unit words (usa, gatosan, maysa, kilon, etc.) are now parsed to
canonical Unit values. All 120 tests pass; no existing behaviour changed.

## Verify Evidence (the proof)

| Scope | Result | Quoted from verify file |
|---|---|---|
| lang-config | GREEN | `Tests  10 passed (10)` — verify/lang-config.txt |
| unit-map-expansion | GREEN | `Tests  56 passed (56)` — verify/unit-map-expansion.txt |
| dialect-ui | GREEN | `Tests  109 passed (109)` — verify/dialect-ui.txt |
| integration | GREEN | `Tests  120 passed (120)` — verify/integration.txt |
| typecheck | PASS | `npx tsc --noEmit — PASS (no errors)` — verify/integration.txt:1 |

## Mechanism Overview (factual, for your review — NOT your ownership explanation)

1. **Dialect preference persistence** — `getDialect()` reads `localStorage.getItem('voice_dialect')`, returning `'fil-PH'` if absent or if localStorage throws; `setDialect(lang)` writes the key silently on error. Both wrapped in try/catch so a locked or absent storage never crashes. · `src/lib/voice/lang.ts:16–31`

2. **Lang forwarding to speech engine** — `captureTranscript(lang?: string)` replaced the hardcoded `'fil-PH'` with `lang ?? 'fil-PH'` at the `SpeechRecognition.start` call. Zero-arg callers are unaffected. AddItem passes `voiceLang` (a `$state` seeded from `getDialect()`) so the selected dialect flows through to the engine on every mic tap. · `src/lib/voice/capture.ts:29` · `src/routes/AddItem.svelte:128`

3. **UNIT_MAP expansion** — Six new keys appended to the flat `UNIT_MAP` in `parse.ts` (Bisaya: `usa`/`duha`→`'piraso'`, `gatosan`→`'g'`; Ilocano: `maysa`/`dua`→`'piraso'`, `kilon`→`'kg'`). `UNIT_PATTERN` is derived from `Object.keys(UNIT_MAP)` sorted longest-first, so it rebuilds automatically — `kilon` (5 chars) sorts before `kilo` (4 chars), preventing a partial-match collision. No existing key was modified. · `src/lib/voice/parse.ts:42–49`

## Decisions Made

- **Bisaya/Ilocano BCP-47 codes map to `fil-PH`** — Chrome Web Speech API has no `ceb-PH` or `ilo-PH` support; `fil-PH` gives the closest phonetic coverage. Selector labels (`Bisaya`, `Ilocano`) are user-facing; the engine code is an internal detail. (context.md: Architectural Decisions)
- **Flat UNIT_MAP, no per-language branching** — The map already mixed English and Tagalog; Bisaya/Ilocano units don't conflict with existing keys, so a flat additive approach avoids any per-dialect dispatch logic. (coding.md: unit-map-expansion)
- **localStorage only, no Firestore** — Dialect preference is a device-level user setting, not trip data. No Firestore write; no index; no security rule change. (context.md: Infra Needs — none)
- **`value={voiceLang}` + explicit `onchange`** — Svelte 5 runes require explicit side-effect handling; `bind:value` alone would not call `setDialect`. Controlled pattern used instead. (plans/dialect-ui.md: Review)

## Edge Cases Handled

- `getDialect()` when `localStorage` is absent or throws → returns `'fil-PH'` · `src/lib/voice/lang.test.ts:47–50`
- `setDialect()` when `localStorage.setItem` throws → silently no-ops, never throws to caller · `src/lib/voice/lang.test.ts:60–63`
- `captureTranscript()` with no argument → `lang ?? 'fil-PH'` ensures `'fil-PH'` passed to engine (backward-compat) · `src/lib/voice/capture.test.ts` (lang parameter describe block)
- `kilon` (Ilocano, 5 chars) sorted before `kilo` (4 chars) in `UNIT_PATTERN` → no partial-match collision · `src/lib/voice/parse.ts:44–48` + sort logic at line 44
- All 40 original Tagalog parse tests pass unchanged after UNIT_MAP additions · `verify/unit-map-expansion.txt`: `56 passed (56)` includes original 40

## Files Touched

- `src/lib/voice/lang.ts` — new (lang-config module: DIALECT_OPTIONS, getDialect, setDialect)
- `src/lib/voice/lang.test.ts` — new (10 tests)
- `src/lib/voice/parse.ts` — modified (6 UNIT_MAP entries appended, lines 42–49)
- `src/lib/voice/capture.ts` — modified (optional lang param, line 23 + 29)
- `src/lib/voice/parse.test.ts` — modified (6 Bisaya/Ilocano test cases appended)
- `src/lib/voice/capture.test.ts` — modified (2 lang-param tests appended)
- `src/lib/voice/dialect-support.integration.test.ts` — new (11 integration tests)
- `src/routes/AddItem.svelte` — modified (voiceLang $state, Wika selector, captureTranscript(voiceLang))

## Gaps / Caveats

- **No component-level render test for the Wika selector** — Svelte component testing in this project uses no DOM testing library (no `@testing-library/svelte`); the selector's presence is verified by code review of AddItem.svelte (lines 173–188) and the integration test confirms the captureTranscript(voiceLang) call path, but there is no programmatic assertion that the `<select>` element renders in a simulated DOM. This matches the project's existing pattern — no other Svelte components have render tests.
- **`duha` and `dua` both map to `'piraso'`** — these are "two pieces" in Bisaya and Ilocano respectively; the parser extracts the numeral separately from the unit, so the unit-only mapping is correct, but no qty=2 test was written for these words since qty comes from the digit, not the unit word.
- **Bisaya/Ilocano phonetic accuracy** — the speech engine (fil-PH) will transcribe these dialects with varying accuracy; the UNIT_MAP helps when the engine gets the word right, but transcription quality for Bisaya/Ilocano on fil-PH is inherently limited. This is a known constraint documented in context.md.

## Own-before-merge
Non-trivial. Run `code-explain-before-ship` and write the 3 mechanisms in YOUR words, then merge `feat/dialect-support` → main when ready.
