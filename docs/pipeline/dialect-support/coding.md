# Coding Design Spec: dialect-support

## Tech Stack Decisions
- TypeScript throughout — matches every existing file in `src/lib/voice/`
- Vitest for all tests — project standard (`npm test`); no emulator needed (no Firestore changes)
- localStorage for dialect preference — correct scope (user device preference, not trip data)
- No new npm dependencies — localStorage is native; Capacitor plugin already installed

## Coding Patterns (shared conventions — binding on all modules)

- **Async style:** Pure functions (lang config, UNIT_MAP) are **synchronous**. `captureTranscript` stays `async` (Capacitor call). `isVoiceAvailable` stays `async`. No new async functions introduced in this feature.
- **Error handling:** Never throw across module boundaries. `captureTranscript` returns `null` on any failure (existing contract). `getDialect` returns `'fil-PH'` if localStorage is unset or throws (safe default).
- **Naming:** camelCase functions, PascalCase types/interfaces, SCREAMING_SNAKE for module-level constants (`DIALECT_OPTIONS`, `UNIT_MAP`). Test files: `*.test.ts` co-located with source.
- **Data-layer access:** No Firestore in this feature. localStorage access isolated to `src/lib/voice/lang.ts` — AddItem.svelte never touches localStorage directly; it calls `getDialect`/`setDialect`.
- **Test/mock conventions:** `vi.mock(...)` at module top, before imports (matches `capture.test.ts`). `vi.resetAllMocks()` in `beforeEach`. For `lang.test.ts`, mock `localStorage` via `vi.stubGlobal` or use `vitest`'s built-in jsdom localStorage. No module-level shared state between test files.
- **Imports:** Relative imports within `src/lib/voice/`; no barrel re-exports added. Svelte component imports lang module with relative path `../lib/voice/lang`.

## New Dependencies (npm)
none

## Modules

### 1. lang-config
- **Purpose:** Defines supported dialects and manages the persisted dialect preference.
- **Owns:** All localStorage read/write for voice dialect preference. The canonical list of supported dialects.
- **Files:** `src/lib/voice/lang.ts`, `src/lib/voice/lang.test.ts`
- **Dependencies:** none (pure TS + localStorage)
- **Tech:** TypeScript, localStorage
- **Complexity:** Low — 3 exports, localStorage read/write, clear existing pattern in project.
- **Interface Contract:**
  ```ts
  export interface DialectOption {
    label: string;   // user-facing name in the dialect's own language
    lang: string;    // BCP-47 code passed to SpeechRecognition
  }

  // Four entries, in this order:
  // { label: 'Tagalog', lang: 'fil-PH' }
  // { label: 'Bisaya',  lang: 'fil-PH' }   ← Chrome has no ceb-PH; fil-PH is closest
  // { label: 'Ilocano', lang: 'fil-PH' }   ← same reason
  // { label: 'Ingles',  lang: 'en-PH'  }
  export const DIALECT_OPTIONS: DialectOption[];

  // localStorage key: 'voice_dialect'
  // Returns 'fil-PH' if key absent or localStorage throws.
  export function getDialect(): string;

  // Writes lang to localStorage key 'voice_dialect'. Silent on error.
  export function setDialect(lang: string): void;
  ```

---

### 2. unit-map-expansion
- **Purpose:** Extends voice parse vocabulary to cover Bisaya and Ilocano unit synonyms; makes `captureTranscript` accept a dialect parameter.
- **Owns:** UNIT_MAP additions in `parse.ts`; `lang` param in `capture.ts`.
- **Files:** `src/lib/voice/parse.ts` (modify), `src/lib/voice/capture.ts` (modify), `src/lib/voice/parse.test.ts` (add cases — do NOT remove or alter existing 40 tests)
- **Dependencies:** none
- **Tech:** TypeScript
- **Complexity:** Low — additive map entries + one optional param; no logic branching.
- **Interface Contract:**

  **`parse.ts`** — UNIT_MAP additions (new keys only; all existing keys stay unchanged):
  ```
  Bisaya additions:
    'usa'       → 'piraso'   (one piece)
    'duha'      → 'piraso'   (two pieces — maps same unit, qty handled by numeral)
    'gatosan'   → 'g'        (grams in Bisaya)

  Ilocano additions:
    'maysa'     → 'piraso'   (one piece)
    'kilon'     → 'kg'       (kilo in Ilocano)
    'dua'       → 'piraso'   (two pieces)
  ```
  `parseVoiceInput` signature stays **unchanged**: `(transcript: string, deps?: VoiceParseDeps): VoiceParseResult`

  **`capture.ts`** — updated signature:
  ```ts
  // lang defaults to 'fil-PH' — existing callers with no argument are unaffected.
  export async function captureTranscript(lang?: string): Promise<string | null>;
  ```
  Internally: `language: lang ?? 'fil-PH'` replaces the hardcoded `'fil-PH'`.

---

### 3. dialect-ui
- **Purpose:** Wires the dialect selector into AddItem.svelte; connects lang-config and updated captureTranscript.
- **Owns:** UI changes in `src/routes/AddItem.svelte` only. Does NOT touch lang.ts or parse.ts.
- **Files:** `src/routes/AddItem.svelte` (modify)
- **Dependencies:** lang-config (`getDialect`, `setDialect`, `DIALECT_OPTIONS`), unit-map-expansion (`captureTranscript(lang)`)
- **Tech:** Svelte 5 runes
- **Complexity:** Low — import + `$state` + `<select>` + one-line handler change.
- **Interface Contract (component changes):**
  ```svelte
  <!-- New import at top of <script> -->
  import { getDialect, setDialect, DIALECT_OPTIONS } from '../lib/voice/lang';

  <!-- New reactive state (alongside voiceAvailable) -->
  let voiceLang = $state(getDialect());

  <!-- onVoice handler: pass voiceLang to captureTranscript -->
  async function onVoice() {
    const transcript = await captureTranscript(voiceLang);
    // ... rest unchanged
  }

  <!-- Dialect selector: rendered inside the !item && !newName block,
       ABOVE the mic button, only when voiceAvailable is true -->
  {#if voiceAvailable}
    <div class="dialect-row">
      <label class="lbl" for="dialect-select">Wika</label>
      <select
        id="dialect-select"
        class="dialect-select"
        value={voiceLang}
        onchange={(e) => { voiceLang = e.currentTarget.value; setDialect(voiceLang); }}
      >
        {#each DIALECT_OPTIONS as opt}
          <option value={opt.lang}>{opt.label}</option>
        {/each}}
      </select>
    </div>
    <button class="scan" onclick={onVoice}><Mic size={20} /> Magsalita</button>
  {/if}
  ```
  CSS additions in `<style>`: `.dialect-select` min-height 44px; `.dialect-row` flex column gap 2px.

## Module Dependencies

```
lang-config (lang.ts)
    └── dialect-ui (AddItem.svelte)

unit-map-expansion (parse.ts + capture.ts)
    └── dialect-ui (AddItem.svelte)  ← captureTranscript(voiceLang)
```

lang-config and unit-map-expansion have NO dependency on each other — safe to build in parallel.

## Infra Steps
none — no Firestore changes, no indexes, no security rule changes.

## Integration Points

- `AddItem.svelte` calls `captureTranscript(voiceLang)` — voiceLang is whatever `getDialect()` returned (or user just changed in the selector).
- `parseVoiceInput` receives the transcript string — unchanged call site; no lang param needed (UNIT_MAP is flat and dialect-agnostic).
- `setDialect` is called on `onchange` before the next mic tap — the next `captureTranscript` call picks up the new value.

## UI Integration

- **Component:** `src/routes/AddItem.svelte`
- **User-facing contract:** When `voiceAvailable` is true, user sees a "Wika" label above a dropdown (Tagalog / Bisaya / Ilocano / Ingles). Default is whatever was last saved (or Tagalog on first use). User changes dialect → tap mic → speech engine uses the selected code → transcript parsed with expanded UNIT_MAP. Selection persists across app restarts.
- **Built modules consumed:**
  - `DIALECT_OPTIONS`, `getDialect`, `setDialect` from `lang-config`
  - `captureTranscript(lang)` from `unit-map-expansion`
  - `parseVoiceInput` (unchanged) from `unit-map-expansion`
- **Owned files:** `src/routes/AddItem.svelte` only — no new files.

## Constraints & Rules

- `captureTranscript()` with zero args must still compile and return the same behaviour as before — existing `capture.test.ts` tests must pass without modification.
- All 40 existing `parse.test.ts` tests must stay green — new UNIT_MAP entries are additive only; no existing key is removed or reassigned.
- No Firestore write for dialect — localStorage only.
- Tap targets ≥ 44 pt height (`.dialect-select` min-height: 44px).
- Filipino-first labels in UI: selector label is `Wika`; option text is each dialect's own name (`Tagalog`, `Bisaya`, `Ilocano`, `Ingles`).
- No new npm packages.

## Project Context

- **Framework:** Svelte 5 (runes — `$state`, `$derived`, `$effect`), Vite, TypeScript strict, Capacitor 8
- **Data layer pattern:** All Firestore access behind `src/lib/data/`; components import from there. This feature bypasses Firestore entirely.
- **Testing approach:** TDD — failing test first, then implement. `*.test.ts` = pure Vitest (no emulator). `npm test` runs all pure tests.
