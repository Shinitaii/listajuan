# Market Chip & QuickAdjust Calculator — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Builds on:** the editing/affordances/markets-management round (branch `feat/editing-markets-mgmt`, not yet merged). This refines the same AddItem/Trip flow and ships on top of it.

## Motivation (from real use)

1. **The trip's market isn't visible up front** — a new trip drops you straight into the item search; the market (and the Settings default) only appears buried inside AddItem after an item is picked. The market should be a visible, primary trip-level control.
2. **Quantity/price entry is slow** — bilang has a ±1 stepper; timbang/sukat are bare number fields; price is a bare number field. The user wants a fast "semi-calculator" with quick increments per form, kept compact ("fewer buttons, more variety").

## Decisions

- **Market is a trip-level chip** at the top of the Trip screen — always visible, sets the trip's **current/sticky market**. New lines inherit it; multi-market trips work by switching the chip between batches and/or overriding a line's market in its editor.
- **AddItem drops its in-flow market step** (the market comes from the trip chip).
- **Empty new trip lands on the trip view** (with the market chip + "＋ Magdagdag ng item"), NOT auto-opening the item picker — adding is a deliberate tap.
- **A single reusable QuickAdjust control** for Dami and Presyo: tap-to-edit value + a ＋/− direction toggle + form/field-specific **step chips that apply on tap**, with **green (add) / red (subtract) colour state**.

## Market chip flow

- Trip screen header shows a chip: `Tindahan: {marketName} ▾`, or `Pumili ng tindahan ▾` when unset. Tap → MarketPicker (existing markets + ＋ Bagong tindahan). Selecting calls `setTripMarket(db, uid, tripId, id, name)` (already exists).
- Seeded from the Settings default market at trip creation (already wired in `createDraftTrip`).
- **AddItem**: remove the market button/MarketPicker section and the `onMarketChange` plumbing from the ADD flow. AddItem receives the current market via props and stamps it onto the new line (`marketId`/`marketName`) without showing a market field.
- **Line editor** (AddItem edit-mode) **keeps** a market field so an individual line's market is overridable (per-item multi-market).
- **Empty-trip behaviour**: `Trip.svelte` no longer flips `mode='add'` when items are empty; it shows the trip view (market chip, empty hint, "＋ Magdagdag ng item"). Tapping ＋ opens AddItem.

## QuickAdjust control

New `src/lib/ui/QuickAdjust.svelte`. Props: `value` (bindable number), `baseSteps: [number, number, number]` (the unscaled step triple), `kind: 'count' | 'weight' | 'volume' | 'price'` (drives chip labelling), `min` (default 0). Layout (one control):

```
            [   2.5 kg   ]                  ← central value, tap to type any number
| +/− | | 250g | | 500g | | 1kg | | ×2 |
|     | |                         | ÷2 |
```

- **Central value** — large, tap-to-edit; clamped to ≥ `min`; decimals allowed.
- **Direction toggle** `＋` / `−`, default `＋`, persistent. **Colour state: add = green accent, subtract = red/danger accent** applied to the toggle + step chips, so the direction is unmistakable (mitigates "forgot I'm subtracting").
- **Three step chips** = `baseSteps` × `scale` (a local multiplier, default 1). Tapping a chip applies `value = max(min, round2(value ± step))` in the current direction.
- **`×2` / `÷2` buttons** multiply / divide `scale` by 2 — sliding the chip window along the doubling ladder (e.g. timbang `250g/500g/1kg → 500g/1kg/2kg → 1kg/2kg/4kg`, and back down to `125g/250g/500g`). Lets you reach a magnitude, then nudge finely (e.g. ÷2 back down to add 500g at 4kg).
- **Chip labels** are derived from the scaled value by `kind`: `weight` shows `<1kg` as `g` else `kg`; `volume` shows `<1L` as `ml` else `L`; `price` shows `₱{n}`; `count` shows the bare number. So labels reformat as you scale.
- All tap targets ≥44px; no emoji; aria-labels "Dagdag"/"Bawas" on the toggle, "Doblehin"/"Hatiin" on ×2/÷2.

### Base step triples

| Field | kind | baseSteps | example chips at scale 1 |
|---|---|---|---|
| Dami · bilang | count | [1, 2, 5] | 1 · 2 · 5 |
| Dami · timbang | weight | [0.25, 0.5, 1] | 250g · 500g · 1kg |
| Dami · sukat | volume | [0.25, 0.5, 1] | 250ml · 500ml · 1L |
| Presyo | price | [25, 50, 100] | ₱25 · ₱50 · ₱100 |

`scale` resets to 1 each time the control mounts. Defaults on open: Dami value 1 (bilang) / as-is (timbang/sukat); Presyo prefill from the markets-forms round still applies — QuickAdjust just augments nudging.

### Wiring

- `QtyField.svelte` becomes a thin wrapper: pick `baseSteps`/`kind` by `form` (`bilang`→count [1,2,5]; `timbang`→weight [0.25,0.5,1]; `sukat`→volume [0.25,0.5,1]), render `<QuickAdjust bind:value>`. (Replaces the bilang Stepper + bare number field.) `Stepper.svelte` may be removed if no longer used elsewhere.
- AddItem's price field becomes `<QuickAdjust bind:value={price} baseSteps={[25,50,100]} kind="price" />` — keep the existing prefill `$effect` (it sets `price`; QuickAdjust binds the same `price`) and the live per-base-unit readout.

## Out of scope (still parked)

Google sign-in (next round), recipes, recommendations/ML, i18n, and the prior carry-forwards (draft inflation of purchaseCount/lastPrice; non-serialized recompute).

## Testing

- **Pure:** QuickAdjust step math is trivial; cover via component behaviour in e2e rather than a unit test (the only logic is `clamp(value ± step)`), OR a tiny unit test of a pure `applyStep(value, step, dir, min)` helper if extracted.
- **e2e:** start a trip → the market chip shows the Settings default (or "Pumili ng tindahan") at the top → set it → add an item (no market step in AddItem) → use QuickAdjust: pick a step chip, tap ＋ a few times, flip to − (chips turn red), tap once → value adjusts correctly → price QuickAdjust 25/50/100 → save; the line records the chip's market. Confirm empty trip shows the trip view (not auto item-picker).

## Decomposition for planning

One plan: (1) `QuickAdjust.svelte` (+ optional `applyStep` pure helper + unit test); (2) rewire `QtyField` to QuickAdjust; (3) AddItem — remove in-flow market, price→QuickAdjust, keep edit-mode market override; (4) Trip screen — market chip header + setTripMarket + drop empty→auto-add; (5) e2e + sweep.
