# Review: dialect-support

## 0. All Green Gate

| Verify file | Result |
|---|---|
| verify/lang-config.txt | GREEN — 10/10 |
| verify/unit-map-expansion.txt | GREEN — 56/56 (40 existing + 16 new) |
| verify/dialect-ui.txt | GREEN — 109/109 full suite |
| verify/integration.txt | GREEN — 120/120 full suite + 11 new integration tests |

TSC: PASS on all runs. No RED files. Gate: PASS.

## 1. Product Requirements Met

| Must-Have | Status |
|---|---|
| Dialect options Tagalog/Bisaya/Ilocano/Ingles in selector | ✓ DIALECT_OPTIONS 4 entries, lang.ts:4–10 |
| Selection persists via localStorage | ✓ getDialect/setDialect, key 'voice_dialect', lang.ts |
| Speech engine receives correct BCP-47 code | ✓ captureTranscript(lang), capture.ts:28 |
| UNIT_MAP extended with Bisaya synonyms | ✓ usa/duha/gatosan added, parse.ts |
| UNIT_MAP extended with Ilocano synonyms | ✓ maysa/kilon/dua added, parse.ts |
| All existing parse tests pass | ✓ 40/40 original tests green |
| captureTranscript backward-compatible | ✓ optional lang param, default 'fil-PH' |
| UI: Wika label above mic button | ✓ AddItem.svelte lines 174–186 |
| UI: selector only when voiceAvailable | ✓ inside {#if voiceAvailable} block |
| Tap target ≥44px | ✓ .dialect-select min-height: 44px |

## 2. Tech Stack

Svelte 5 runes ($state), TypeScript strict, Vitest, Capacitor SpeechRecognition plugin — all per spec. No new npm packages. No Firestore changes. PASS.

## 3. Module Boundaries

- lang-config owns: lang.ts + lang.test.ts only ✓
- unit-map-expansion owns: parse.ts + capture.ts + their test files ✓
- dialect-ui owns: AddItem.svelte only ✓
- No file owned by more than one module ✓

## 4. Code Quality

All three modules passed review-code-quality during Phase A. No issues surfaced in final reads.

## 5. Test Coverage

- lang-config: 10 unit tests ✓
- unit-map-expansion: 46 parse + 10 capture tests ✓
- dialect-ui: full suite regression (109/109) ✓
- Integration: 11 cross-module tests covering preference round-trip, lang forwarding, Bisaya/Ilocano end-to-end, Tagalog regression ✓

## 6. Integration Points

- AddItem.svelte → getDialect() on mount → voiceLang state ✓
- AddItem.svelte onchange → setDialect(voiceLang) ✓
- onVoice() → captureTranscript(voiceLang) → parseVoiceInput(transcript) ✓
- UNIT_MAP flat and dialect-agnostic — no branching needed ✓

## 7. Scope Creep

No modules beyond the three specified in coding.md. No additional Firestore, no new routes, no new npm packages.

---

## PASS ✓

All requirements met. Ready for ship-digest and commit.
