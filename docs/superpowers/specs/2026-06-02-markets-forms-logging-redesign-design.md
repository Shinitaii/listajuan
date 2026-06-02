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

## Pricing philosophy (load-bearing)

There is **no single universal "comparable price."** Prices legitimately vary by market, by quantity, and by variant/size, and bundles aren't comparable to loose units — this is exactly why the benchmark apps skip pricing. We choose **honest per-context tracking + estimates**, not a false single number:

- **Normalize only definitional unit conversions** (dozen↔piece, kg↔g, L↔ml). These are arithmetic, not opinion.
- **Never normalize variants** (pack/size). They get a label and a separate history stream.
- **`pricePerBaseUnit` is a per-transaction breakdown**, shown labelled with its base unit. Comparability is surfaced by **history streams** keyed on (item + market + unit + variant) over time — letting her see the pattern and judge — not by collapsing everything into one figure.
- Prefill uses the last purchase in the **same** stream, so estimates stay context-true.

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
bilang  (count)  → base unit: piece   | units: piraso ×1, dosena ×12
timbang (weight) → base unit: kg      | units: kg ×1, g ×0.001
sukat   (volume) → base unit: liter   | units: L ×1, ml ×0.001
```

These are **definitional** conversions only (a dozen *is* 12 pieces; a kg *is* 1000 g). Normalizing across them is honest arithmetic, so the per-base-unit price is genuinely comparable within a form — "1 dosena ₱96" and "6 piraso ₱48" both read **₱8/piraso**. The per-base-unit number is always shown **labelled with the base unit** ("/piraso", "/kg", "/L"); fixing that label (it was hardcoded "/pc") is half the original bug's cure.

**`pack` is NOT a unit** and has been removed. A pack/bundle/size is a *variant*, not a definitional conversion — see "Variants" below. We do not pretend a 3-pack normalizes to a per-piece price.

### Variants (pack / size) — a label, not a unit, not a separate item

A "3-pack", "225 ml bottle", or "loose" is the same library item presented differently; its price is **not** comparable to other presentations. So:

- `variant: string | null` on the **TripItem** — a short free label ("3-pack", "225ml", "loose").
- It does **not** fragment the library (eggs stay one item) and does **not** feed normalization.
- It is **remembered per item** (prefilled from the last purchase) so it's low-friction.
- Price history is grouped into **separate streams by (item + market + unit + variant)**, so "Eggs · 3-pack · SM" and "Eggs · loose · palengke" are distinct trends. We deliberately do **not** answer "is a 3-pack cheaper than loose" — that's not a math question.

### TripItem — market link + normalized pricing

```
TripItem {
  …existing (id, itemId, label, quantity, unit, pricePaid, tripDate, uid, addedAt, category)…
  marketId: string | null;            // which market this line was bought at
  marketName: string | null;          // denormalized for display + history
  variant: string | null;             // pack/size label ("3-pack","225ml","loose"); NOT normalized
  baseUnit: 'piece' | 'kg' | 'liter'; // from the item's form
  pricePerBaseUnit: number | null;    // pricePaid ÷ (quantity × unitFactor) — comparable WITHIN a (item,market,unit,variant) stream
}
```

`pricePerUnit` (the old per-typed-unit field) is replaced by `pricePerBaseUnit`. Note `pricePerBaseUnit` is an honest per-transaction breakdown; comparability lives in history streams, not in a single universal number.

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
type Unit = 'piraso' | 'dosena' | 'kg' | 'g' | 'L' | 'ml';   // 'pack' removed; 'pcs'→'piraso'; 'L' added
type BaseUnit = 'piece' | 'kg' | 'liter';

baseUnitFor(form): BaseUnit
unitsFor(form): Unit[]
baseUnitLabel(baseUnit): string                 // 'piraso' | 'kg' | 'L' for display
pricePerBaseUnit(pricePaid, quantity, unit): number | null
  // = pricePaid / (quantity * factor(unit)); null if price/qty missing or zero
```

This (plus showing the correct unit **label**) is the root fix for the per-unit bug, and is plain Vitest unit-tested (no Firebase). Tests must cover dosena-vs-piraso and kg-vs-½kg producing equal per-base-unit values.

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
- **Variant (optional):** a small free-text/chip ("3-pack", "225ml", "loose"), prefilled from the last purchase of this item. Left blank for plain buys. Distinguishes price streams without splitting the item.
- **Presyo:** total paid, **prefilled** from the last purchase of this item *at the selected market + variant* (falls back to its overall last buy if none), editable.
- **Live readout:** per-base-unit price updates as you type, labelled with the base unit — "= ₱8 / piraso", "= ₱150 / kg".
- **I-save** → returns to the overview; the line appears under its market.

Picking an already-known item arrives **fully prefilled** (market, qty, unit, variant, price) — glance, confirm/tweak price, save. This is the repetition fix.

### Save fan-out (updated)

On `saveTrip`, the per-item denormalization onto the library item now records the **last purchase context** — price-per-base-unit, market, unit, and variant — so the next prefill matches the same context (item + market + variant).

## Display & insights updates

- **Home & Biyahe rows:** show date + market(s) — "Sabado, 7 Hun · Palengke + SM · 12 items · ₱1,240" (">2 markets" collapses to "N tindahan").
- **Trip Summary:** line items grouped by market with subtotals, then the grand total.
- **Price History (per item):** the giant last price plus a comparison across **streams** — grouped by market (and variant when present) — "sa Palengke ₱150/kg · sa SM ₱180/kg"; "loose ₱8/piraso · 3-pack ₱30". Uses the per-base-unit number within each stream ("saan mas mura"), never across incomparable variants.
- **Gastos:** category bars reflect real categories now that category is set at creation.
- **Items screen:** rows show the normalized last price ("₱8/piraso"); tapping an item allows **correcting its form/category** (the one place to fix mistakes / clean up old items).

## Migration

None. Development phase — breaking changes are expected. Reshape the model and re-seed; no backfill.

## Testing

- **Pure:** `domain/units.ts` (conversions, `pricePerBaseUnit`) — plain unit tests covering count/weight/volume and the dozen-vs-piece, kg-vs-½kg comparability cases.
- **Emulator:** markets CRUD; the updated save fan-out (last purchase context incl. variant); price-history grouped into (market, variant) streams; `monthlyByCategory` still correct with real categories.
- **e2e:** the single-page add flow — create a new item (form+category), pick a market, log by weight and by count, see the labelled per-base-unit readout, finish; a multi-market trip groups correctly on the summary; a variant-labelled buy forms its own history stream.

## Decomposition for planning

Tightly coupled, so likely one plan with phased tasks: (1) domain units (forms, conversions, `pricePerBaseUnit`, labels) + types; (2) markets data layer; (3) reshaped trip/item data layer + save fan-out (last context incl. variant) + (market, variant) history streams (emulator-tested); (4) new-item creation (form+category) + market picker UI; (5) single-page add form — form-aware quantity, variant field, context-true prefill; (6) trip overview grouping + Home/Biyahe/Summary display; (7) stream-grouped price history + Gastos on real categories; (8) e2e + sweep.
