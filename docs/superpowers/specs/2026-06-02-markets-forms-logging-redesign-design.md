# Markets, Product Forms & Logging Redesign — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning
**Builds on:** v1 (Plans 1–3). Supersedes parts of the v1 design where noted.

## Motivation (from real use)

After using the v1 app, several gaps surfaced:

1. **Trips are hard to tell apart** — the Home/Biyahe lists show neither the date nor where the trip happened.
2. **A trip is locked to one market**, but real shopping spans markets (eggs at the wet market, meat at SM) — and different markets have different prices worth tracking separately.
3. **Per-unit price is wrong/unhelpful** — `pricePerUnit = price ÷ quantity` in whatever unit was typed, with no notion of product *form* and no normalization, so "1 dosena ₱96", "6 pcs ₱48", and "1 kg ₱150 / ½ kg ₱75" don't produce comparable numbers, and everything is labelled "per pc."
4. **Category can't be set** — new items silently default to `iba_pa`, so Gastos shows all spending as "iba pa."
5. **Logging feels unintuitive** — the 3-step stepper and the repetition of re-entering the same items.

This design reshapes the data model and the logging flow to fix all five.

## Out of scope (parked)

- **Recipes / saved lists** that auto-fill a trip — future track.
- **Recommendations / supervised learning** — deferred indefinitely; a single household lacks the labeled data and the value is served first by simple heuristics (`purchaseCount`, frequently-bought, recipes). Not v2.

## Data model

### New: Market (`/users/{uid}/markets/{marketId}`)

Per-user list she builds up, like the item library.

```
Market {
  id: string;
  name: string;
  nameLower: string;                                  // prefix search
  type: 'palengke' | 'grocery' | 'supermarket' | 'iba_pa';
}
```

### Item — gains a measurement form (set once at creation)

```
Item {
  …existing (id, canonicalName, nameLower, aliases, lastPrice*, purchaseCount)…
  category: Category;                 // CHOSEN at creation now (no silent 'iba_pa')
  form: 'bilang' | 'timbang' | 'sukat';
  defaultUnit: Unit;                  // must be valid for `form`
}
```

`form` is **fixed per product** — you cannot buy the same product by weight one time and by count another.

### Forms, base units, conversions (pure domain table)

```
bilang  (count)  → base unit: piece   | units: piece ×1, dosena ×12, pack ×1
timbang (weight) → base unit: kg      | units: kg ×1, g ×0.001
sukat   (volume) → base unit: liter   | units: L ×1, ml ×0.001
```

`pack` compares per-pack (factor 1). The base unit drives the comparable price.

### TripItem — market link + normalized pricing

```
TripItem {
  …existing (id, itemId, label, quantity, unit, pricePaid, tripDate, uid, addedAt, category)…
  marketId: string | null;            // which market this line was bought at
  marketName: string | null;          // denormalized for display + history
  baseUnit: 'piece' | 'kg' | 'liter'; // from the item's form
  pricePerBaseUnit: number | null;    // pricePaid ÷ (quantity × unitFactor) — the comparable number
}
```

`pricePerUnit` (the old per-typed-unit field) is replaced by `pricePerBaseUnit`.

### Trip — default market, no single store

```
Trip {
  …existing (id, name, date, status, total, itemCount)…
  defaultMarketId: string | null;     // market new items inherit; overridable per item
  // REMOVED: storeName, single vendor. Markets visited are derived from the tripItems.
}
```

## Core calculation (pure, tested)

`domain/units.ts` holds the form→base-unit→factor table and:

```
baseUnitFor(form): BaseUnit
unitsFor(form): Unit[]
pricePerBaseUnit(pricePaid, quantity, unit): number | null
  // = pricePaid / (quantity * factor(unit)); null if price/qty missing or zero
```

This is the root fix for the per-unit bug and is plain Vitest unit-tested (no Firebase).

## Logging UX (single page)

### Starting a trip

Pick date (default today), optional name, optional **default market** (skippable — set per item later).

### Trip overview (landing screen)

Items **grouped by market** with per-market subtotals; running **Kabuuan** total; **"＋ Magdagdag ng item"**; **"Tapos — i-save ang biyahe."** Back leaves the trip as a resumable draft (unchanged from the prior redesign).

### Add item — one page (replaces the 3-step stepper)

- **Item:** recognition tiles + search to pick an existing item, or **"Bagong item"** to create.
  - *Creating a new item* shows two inline tile-pickers: **Form** (Bilang / Timbang / Sukat) and **Category**. Required, but only the first time that product exists.
- **Market:** a chip showing the trip default; tap to switch or add ("Bagong tindahan").
- **Dami (quantity):** *form-aware* — **Bilang** uses a big ± stepper (whole pieces); **Timbang/Sukat** use a decimal numeric keypad (0.5 kg, 250 ml). Unit chips are filtered to the item's form.
- **Presyo:** total paid, **prefilled** from the last purchase of this item *at the selected market* (falls back to its overall last price if none), editable.
- **Live readout:** normalized unit price updates as you type — "= ₱8 / piraso", "= ₱150 / kg".
- **I-save** → returns to the overview; the line appears under its market.

Picking an already-known item arrives **fully prefilled** (market, qty, unit, price) — glance, confirm/tweak price, save. This is the repetition fix.

### Save fan-out (updated)

On `saveTrip`, the per-item denormalization onto the library item now records the **last price-per-base-unit and the market**. Price memory becomes per-item *and* per-market so the next prefill is market-aware.

## Display & insights updates

- **Home & Biyahe rows:** show date + market(s) — "Sabado, 7 Hun · Palengke + SM · 12 items · ₱1,240" (">2 markets" collapses to "N tindahan").
- **Trip Summary:** line items grouped by market with subtotals, then the grand total.
- **Price History (per item):** the giant last price plus a small per-market comparison — "sa Palengke ₱150/kg · sa SM ₱180/kg" — using the normalized per-base-unit number ("saan mas mura").
- **Gastos:** category bars reflect real categories now that category is set at creation.
- **Items screen:** rows show the normalized last price ("₱8/piraso"); tapping an item allows **correcting its form/category** (the one place to fix mistakes / clean up old items).

## Migration

None. Development phase — breaking changes are expected. Reshape the model and re-seed; no backfill.

## Testing

- **Pure:** `domain/units.ts` (conversions, `pricePerBaseUnit`) — plain unit tests covering count/weight/volume and the dozen-vs-piece, kg-vs-½kg comparability cases.
- **Emulator:** markets CRUD; the updated save fan-out (per-market last price); per-market price-history query; `monthlyByCategory` still correct with real categories.
- **e2e:** the single-page add flow — create a new item (form+category), pick a market, log by weight and by count, see the normalized readout, finish; a multi-market trip groups correctly on the summary.

## Decomposition for planning

Tightly coupled, so likely one plan with phased tasks: (1) domain units + types; (2) markets data layer; (3) reshaped trip/item data layer + save fan-out + per-market history (emulator-tested); (4) new-item creation (form+category) + market picker UI; (5) single-page add form + form-aware quantity + prefill; (6) trip overview grouping + Home/Biyahe/Summary display; (7) per-market price history + Gastos; (8) e2e + sweep.
