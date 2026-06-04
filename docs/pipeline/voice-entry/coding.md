# Coding Design Spec: Voice Entry

## Tech Stack Decisions
- Svelte 5 + Capacitor 8 + Firestore client SDK (existing). No new server.
- Speech: `@capacitor-community/speech-recognition` plugin (native iOS/Android only; web → unavailable).
- Tests: **Vitest** — pure `*.test.ts` only (no emulator needed — no Firestore changes).

## New Dependencies (npm)
- `@capacitor-community/speech-recognition` — Capacitor speech-recognition plugin.
  Installed ONCE by stage 3 Phase B. Agents must NOT run `npm install`.

## Modules

1. **voice-capture** (Capacitor wrapper)
   - Purpose: Detect mic availability and capture a single speech transcript.
   - Owns: Permission request, single-shot recording, graceful unavailability on web/dev.
   - Files:
     - `src/lib/voice/capture.ts` (new)
     - `src/lib/voice/capture.test.ts` (new — capability-guard logic only)
   - Dependencies: `@capacitor-community/speech-recognition` (infra).
   - Tech: TypeScript, Capacitor plugin. Native recording itself is verified on-device only.
   - Interface Contract:
     ```ts
     export async function isVoiceAvailable(): Promise<boolean>
     // Returns true only on a native device where speech recognition is supported.
     // Catches all errors → false. Never throws.

     export async function captureTranscript(): Promise<string | null>
     // Requests permission, starts a single-shot listen, returns the first transcript string.
     // Returns null if: unavailable, permission denied, no speech detected, any error.
     // Never throws.
     ```

2. **voice-parse** (pure parsing + library match)
   - Purpose: Parse a raw transcript into structured fields and match the item name against the
     in-memory library.
   - Owns: Regex extraction (qty, unit, price, item name), spoken-unit→`Unit` map, `searchLibrary`
     call, result assembly.
   - Files:
     - `src/lib/voice/parse.ts` (new)
     - `src/lib/voice/parse.test.ts` (new — pure Vitest unit tests, no Firebase)
   - Dependencies: `searchLibrary` from `src/lib/state/library.svelte.ts` (injectable dep).
   - Tech: TypeScript, regex. Pure function — no side effects, no imports from `firebase/firestore`.
   - Interface Contract:
     ```ts
     export interface VoiceParseResult {
       itemName: string;          // the text left after extracting qty/unit/price
       qty: number | null;        // numeric quantity extracted, or null
       unit: Unit | null;         // mapped Unit value, or null
       price: number | null;      // numeric price extracted, or null
       matchedItem: Item | null;  // first searchLibrary hit on itemName, or null
     }

     export interface VoiceParseDeps {
       searchLibrary?: (query: string) => Item[];
     }

     export function parseVoiceInput(
       transcript: string,
       deps?: VoiceParseDeps
     ): VoiceParseResult
     // Synchronous. transcript is trimmed before processing.
     // Empty/blank transcript → { itemName: '', qty: null, unit: null, price: null, matchedItem: null }.
     // Spoken-unit map (v1 digits-only; Tagalog number words are a documented extension point):
     //   "kilo" | "kilos" | "kg"  → 'kg'
     //   "gramo" | "grams" | "g"  → 'g'
     //   "litro" | "liter" | "liters" | "L" → 'L'
     //   "ml" | "milliliter"      → 'ml'
     //   "piraso" | "piece" | "pieces" | "pcs" → 'piraso'
     //   "dosena" | "dozen"       → 'dosena'
     //   (no unit word matched)   → null
     // Price extraction: last standalone number preceded by "piso", "pesos", "peso", "₱", or
     //   appearing as the final standalone number if none of those markers are present.
     // itemName: all remaining text after removing qty+unit and price tokens, trimmed.
     // matchedItem: deps.searchLibrary(itemName)[0] ?? null (no match → null, not an error).
     ```

## Module Dependencies
```
voice-capture  →  (transcript: string | null)  →  voice-parse.parseVoiceInput
                                                         ↓
                                              searchLibrary (existing, in-memory)
```
AddItem.svelte calls `captureTranscript()` then `parseVoiceInput()` and seeds its existing
`$state` vars (`item`, `qty`, `unit`, `price`, `newName`) from the result.

## Infra Steps
- `npm install @capacitor-community/speech-recognition` + `npx cap sync`
  Verify: `npx tsc --noEmit` passes and the plugin import resolves. Native recording is
  out of pipeline test scope (on-device only).

## Integration Points
- `captureTranscript()` → `string | null` (the raw transcript)
- `parseVoiceInput(transcript, { searchLibrary })` → `VoiceParseResult`
- `AddItem.svelte` consumes `VoiceParseResult`:
  - `matchedItem` present → call `pick(matchedItem)` (seeds qty/unit/price)
  - `matchedItem` null, `itemName` non-empty → set `newName = itemName` (drops into new-item form)
  - Override `qty`, `unit`, `price` from result where non-null (after `pick`, before user confirms)
  - `itemName` empty (total parse failure) → no-op (stay on picker screen, manual entry)
- Voice button gated by `isVoiceAvailable()` — same pattern as `scanAvailable` for barcode.

## Constraints & Rules
- Data-layer isolation: `voice-parse` is pure — no Firebase imports. `voice-capture` imports only
  the Capacitor plugin.
- Offline-first: `parseVoiceInput` uses the already-loaded in-memory `searchLibrary` — zero reads.
  `captureTranscript` may use the device's speech engine (best-effort); failure → null → manual.
- `Unit` type is the canonical target: all spoken-unit mappings must produce values from
  `'piraso' | 'dosena' | 'kg' | 'g' | 'L' | 'ml'`.
- Recognition-over-recall: when `matchedItem` is non-null, the user confirms a prefilled item
  rather than typing. No auto-save — user always hits "I-save ang item".
- Tagalog number words (dalawa, tatlo, etc.) are **explicitly out of scope for v1**. The
  `UNIT_MAP` and quantity regex in `parse.ts` must include a comment block listing the planned
  Tagalog number extensions so a future contributor can add them without redesigning the parser.

## Project Context
- Framework: Svelte 5 (runes) + Vite + Capacitor 8
- Data layer pattern: functions in `src/lib/data/`; state in `src/lib/state/`; voice is a new
  `src/lib/voice/` folder (no Firebase access in this folder)
- Testing: Vitest; TDD house style
