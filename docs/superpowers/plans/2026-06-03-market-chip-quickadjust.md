# Market Chip & QuickAdjust Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trip's market a visible sticky chip at the top of the Trip screen (AddItem drops its in-flow market step), and add a reusable QuickAdjust "semi-calculator" (step chips + ＋/− + ×2/÷2 scaling) for quantity and price.

**Architecture:** Continues the app (Svelte 5 runes). New pure helpers `applyStep`/`scaledSteps` (unit-tested) power a new `QuickAdjust.svelte`, which replaces `QtyField`'s internals and AddItem's price field. The trip's current market moves to a chip in `Trip.svelte` (writing `setTripMarket`, which already exists); AddItem stamps the trip's market onto new lines without asking.

**Tech Stack:** Svelte 5, TypeScript, Vitest, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-06-03-market-chip-quickadjust-design.md`. **Base branch:** `feat/editing-markets-mgmt` (this builds on it; merge the stack to `main` at the end).

## Conventions

- No emoji (Lucide icons / plain ＋ − ×2 ÷2 glyphs). Filipino copy. Type gate: `npm run check`.
- Emulator (only the e2e/sweep needs it): kill java **before and after**, non-interactively: `powershell -Command "Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force"`.

## File Structure

```
src/lib/domain/quickadjust.ts        NEW pure: applyStep, scaledSteps
src/lib/domain/quickadjust.test.ts   NEW unit tests
src/lib/ui/QuickAdjust.svelte        NEW the control (value + chips + ＋/− + ×2/÷2)
src/lib/ui/QtyField.svelte           rewire to QuickAdjust (form → baseSteps/kind)
src/routes/AddItem.svelte            remove in-flow market (add mode); price → QuickAdjust; keep edit-mode market override
src/routes/Trip.svelte               market chip header (setTripMarket); drop empty→auto-add
src/lib/ui/Stepper.svelte            DELETE if unused after QtyField rewire
```

---

## Task 1: Pure helpers `applyStep` / `scaledSteps` (TDD)

**Files:** Create `src/lib/domain/quickadjust.ts`, `src/lib/domain/quickadjust.test.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
import { describe, it, expect } from 'vitest';
import { applyStep, scaledSteps } from './quickadjust';

describe('applyStep', () => {
  it('adds and subtracts with 2-decimal rounding', () => {
    expect(applyStep(1, 0.25, 'add', 0)).toBe(1.25);
    expect(applyStep(1, 0.25, 'sub', 0)).toBe(0.75);
  });
  it('clamps subtraction at min', () => {
    expect(applyStep(0.2, 0.5, 'sub', 0)).toBe(0);
  });
  it('avoids float drift', () => {
    expect(applyStep(0.1, 0.2, 'add', 0)).toBe(0.3);
  });
});

describe('scaledSteps', () => {
  it('multiplies the base triple by the scale', () => {
    expect(scaledSteps([0.25, 0.5, 1], 1)).toEqual([0.25, 0.5, 1]);
    expect(scaledSteps([0.25, 0.5, 1], 2)).toEqual([0.5, 1, 2]);
    expect(scaledSteps([0.25, 0.5, 1], 4)).toEqual([1, 2, 4]);
    expect(scaledSteps([0.25, 0.5, 1], 0.5)).toEqual([0.125, 0.25, 0.5]);
  });
  it('scales the count and price triples', () => {
    expect(scaledSteps([1, 2, 5], 2)).toEqual([2, 4, 10]);
    expect(scaledSteps([25, 50, 100], 2)).toEqual([50, 100, 200]);
  });
});
```

- [ ] **Step 2: Run `npx vitest run src/lib/domain/quickadjust.test.ts` — FAIL.**

- [ ] **Step 3: Implement `quickadjust.ts`:**

```ts
export type StepDir = 'add' | 'sub';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyStep(value: number, step: number, dir: StepDir, min: number): number {
  const next = dir === 'add' ? value + step : value - step;
  return Math.max(min, round2(next));
}

export function scaledSteps(baseSteps: number[], scale: number): number[] {
  return baseSteps.map((s) => round2(s * scale));
}
```

- [ ] **Step 4: Run `npm test` — PASS.**

- [ ] **Step 5: Commit** `git add src/lib/domain/quickadjust.ts src/lib/domain/quickadjust.test.ts && git -c commit.gpgsign=false commit -m "feat: pure quickadjust helpers (applyStep, scaledSteps)"`

---

## Task 2: `QuickAdjust.svelte` control

**Files:** Create `src/lib/ui/QuickAdjust.svelte`.

- [ ] **Step 1: Implement the component:**

```svelte
<script lang="ts">
  import { applyStep, scaledSteps } from '../domain/quickadjust';

  let { value = $bindable(0), baseSteps, kind, min = 0, ontouch } =
    $props<{ value: number; baseSteps: [number, number, number]; kind: 'count' | 'weight' | 'volume' | 'price'; min?: number; ontouch?: () => void }>();

  let scale = $state(1);
  let activeIndex = $state(0);
  const steps = $derived(scaledSteps(baseSteps, scale));
  const activeStep = $derived(steps[activeIndex]);
  // ontouch fires on any user interaction — lets a parent (e.g. AddItem price)
  // know the user overrode an auto-prefilled value.
  const touch = () => ontouch?.();

  function label(n: number): string {
    if (kind === 'price') return '₱' + (Number.isInteger(n) ? n : n.toFixed(2));
    if (kind === 'count') return String(n);
    // weight (base kg) / volume (base L): show sub-unit below 1
    const sub = kind === 'weight' ? 'g' : 'ml';
    const base = kind === 'weight' ? 'kg' : 'L';
    return n < 1 ? `${Math.round(n * 1000)}${sub}` : `${+n.toFixed(2)}${base}`;
  }

  const add = () => { value = applyStep(value, activeStep, 'add', min); touch(); };
  const sub = () => { value = applyStep(value, activeStep, 'sub', min); touch(); };
  const selectChip = (i: number) => { activeIndex = i; touch(); };
</script>

<div class="qa">
  <input class="val" type="number" inputmode="decimal" bind:value
    onchange={() => { if (value < min || Number.isNaN(value)) value = min; touch(); }} />

  <div class="row">
    <div class="chips">
      {#each steps as s, i}
        <button class="chip" class:on={i === activeIndex} onclick={() => selectChip(i)}>{label(s)}</button>
      {/each}
    </div>
    <div class="scalecol">
      <button class="sc" aria-label="Doblehin" onclick={() => { scale *= 2; touch(); }}>×2</button>
      <button class="sc" aria-label="Hatiin" onclick={() => { scale /= 2; touch(); }}>÷2</button>
    </div>
    <div class="signcol">
      <button class="sign add" aria-label="Dagdag" onclick={add}>＋</button>
      <button class="sign sub" aria-label="Bawas" onclick={sub}>−</button>
    </div>
  </div>
</div>

<style>
  .qa { display: flex; flex-direction: column; gap: 10px; }
  .val { font-size: var(--fs-hero); text-align: center; width: 100%; border: none;
    border-bottom: 3px solid var(--c-ink); outline: none; }
  .row { display: flex; align-items: stretch; gap: 8px; }
  .chips { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .chip { min-height: 44px; border: 2px solid var(--c-ink); border-radius: var(--radius);
    background: var(--c-bg); font-weight: 700; font-size: var(--fs-body); }
  .chip.on { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
  .scalecol, .signcol { display: flex; flex-direction: column; gap: 6px; }
  .sc, .sign { min-width: 56px; min-height: 44px; border-radius: var(--radius); border: 2px solid var(--c-ink);
    background: var(--c-surface); font-weight: 800; font-size: 20px; }
  .sign.add { background: #2f8f4e; color: #fff; border-color: #2f8f4e; }   /* green = add */
  .sign.sub { background: var(--c-danger); color: #fff; border-color: var(--c-danger); } /* red = subtract */
</style>
```

NOTE on the chip layout vs the spec's ASCII: the spec drew the chips in a horizontal row with stacked scale/sign columns. The code above stacks the 3 chips vertically beside the two stacked control columns, which keeps three ≥44px columns aligned on a narrow phone. If a **horizontal** chip row reads better in practice, change `.chips` to `flex-direction: row` — purely cosmetic, same behaviour. Implementer: pick whichever looks right when running it; the spec's intent is "3 step chips + stacked ×2/÷2 + stacked ＋/−".

- [ ] **Step 2: Verify** `npm run check` (component compiles). Commit.
- [ ] **Step 3: Commit** `git add src/lib/ui/QuickAdjust.svelte && git -c commit.gpgsign=false commit -m "feat: QuickAdjust control (step chips, +/-, x2/div2 scaling, green/red)"`

---

## Task 3: Rewire `QtyField` to QuickAdjust

**Files:** Modify `src/lib/ui/QtyField.svelte`; delete `src/lib/ui/Stepper.svelte` if unused.

- [ ] **Step 1: Rewrite `QtyField.svelte`:**

```svelte
<script lang="ts">
  import QuickAdjust from './QuickAdjust.svelte';
  import type { Form } from '../domain/types';
  let { form, value = $bindable(1) } = $props<{ form: Form; value: number }>();

  const config = {
    bilang: { baseSteps: [1, 2, 5] as [number, number, number], kind: 'count' as const },
    timbang: { baseSteps: [0.25, 0.5, 1] as [number, number, number], kind: 'weight' as const },
    sukat: { baseSteps: [0.25, 0.5, 1] as [number, number, number], kind: 'volume' as const },
  };
  const c = $derived(config[form]);
</script>

<QuickAdjust bind:value baseSteps={c.baseSteps} kind={c.kind} min={0} />
```

- [ ] **Step 2: Check for `Stepper.svelte` usages.** Run `grep -rn "Stepper" src/`. If only `QtyField` used it (now removed), `git rm src/lib/ui/Stepper.svelte`. If anything else imports it, leave it.

- [ ] **Step 3: Verify** `npm run check`, `npm run build`. Commit.
- [ ] **Step 4: Commit** `git add src/lib/ui/QtyField.svelte && git rm src/lib/ui/Stepper.svelte 2>/dev/null; git -c commit.gpgsign=false commit -m "feat: QtyField uses QuickAdjust; drop Stepper if unused"`

---

## Task 4: AddItem — drop in-flow market, price → QuickAdjust

**Files:** Modify `src/routes/AddItem.svelte`.

Read the current file first. Apply:

- [ ] **Step 1: Remove the ADD-mode market UI.** Delete the `pickingMarket` state, the `MarketPicker` import/usage, and the "Saang tindahan?" market button **from the add-mode template** (the `{:else}` non-edit branch). `marketId`/`marketName` stay (seeded from `defaultMarketId`/`defaultMarketName` props) and are still emitted in `save()` — the trip's market just comes from props now, not an in-form picker. Keep the `onMarketChange` prop usage ONLY in edit-mode (see Step 2).

- [ ] **Step 2: Keep the market override in EDIT mode.** In edit-mode, retain a market control (the existing `MarketPicker` toggled by a small "Tindahan: {marketName} ▾" button) so a single line's market can be changed; `pickMarket` there sets `marketId`/`marketName` (do NOT call `onMarketChange` — per the prior round's fix, editing a line must not rewrite the trip default). If simpler, gate the existing market button/picker with `{#if existing}`.

- [ ] **Step 3: Price → QuickAdjust.** Replace the price `<input class="price">` with:
```svelte
<p class="lbl">Presyo (kabuuan)</p>
<QuickAdjust bind:value={price} baseSteps={[25, 50, 100]} kind="price" min={0} />
{#if ppu != null}<p class="readout">= ₱{Math.round(ppu).toLocaleString('en-PH')} / {baseUnitLabel(baseUnit)}</p>{/if}
```
Add `import QuickAdjust from '../lib/ui/QuickAdjust.svelte';`. Keep the existing prefill `$effect` (it sets `price`; QuickAdjust binds the same `price`). To preserve "user override stops auto-prefill", pass `ontouch={() => (priceTouched = true)}` to the price QuickAdjust (the `ontouch` prop, built in Task 2, fires on any ＋/−/chip/scale/value interaction). Remove the old `<input oninput={() => priceTouched = true}>` price field it replaces.

- [ ] **Step 4: Verify** `npm run check`, `npm run build`. Manual: in a trip, add an item → no market step in the form; price has the calculator; editing a line still lets you change its market.

- [ ] **Step 5: Commit** `git add src/lib/ui/QuickAdjust.svelte src/routes/AddItem.svelte && git -c commit.gpgsign=false commit -m "feat: AddItem drops in-flow market (add mode); price uses QuickAdjust"`

---

## Task 5: Trip screen — market chip header; drop empty→auto-add

**Files:** Modify `src/routes/Trip.svelte`.

- [ ] **Step 1: Market chip in the header.** Add a chip below/next to the title showing the trip's current market: `Tindahan: {trip?.defaultMarketName ?? '—'} ▾` (or "Pumili ng tindahan" when null). Tapping toggles a `MarketPicker` (import it) whose `onPick` calls `setTripMarket(db, uid, tripId, m.id, m.name)` and refreshes `trip` (re-`getTrip` or optimistically set `trip = { ...trip, defaultMarketId: m.id, defaultMarketName: m.name }`). Import `setTripMarket` (already exported from trips.ts) and `MarketPicker`.

- [ ] **Step 2: AddItem gets the market from the trip.** Where Trip renders `<AddItem ... />` in add mode, it already passes `defaultMarketId={trip?.defaultMarketId}` / `defaultMarketName={trip?.defaultMarketName}`. Keep that; remove the `onMarketChange` prop on the add-mode AddItem (market is set via the chip now, not inside AddItem). Edit-mode AddItem keeps its own market override (Task 4 Step 2).

- [ ] **Step 3: Drop empty→auto-add.** In the `$effect` that loads the trip, REMOVE the `if (t && items.length === 0) mode = 'add';` line so an empty/new trip shows the trip view (market chip + "＋ Magdagdag ng item") instead of jumping into AddItem. `mode` starts `'view'`.

- [ ] **Step 4: Verify** `npm run check`, `npm run build`. Manual: Bagong biyahe → lands on the trip view with the market chip at top (showing the Settings default if set) + ＋ Magdagdag; set/change the market via the chip; add items inherit it.

- [ ] **Step 5: Commit** `git add src/routes/Trip.svelte && git -c commit.gpgsign=false commit -m "feat: Trip market chip header; empty trip shows trip view not auto-add"`

---

## Task 6: e2e + full sweep

**Files:** Modify `e2e/core-loop.spec.ts`.

- [ ] **Step 1: Update e2e** for the new flow:
  - Bagong biyahe → assert you land on the **trip view** (market chip visible, "＋ Magdagdag ng item" present) — NOT directly in the item picker.
  - Tap the market chip → create/pick "Palengke" → chip shows "Palengke".
  - ＋ Magdagdag → create item "Itlog" (Bilang/Iba pa) → **no market step** in AddItem → on Dami QuickAdjust: select the "2" chip, press ＋ once (value 2) ; on Presyo QuickAdjust press ₱… as needed → save → line under Palengke.
  - QuickAdjust scaling: on a timbang item, assert chips read "250g/500g/1kg", tap ×2, assert they read "500g/1kg/2kg".
  - Keep an existing "edit a line" test; verify line edit still lets you change market.
  Use scoped selectors; the QuickAdjust value input is a spinbutton; ＋/− have aria-labels "Dagdag"/"Bawas"; ×2/÷2 "Doblehin"/"Hatiin".

- [ ] **Step 2: Full sweep:** `npm test`; (kill java) `npm run test:emulator` (kill java after); `npm run check` (0 errors); `npm run build`; `npm run e2e` (kill java after). All green; re-run emulator once on a lone flake.

- [ ] **Step 3: Review screenshots** — market chip at top, QuickAdjust grid (green ＋ / red −), no emoji.

- [ ] **Step 4: Commit** any fixes.

---

## Notes / carry-forward

- Google sign-in is still the next round (Settings hosts the link entry).
- Prior carry-forwards remain: draft lines counting toward purchaseCount/lastPrice; non-serialized recompute; cleared-qty → null.
- After this round, merge the whole `feat/editing-markets-mgmt` stack to `main`.
