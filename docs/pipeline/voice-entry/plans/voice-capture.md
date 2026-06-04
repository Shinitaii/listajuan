# voice-capture module plan

## Purpose

Thin wrapper around `@capacitor-community/speech-recognition` that exposes two
functions consumed by the voice-entry UI: a capability guard (`isVoiceAvailable`)
and a single-shot capture (`captureTranscript`). Mirrors the barcode layer in
`src/lib/scan/capture.ts` — no state, no side-effects beyond the plugin calls,
never throws.

## Approach

- `isVoiceAvailable()` — calls `SpeechRecognition.available()` and returns the
  `available` boolean. Any exception → `false`. This is the single gate that
  prevents the UI from showing a voice affordance on web/dev builds.
- `captureTranscript()` — guards with `isVoiceAvailable()` first, then requests
  permission, then calls `SpeechRecognition.start()` with Filipino (`fil-PH`) as
  the primary language. Returns `matches[0] ?? null`. Every failure path (guard
  false, permission not granted, plugin error, empty results) returns `null`.

Language choice `fil-PH` matches the Filipino-first UX mandate in CLAUDE.md.

## Test cases

| # | Scenario | Expected |
|---|---|---|
| 1 | `available()` resolves `{ available: false }` | `isVoiceAvailable` → `false` |
| 2 | `available()` throws | `isVoiceAvailable` → `false` |
| 3 | `available()` resolves `{ available: true }` | `isVoiceAvailable` → `true` |
| 4 | `isVoiceAvailable` returns `false` (via mock) | `captureTranscript` → `null` (no permission call) |
| 5 | Permission denied (`speechRecognition !== 'granted'`) | `captureTranscript` → `null` |
| 6 | `start()` throws | `captureTranscript` → `null` |
| 7 | `start()` returns empty matches array | `captureTranscript` → `null` |

## Edge cases

- `requestPermissions()` returns a status other than `'granted'` (e.g. `'denied'`,
  `'prompt'`) — treat as denied, return `null`.
- `start()` returns `{ matches: undefined }` or `{ matches: [] }` — the `?? null`
  guard handles both.
- Plugin not loaded on web (module import throws at call time) — the outer
  try/catch in both functions absorbs this silently.
- Actual recording path (native speech capture) is untestable in CI — tests cover
  only guard logic and null-return paths; the happy-path native call is exercised
  by manual QA on device.
