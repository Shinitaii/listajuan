# Plan: unit-map-expansion

## Scope

Extend dialect coverage in the voice-entry pipeline by adding Bisaya and Ilocano
unit aliases to `UNIT_MAP` and making `captureTranscript` language-configurable.

## Changes

### src/lib/voice/parse.ts — additive UNIT_MAP entries

New Bisaya entries (no existing key modified):
- `'usa'` → `'piraso'`   (one piece)
- `'duha'` → `'piraso'`  (two pieces)
- `'gatosan'` → `'g'`    (grams in Bisaya)

New Ilocano entries:
- `'maysa'` → `'piraso'` (one piece)
- `'kilon'` → `'kg'`     (kilo in Ilocano)
- `'dua'` → `'piraso'`   (two pieces)

All keys are lowercase; the existing `QTY_UNIT_RE` uses `'i'` flag so
case-insensitive matching is free. `UNIT_PATTERN` rebuilds from `Object.keys(UNIT_MAP)`
automatically — no regex change needed.

### src/lib/voice/capture.ts — optional lang param

Updated signature:
```ts
export async function captureTranscript(lang?: string): Promise<string | null>
```

Internal change: `language: 'fil-PH'` → `language: lang ?? 'fil-PH'`

Fully backward-compatible: existing call sites with no argument continue to use
`fil-PH`. The `isVoiceAvailable` function is unchanged.

### src/lib/voice/parse.test.ts — new describe blocks appended

Two new `describe` blocks after the existing 40 tests (existing tests untouched):
- `'dialect synonym parsing — Bisaya'`
- `'dialect synonym parsing — Ilocano'`

Covering: usa→piraso/isda, gatosan→g/luya, kilon→kg/baboy, maysa→piraso/kamatis.

### src/lib/voice/capture.test.ts — new lang-param tests

Appended inside a new `describe('lang parameter', ...)` block nested under the
existing `captureTranscript` describe. Two cases:
- no arg → `language: 'fil-PH'` passed to `SpeechRecognition.start`
- `'en-PH'` arg → `language: 'en-PH'` passed to `SpeechRecognition.start`

## Review

No key conflicts: all six new UNIT_MAP keys (`usa`, `duha`, `gatosan`, `maysa`,
`kilon`, `dua`) are absent from the existing map; existing 40 tests remain valid.
The `lang` param is optional with a `??` default so all current call sites and the
existing capture tests are unaffected without modification.
Edge case noted: `'dua'` (Ilocano) and `'duha'` (Bisaya) are distinct keys both
mapping to `'piraso'` — no collision; `'kilon'` does not conflict with `'kilo'`
or `'kilos'` since it is a different string.
