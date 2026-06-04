# Dialect Support for Voice Entry

## Problem

Voice entry is locked to Tagalog (fil-PH). Bisaya and Ilocano speakers — two of the largest
Filipino language groups — get poor speech transcription and no matching unit vocabulary (e.g.
Bisaya "usa ka kilo" or Ilocano "maysa a kilo" won't parse correctly). They cannot use voice
entry at all, or abandon it after one failed attempt.

## Stakeholders

| Role | Friction | Effort They'll Accept |
|------|----------|-----------------------|
| Household manager (Bisaya/Ilocano speaker) | Voice entry mis-transcribes or ignores units; has to type manually | Willing to pick dialect once and forget |
| Household manager (Tagalog speaker) | Unaffected today; must stay unaffected | Zero regression tolerance |
| Builder | One clean extension, no infra changes | 1-week scope max |

## Core Feature

A dialect selector — Tagalog, Bisaya, Ilocano, or English — that persists across sessions.
The speech engine uses the closest supported language code; the unit parser understands unit
words from all four dialects. The user picks once; voice entry works from then on.

## Must-Have

- Dialect options: **Tagalog**, **Bisaya**, **Ilocano**, **Ingles** — shown as a selector near the mic button
- Selection persists via `localStorage`; no re-pick required on next session
- Speech engine receives the correct BCP-47 code per dialect (Bisaya/Ilocano → `fil-PH`; English → `en-PH`; Tagalog → `fil-PH`)
- UNIT_MAP extended with Bisaya synonyms (e.g. `gatosanon`/`usa ka dosena`, `piraso`, `kilo`) and Ilocano synonyms (e.g. `maysa`, `kilon`, `gramo`)
- Price marker parsing understands `piso` and `pesos` (already present) — no change needed
- All existing `parse.test.ts` and `capture.test.ts` tests pass without modification

## Should-Have

- Dialect selector label uses the dialect's own name ("Bisaya", "Ilocano") not a foreign label
- Default dialect is `fil-PH` (Tagalog) for new installs — matches existing behaviour

## Won't-Have

- Per-trip dialect setting — one global preference is enough
- Server-side dialect detection / auto-detect — too complex, unnecessary
- Custom unit vocabulary per user — out of scope
- Tagalog number words (dalawa, tatlo…) — already deferred in a code comment; still deferred
- Any UI beyond the selector + mic button area — no new screens

## Success Metrics

1. **Zero regression:** All existing voice-entry tests pass green after the change.
2. **Unit coverage:** A Bisaya or Ilocano speaker saying a standard quantity + unit is parsed correctly (unit maps to a canonical `Unit` value); covered by new unit tests.
3. **Persistence:** Selected dialect survives a page reload (verified by integration test or manual smoke test on device).

## UX Notes

- Selector sits **above** the mic button in the `capture-row` block — visible at a glance before tapping mic.
- Label: `Wika` (language) above the select element. Options: `Tagalog`, `Bisaya`, `Ilocano`, `Ingles`.
- Select element tap target ≥ 44 pt height.
- No modal, no onboarding prompt — just a dropdown that remembers itself.
- Filipino-first: all surrounding labels remain in Filipino. The selector option text is each dialect's own name.

## Architecture (from context.md — binding)

- New `src/lib/voice/lang.ts`: `DIALECT_OPTIONS`, `getDialect()`, `setDialect()` (localStorage)
- `captureTranscript(lang?: string)` — optional param, default `'fil-PH'`
- UNIT_MAP in `parse.ts` — flat additive expansion, no restructuring
- No Firestore changes, no new indexes, no security rule changes

## Timeline

~1 week: 2 modules (lang config + UNIT_MAP expansion) built in parallel, then UI wiring + integration verify.
