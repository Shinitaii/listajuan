# Trip Add-Item Flow & Item Library Redesign — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Builds on:** Markets, Product Forms & Logging Redesign (2026-06-02)

## Motivation

The current add-item flow has clarity issues:

1. **Context disappears** — When you tap "＋ Magdagdag ng item," the entire trip overview (total, items list) vanishes, replaced by a form. On a phone with a long item list, there's no sense of what you're adding to.
2. **Unclear return path** — A "Bumalik sa listahan" button appears, which is confusing (you're already in the list view).
3. **Form layout feels redundant** — The Dami section (quantity + unit chips) sits awkwardly next to the Presyo (price + QuickAdjust), even though they're sequential decisions.
4. **Variant field adds noise** — The optional Uri (variant) field is rarely used but takes up visual space.
5. **Items page can't seed price** — When creating a new library item on the Items page, you set form and category but not price. Biyahe's add flow captures price, but Items doesn't, leading to inconsistent data and poor prefills later.

This design restructures the add-item flow into a step-by-step modal, keeps the trip context always visible, and adds price capture to the Items page.

## Design

### Trip Overview Page

**Header (top of screen):**
- Left: Back button (ChevronLeft)
- Center: Trip name + date (e.g., "Linggo · 2026-06-01")
- Right: Three-dot menu (⋯) with "Burahin ang biyahe" (delete with confirm dialog)

**Primary action button:**
- "Tapos — i-save ang biyahe" (full width, prominent, below header)
- Moves from the bottom to the top so it's the first thing users see after filling items

**Trip summary card** (unchanged):
- Kabuuan (total) in hero font
- Item count badge

**Items list** (unchanged):
- Grouped by market with per-market subtotals
- Edit/delete buttons per item

**Add button** (stays at bottom):
- "＋ Magdagdag ng item" — tapping opens the modal

**Removed:**
- The "Bumalik sa listahan" button (no longer needed with modal pattern)

### Add-Item Modal (Step-by-Step)

When tapping "＋ Magdagdag ng item," a modal overlay appears with the trip overview dimmed behind it.

#### **Step 1: Pick Item**

Modal content:
- ItemPicker (search input + recognition tiles showing top 8 frequently-bought items or search results)
- "Bagong item: {name}" button appears below tiles if typing a new name

Modal actions:
- "Kanselahin" button closes the modal, returns to overview
- Selecting an existing item advances to Step 2
- Tapping "Bagong item" shows inline Form + Category pickers; after confirming, advances to Step 2 with the newly-created item

#### **Step 2: Set Quantity**

Modal content:
- **Item heading:** "{canonicalName}" (read-only, shows what's being added)
- **Dami section:**
  - QtyField (form-aware: big ± stepper for bilang, decimal input for timbang/sukat)
  - Unit chips below (filtered to the item's form; one is pre-selected as the item's defaultUnit)
- **Market chip:** Shows trip's defaultMarketName; tap to open MarketPicker inline (can change or leave as-is)
- **"More options" expander:**
  - Contains: Uri (variant) input field with placeholder "walang laman = ordinaryo"
  - Labeled: "Uri (opsyonal) — hal. '3-pack', '225ml'"
  - Collapsed by default to reduce visual clutter

Modal actions:
- "Bumalik" button goes back to Step 1 (ItemPicker)
- "Susunod" button advances to Step 3

#### **Step 3: Set Price**

Modal content:
- **Item heading:** "{canonicalName} · {quantity} {unit}" (shows the choice from Step 2)
- **Presyo section:**
  - QuickAdjust (price input with ±25/50/100 buttons, prefilled from `lastContextFor`)
  - Live readout: "= ₱X / {baseUnitLabel}" (e.g., "= ₱8 / piraso")
- **"More options" expander:** (same as Step 2, in case variant wasn't set earlier)

Modal actions:
- "Bumalik" button goes back to Step 2 (Quantity)
- "I-save ang item" button:
  - Calls `addTripItem` with the complete input (itemId, quantity, unit, pricePaid, marketId, marketName, variant, category)
  - Closes modal
  - Returns to trip overview; new item appears under its market in the list

**Modal behavior:**
- Modal can be dismissed by tapping outside (optional affordance) → returns to overview unchanged
- Step 2 & 3 can also show the market picker inline if user taps the market chip
- Variant prefill: If editing an existing item, variant pre-loads from `existing.variant`; if adding, it's empty (user can set in "More options")

### Items Page — New Item Creation with Price

**Create panel** (when creating a new library item):

1. **Pangalan** — text input
2. **Anyo** — FormPicker (bilang, timbang, sukat)
3. **Kategorya** — CategoryPicker
4. **Presyo (opsyonal)** — simple number input
   - Label: "Presyo ng 1 {baseUnitLabel}" (e.g., "Presyo ng 1 piraso")
   - Plain text/number input (not QuickAdjust — no quantity context in the library to make ± buttons meaningful)
   - Price field is **optional** — can create item without price if desired
   - Quantity is implicitly 1 base unit (no quantity field)
5. **Gumawa button** — creates item with price (if provided)

**Rationale:** Capturing price at library creation time (the moment you're adding a new item because you just bought it) provides a useful seed for future trip prefills. Quantity is always 1 base unit, so no ambiguity.

**Inline editor** (when editing existing item metadata):
- Unchanged — allows edit of name, form, category only
- Price is not editable here (price is transaction-specific to trips; library items get price from the most recent transaction via `lastPricePerBaseUnit`)

### State & Data Flow

- **New state in Trip.svelte:** `mode` already exists and is used to switch between 'view' and 'add'; this stays
- **Modal step management:** Add internal state to AddItem component to track steps (1, 2, 3) and render accordingly
- **Prefill logic:** 
  - Step 2: market defaults to trip's `defaultMarketId`/`defaultMarketName`
  - Step 3: price prefills via `lastContextFor(db, uid, itemId, marketId, variant)` (existing logic)
  - Variant prefills from item's `lastVariant` if present
- **New Item creation in Items.svelte:**
  - Add price field to the create form
  - When saving, pass price to `createItem` if provided; store as the item's initial `lastPricePerBaseUnit`

### Testing

- **e2e:** Tap add → ItemPicker appears, overview visible below; pick existing item → Step 2 shows quantity; change unit → Step 3 prefills price correctly; change price → readout updates; save → item appears in list; modal closes
- **e2e:** New item: pick "Bagong item" from ItemPicker → inline form pickers appear; set form & category → proceed → quantity step; set quantity & save
- **e2e:** Dismiss modal by back button or outside click → overview unchanged
- **e2e (Items page):** Create new item → set form, category, price → item appears in library; add to trip → price prefills in Step 3
- **Unit:** Variant is optional; prices with/without variant prefill correctly from `lastContextFor`

## Implementation Notes

- AddItem component gains step-tracking state (`currentStep: 1 | 2 | 3`)
- Conditionally render ItemPicker, QtyField section, or Presyo section based on `currentStep`
- Trip.svelte modal backdrop (dim overlay) can be a simple CSS class toggled by `mode === 'add'`
- Items.svelte price input is optional; pass `null` to `createItem` if left blank
