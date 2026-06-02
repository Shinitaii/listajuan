# Editing, Affordances & Markets Management — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Builds on:** the markets/forms/logging redesign (`docs/superpowers/specs/2026-06-02-markets-forms-logging-redesign-design.md`). Supersedes the locked-after-save trip model.

## Motivation (from real use)

After the redesign, several gaps surfaced:

1. **Exiting a trip reads as "finished"** and a saved trip can't be reopened to add items (`resumeTrip` refuses non-drafts). There's no clear "save / continue later."
2. **The trip summary can't add items**, its line edit is a fragile `document.getElementById` qty/price-only inline (no market/variant/unit), the whole row is the edit button, and there's no per-line **remove**.
3. **No edit/remove icon buttons** — actions are text links / whole-row taps.
4. **The Items page can't create an item**, has no remove, and "I-edit" is a text link doing form/category only.
5. **No Markets management** anywhere (markets can only be created mid-logging).

## Decisions

- **Trips are always editable** — drop the save-lock. Status (`draft`/`saved`) remains only for the "resume unfinished" affordance and so analytics ignore drafts; it no longer gates editing.
- **Item denorm is derived, not incremented** — recomputed from history on any line change, so re-edits never double-count.
- **Merge log + summary into one Trip screen** (`/trip/:id`), always editable.
- **Markets management** lives under a new **"Iba pa" (More) tab** → menu page → Markets page.
- **Reuse the AddItem form** for line editing; **icon buttons** (Lucide Pencil/Trash2) for edit/remove everywhere; **delete + keep history** for both items and markets.

## Data model

No new collections. Minor field/semantics changes:

- `Item.purchaseCount` becomes **derived** (count of distinct trips containing the item), recomputed on change rather than incremented at save. Existing `last*` denorm fields unchanged in shape but now recomputed (not save-time-only).
- `Trip.status` retained; **no longer locks editing**. `total`/`itemCount`/`marketNames` recomputed on every line mutation (not only at "Tapos").
- Markets, TripItem, forms/units, variants — unchanged from the prior spec.

## Data layer

`src/lib/data/trips.ts`:
- **Remove** the draft-guard and `purchaseCount: increment(1)` from `saveTrip`. `saveTrip` now only flips `status: 'saved'` and writes the recomputed `total`/`itemCount`/`marketNames`; it no longer fans out increments.
- **Add `recomputeItem(db, uid, itemId)`** — reads `priceHistory(itemId)` (existing collectionGroup query, newest-first) and writes the parent item's `lastPricePerBaseUnit/lastUnit/lastBaseUnit/lastPriceDate/lastMarketName/lastVariant` from the newest line (or nulls if none) and `purchaseCount` = number of distinct `tripId`s present. Idempotent.
- **Add `recomputeTrip(db, uid, tripId)`** — recomputes and writes `total`/`itemCount`/`marketNames` for a trip from its tripItems.
- `addTripItem`, `updateTripItem`, `removeTripItem` each call `recomputeTrip(tripId)` and `recomputeItem(affectedItemId)` after their write. (TripItem carries `itemId`, so removal can recompute the right item.)
- Editing a line's `itemId` is not allowed (item is fixed in the editor), so only one item is affected per edit. Add/remove affect that line's item.

`src/lib/data/markets.ts`:
- **Add `updateMarket(db, uid, marketId, { name?, type? })`** (recompute `nameLower` on rename) and `deleteMarket(db, uid, marketId)`. Deleting does NOT touch tripItems (they keep their denormalized `marketName`).

`src/lib/data/items.ts`:
- **Add `deleteItem(db, uid, itemId)`** (deletes the library doc only; tripItems keep their saved `label`). `updateItemMeta` extended to accept `canonicalName?` (rename → recompute `nameLower`).

All new/changed data-layer functions get emulator tests, including: mutating a saved trip's lines recomputes totals and does **not** double-count `purchaseCount`; `recomputeItem` after a remove falls back to the prior line / nulls; market rename/delete.

## Screens

### Trip screen (`/trip/:id`) — merged, always editable

Replaces both the old TripSummary and the LogTrip overview. Renders:
- Total card (date, `N item(s)`, markets-visited chips).
- Items **grouped by market** with per-market subtotals.
- Each line: label, `{qty} {unit} × ₱{price}` + normalized `₱{ppu}/{baseUnitLabel}`, the line total, and **edit (✎) / remove (🗑) icon buttons** beside the price.
- **"＋ Magdagdag ng item"** → opens the **AddItem** form (add mode) for this trip.
- **Edit** on a line → opens **AddItem in edit mode**: item fixed; market, variant, qty, unit, price editable (with the live readout); save calls `updateTripItem` (→ recompute).
- **Remove** on a line → `removeTripItem` (→ recompute). Inline, no confirmation (undo-friendly philosophy; only trip-delete confirms).
- **Delete trip** → the single ConfirmDialog.
- If `status === 'draft'`: a **"Tapos — i-save"** button (flips to saved). Otherwise no finish button (already saved, still editable).

### LogTrip (`/log/:id`) — focused new-trip logging

Kept for the immediate post-"Bagong biyahe" flow (overview + AddItem add mode). Its back control is relabelled **"Tapos muna"** (save & continue later — stays a draft, resumable). "Tapos — i-save" finalizes and navigates to `/trip/:id`. Both screens reuse AddItem and a shared grouped-list rendering; extract a shared component if duplication is meaningful, otherwise keep parallel.
(If implementation finds the two fully redundant, collapsing `/log/:id` to just route into the Trip screen is acceptable — the Trip screen is the source of truth.)

### Markets (`/markets`) under "Iba pa"

- **TabBar** gains a 5th tab **"Iba pa"** (Lucide `Menu`/`MoreHorizontal`) → **More menu page (`/more`)** listing **"Mga tindahan"** (→ `/markets`); room for future entries.
- **Markets page:** list of markets (name + type) each with edit/remove icon buttons; **"＋ Bagong tindahan"** creates one (reusing the creation UI). Edit = rename / change type. Remove = one confirmation; tripItems keep their `marketName`.

### Items (`/items`) — full CRUD

- **"＋ Bagong item"** → create (name + FormPicker + CategoryPicker), no purchase yet.
- Rows: category icon, name, `N biyahe`, normalized last price, with **edit (✎) / remove (🗑) icon buttons next to the price** (replacing the "I-edit" text link). Row tap still → price history.
- **Edit:** rename + form + category. (No alias editing.)
- **Remove:** one ConfirmDialog; delete library doc, keep history.

### Shared

- New `src/lib/ui/IconButton.svelte` — a ≥44×44 icon button (Lucide), used for edit/remove across Trip, Items, Markets. No emoji.

## Out of scope (still parked)

Recipes/saved lists, recommendations/ML, i18n, the trip-default-market wiring + same-name-market grouping carry-forwards from the prior spec.

## Testing

- **Emulator:** `recomputeItem`/`recomputeTrip` correctness; mutating a saved trip (add/edit/remove) recomputes totals and does not double-count `purchaseCount`; `saveTrip` no longer increments; market `updateMarket`/`deleteMarket`; `deleteItem` + history survival; item rename recomputes `nameLower`.
- **e2e:** add an item to an already-saved trip from the Trip screen; edit a line (change market + price) via the AddItem editor and see the total update; remove a line; create an item on the Items page then log it; rename/delete an item; create/edit/delete a market under "Iba pa" → Tindahan.

## Decomposition for planning

One plan, phased: (1) data-layer `recompute*` + `saveTrip` change + market/item CRUD (emulator-tested); (2) `IconButton` primitive + AddItem edit-mode support; (3) merged Trip screen; (4) Items full CRUD; (5) "Iba pa" tab + More menu + Markets page; (6) LogTrip relabel/handoff; (7) e2e + sweep.
