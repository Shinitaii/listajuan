# dialect-ui — Plan

Module: `dialect-ui`
Feature: `dialect-support`
File touched: `src/routes/AddItem.svelte`

## Changes

### Script block

1. **Import** `getDialect`, `setDialect`, `DIALECT_OPTIONS` from `../lib/voice/lang` — added after the existing voice imports.

2. **`voiceLang` state** — `let voiceLang = $state(getDialect())` added immediately after `let voiceAvailable = $state(false)`. Reads from `localStorage` via `getDialect()` on component mount; falls back to `'fil-PH'` if storage is unavailable.

3. **`onVoice()` call** — `captureTranscript()` → `captureTranscript(voiceLang)`. Passes the currently-selected dialect BCP-47 tag to the speech recognition wrapper.

### Template

4. **Dialect selector** inserted inside `{#if voiceAvailable}`, above the mic button. Uses a `<div class="dialect-row">` wrapper with a labelled `<select>`. Options are rendered from `DIALECT_OPTIONS` (`lang` as value, `label` as display text).

   Select binding uses controlled-value pattern (`value={voiceLang}` + `onchange`) rather than `bind:value` so that `setDialect()` is called synchronously on every change, persisting to `localStorage`.

### Style block

5. `.dialect-row` — `flex-direction: column; gap: 2px` so the label sits above the select.
6. `.dialect-select` — `min-height: 44px` (accessibility tap target), inherits border/radius/bg tokens from the existing design system.

---

## Review

### Does `voiceLang` `$state` initialize correctly from localStorage via `getDialect()`?

Yes. `getDialect()` is a plain synchronous function that calls `localStorage.getItem(STORAGE_KEY)` and falls back to `'fil-PH'` on any error. Calling it as the initial value of `$state(...)` is equivalent to a direct literal — Svelte 5 runes evaluate the expression once at construction time, so the value read from storage becomes the initial reactive state. No async or `$effect` is needed.

### Is the select value binding correct for Svelte 5 runes (`value=` vs `bind:value`)?

Yes. `bind:value` would work for simple two-way binding, but we also need to call `setDialect()` on every change. The explicit pattern `value={voiceLang}` + `onchange={(e) => { voiceLang = e.currentTarget.value; setDialect(voiceLang); }}` is correct for Svelte 5 runes mode: the `value` prop reflects the rune, and the `onchange` handler both updates the rune and persists to storage. This is the idiomatic approach when a side effect must accompany the state update.

### Are all existing handlers and fields untouched?

Yes. The only modifications to existing code are:
- One new import line inserted after the existing voice imports (lines 8–9).
- One new `let voiceLang` line inserted after `let voiceAvailable`.
- One argument added to the `captureTranscript()` call inside `onVoice()`.
- The `{#if voiceAvailable}` block expanded to include the dialect selector above the unchanged mic button.
- Two CSS rules appended at the end of the style block.

All other state variables, handlers (`onScan`, `pick`, `confirmNewItem`, `pickMarket`, `save`), `$effect` blocks, `$derived` values, and template sections are untouched.
