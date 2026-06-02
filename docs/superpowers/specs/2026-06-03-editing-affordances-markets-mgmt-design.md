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
- **Default market is a global Settings value** (on the user doc), not a per-trip prompt. Each trip seeds its **current market** from it; the current market is **sticky within the trip** (changing it in AddItem updates the trip's current market so subsequent items inherit), and is **overridable per line**.
- **Market-aware prefill:** when an item is picked/added, its price prefills from that item's history **at the current market** (`lastContextFor(item, currentMarketId, variant)`), so the estimate reflects the right market.
- **Group trip lines by `marketId`** (display the name) — fixes two same-named markets merging.
- The item↔market relationship is **many-to-many, derived from `tripItems`** — no join collection.

## Data model

No new collections. Minor field/semantics changes:

- `Item.purchaseCount` becomes **derived** (count of distinct trips containing the item), recomputed on change rather than incremented at save. Existing `last*` denorm fields unchanged in shape but now recomputed (not save-time-only).
- `Trip.status` retained; **no longer locks editing**. `total`/`itemCount`/`marketNames` recomputed on every line mutation (not only at "Tapos").
- `Trip.defaultMarketId` repurposed as the trip's **current market** (seeded from the user setting at creation; updated when the user changes market in AddItem). `Trip.defaultMarketName` added (denormalized, so the chip/labels never show an id without a name — fixes the prior latent bug).
- **User doc `/users/{uid}`** gains `settings: { defaultMarketId: string | null; defaultMarketName: string | null }` — the global default market.
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

`src/lib/data/settings.ts` (new):
- **`getUserSettings(db, uid)`** and **`subscribeUserSettings`** reading `/users/{uid}.settings`; **`setDefaultMarket(db, uid, marketId, marketName)`**. `createDraftTrip` seeds `defaultMarketId`/`defaultMarketName` from the user setting; **`setTripMarket(db, uid, tripId, marketId, marketName)`** updates the trip's current market (called when AddItem's market changes).

All new/changed data-layer functions get emulator tests, including: mutating a saved trip's lines recomputes totals and does **not** double-count `purchaseCount`; `recomputeItem` after a remove falls back to the prior line / nulls; market rename/delete.

## Screens

### Trip screen (`/trip/:id`) — the ONE trip screen (logging + viewing + editing)

There is **no separate `/log` screen.** `/log/:id` is removed (or redirects to `/trip/:id`). Logging a new trip, resuming a draft, and viewing/editing a saved trip are all the same screen — its only state difference is whether a "Tapos" button shows.

**Entry points** all land here:
- Home "Bagong biyahe" → `createDraftTrip` → `push('/trip/:id')`.
- Biyahe "Ipagpatuloy" (draft) or a saved-trip row → `push('/trip/:id')`.

**The screen loads the trip by id and subscribes live** (`getTrip` + `subscribeTripItems`) — it does NOT use a draft singleton. (The `draft.svelte.ts` store is retired; mutations call the data layer directly with the `tripId`.)

Renders:
- Total card (date, `N item(s)`, markets-visited chips).
- If the trip has **no items yet** (just created), open the **AddItem** form directly so logging starts immediately; otherwise show the list with a **"＋ Magdagdag ng item"** button.
- Items **grouped by market** with per-market subtotals.
- Each line: label, `{qty} {unit} × ₱{price}` + normalized `₱{ppu}/{baseUnitLabel}`, the line total, and **edit (✎) / remove (🗑) icon buttons** beside the price.
- **＋ Magdagdag ng item** → AddItem (add mode) for this trip → `addTripItem` (→ recompute). AddItem is passed the trip's **current market** (`defaultMarketId`/`defaultMarketName`) as the preselected market; if the user changes the market there, call `setTripMarket` so it sticks for the next item. Item price prefills from that market's history.
- **Edit** on a line → AddItem in **edit mode**: item fixed; market, variant, qty, unit, price editable (live readout); save → `updateTripItem` (→ recompute).
- **Remove** on a line → `removeTripItem` (→ recompute). Inline, no confirmation.
- **Delete trip** → the single ConfirmDialog.
- **Tapos — i-save** button shown only while `status === 'draft'`; flips draft→saved and navigates Home. A saved trip shows no finish button (it's done, but still fully editable if reopened).

**Leaving is never "finished":** navigating back/away (tab bar, back) just leaves the trip as-is — a draft stays a draft (still shows under Biyahe "Ipagpatuloy"), a saved trip stays saved. Only "Tapos" changes status. This removes the "exit = finished" surprise.

**Retire `draft.svelte.ts`** — `startNewTrip`/`resumeTrip`/`addToDraft`/`commitDraft` are replaced by: `createDraftTrip` (Home) + the Trip screen's own by-id subscription + direct `addTripItem`/`updateTripItem`/`removeTripItem`/`saveTrip` calls. Remove the store and its references.

### "Iba pa" tab → Markets + Settings

- **TabBar** gains a 5th tab **"Iba pa"** (Lucide `Menu`/`MoreHorizontal`) → **More menu page (`/more`)** listing **"Mga tindahan"** (→ `/markets`) and **"Mga setting"** (→ `/settings`); room for future entries.
- **Markets page (`/markets`):** list of markets (name + type) each with edit/remove icon buttons; **"＋ Bagong tindahan"** creates one (reusing the creation UI). Edit = rename / change type. Remove = one confirmation; tripItems keep their `marketName`.
- **Settings page (`/settings`):** a **default market** picker (the MarketPicker, writing `setDefaultMarket`) — your usual market, preselected for new trips. Shows the current default; "wala" if unset. (Home for future settings.)

### Items (`/items`) — full CRUD

- **"＋ Bagong item"** → create (name + FormPicker + CategoryPicker), no purchase yet.
- Rows: category icon, name, `N biyahe`, normalized last price, with **edit (✎) / remove (🗑) icon buttons next to the price** (replacing the "I-edit" text link). Row tap still → price history.
- **Edit:** rename + form + category. (No alias editing.)
- **Remove:** one ConfirmDialog; delete library doc, keep history.

### Shared

- New `src/lib/ui/IconButton.svelte` — a ≥44×44 icon button (Lucide), used for edit/remove across Trip, Items, Markets. No emoji.

## Out of scope (still parked)

Recipes/saved lists, recommendations/ML, i18n. (The prior round's trip-default-market wiring and same-name-market grouping are now **in scope** — see Decisions.)

## Testing

- **Emulator:** `recomputeItem`/`recomputeTrip` correctness; mutating a saved trip (add/edit/remove) recomputes totals and does not double-count `purchaseCount`; `saveTrip` no longer increments; market `updateMarket`/`deleteMarket`; `deleteItem` + history survival; item rename recomputes `nameLower`; `setDefaultMarket`/`getUserSettings` round-trip; `createDraftTrip` seeds market from the setting; grouping keyed by `marketId` (two same-named markets stay separate).
- **e2e:** add an item to an already-saved trip from the Trip screen; edit a line (change market + price) via the AddItem editor and see the total update; remove a line; create an item on the Items page then log it; rename/delete an item; create/edit/delete a market under "Iba pa" → Tindahan; set a default market in Settings and confirm a new trip preselects it.

## Decomposition for planning

One plan, phased: (1) data-layer `recompute*` + `saveTrip` change + market/item CRUD + user-settings module + `marketId`-keyed grouping helper (emulator-tested); (2) `IconButton` primitive + AddItem edit-mode support + market preselect/sticky + market-aware prefill; (3) the ONE Trip screen (`/trip/:id`) replacing both TripSummary and LogTrip — by-id subscription, add/edit/remove, Tapos-if-draft, group by marketId; (4) remove `/log` route + retire `draft.svelte.ts` + point "Bagong biyahe"/resume at `/trip/:id` (seed market from settings); (5) Items full CRUD; (6) "Iba pa" tab + More menu + Markets page + Settings page (default market); (7) e2e + sweep.
