# Voice Entry

## Problem
Logging items at the market is slow and awkward one-handed: the user must tap to search, pick from
a list, then type quantity and price. Speaking "2 kilo repolyo 50 piso" should do all of that in
one breath — item, quantity, and price — so the user can log while carrying a basket.

## Stakeholders
| Role | Friction | Effort they'll accept |
|---|---|---|
| User (household manager) | One-handed typing at the market is slow and causes trip abandonment | Speak one natural phrase, confirm once |
| Builder (you) | Must respect offline-first + no-API-server rules | Capacitor plugin only; reuse existing search |

## Core Feature
Tap a mic button → speak a phrase (e.g. "2 kilo repolyo 50 piso") → the app parses item name,
quantity, and price, matches the item name against the library, and prefills AddItem's fields for
one-tap confirmation. The user always confirms before saving.

## Must-Have
- Mic button in the AddItem screen (hidden on web/dev where recording is unavailable).
- Capture speech via a Capacitor plugin and return the transcript.
- Parse the transcript for: item name (text), quantity (numeric), unit (mapped to the app's `Unit`
  type), price (numeric).
- Match the parsed item name against the in-memory library (`searchLibrary`) — offline, zero reads.
- Prefill AddItem's item, qty, unit, and price fields from parse results; user confirms once.
- Graceful fallback on recognition failure (no recording, permission denied, no match) → manual
  entry, no error, no blocking.

## Should-Have
- Show the raw transcript above the prefilled fields so the user can see what was captured and
  trust it before confirming.

## Won't-Have (scope boundaries)
- Tagalog number words ("dalawang kilo") — digits only in v1; extension point documented for later.
- Multiple items in one utterance — one phrase → one item, matching the one-decision-per-screen flow.
- Continuous/real-time transcription — single-shot recording only.
- Any server-side speech processing — Capacitor plugin only, no external speech API.
- Offline speech model download — if the plugin requires a network call for transcription, that is
  best-effort; failure → null → manual entry (same as barcode cold-start).

## Success Metrics
- A spoken phrase with a recognizable item name prefills all three fields with zero typing.
- Failed or offline recognition falls back to manual entry without an error screen.
- No regression to the existing add-item flow (barcode scan and manual entry continue to work).

## Architecture Notes (from context.md — binding)
- Two modules: `voice-capture` (Capacitor wrapper, mirrors `src/lib/scan/capture.ts`) and
  `voice-parse` (pure parsing + `searchLibrary` match).
- No OfflineHandler: Firestore `persistentLocalCache` already handles offline writes.
- `searchLibrary` (in-memory, `src/lib/state/library.svelte.ts:18`) reused directly in
  `voice-parse` — injectable dep for testability.
- Tests: Vitest. `voice-parse` → pure `*.test.ts`; `voice-capture` → capability-guard only.
- New infra: `@capacitor-community/speech-recognition` + `npx cap sync`.
