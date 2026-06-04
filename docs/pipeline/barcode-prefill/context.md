# Architecture Context: Barcode → Name Prefill

## Classification
**Brownfield + dependency-add** — extends an existing, well-structured app. Touches the item
model, the data layer, and the add-item flow; requires a new Capacitor scanner plugin.

## Existing Code (touched/relevant)
- `src/lib/domain/types.ts` · `Item` — has `canonicalName`, `nameLower`, `aliases[]`, category,
  form, units, denormalized `lastPrice*`, `purchaseCount`. **No barcode field today.**
- `src/lib/data/items.ts` — `createItem`, `getItem`, `searchItems` (client-side filter over the
  whole single-user library, offline against local cache), `updateItemMeta`, `subscribeItems`.
  Barcode lookup should follow the same client-side-filter pattern (`findItemByBarcode`).
- `src/routes/AddItem.svelte` / `ItemPicker.svelte` — where a "scan" affordance and name-prefill
  would wire in (recognition-over-recall flow).
- `src/lib/data/paths.ts`, `firestore.rules` — items live at `/users/{uid}/items/{itemId}`.

## Tech Debt & Scalability
- `searchItems` loads the entire items collection per call; `findItemByBarcode` will do the same.
  **Not new debt** — consistent with the existing, deliberate single-user-scale pattern. Fine.
- No composite index needed: barcode match is a client-side filter, not a Firestore query. No
  index wait, no rules change for lookup.

## Infra / Dependencies
- **New Capacitor plugin** for barcode scanning (e.g. `@capacitor-mlkit/barcode-scanning`).
  npm dependency + `npx cap sync`. This is the one real infra step. Web fallback needed for dev
  (camera not present in `vite dev`) — guard scan behind capability detection.
- Add `barcodes: string[]` to the `Item` model (mirrors the `aliases[]` pattern; a product can
  have multiple codes across sizes/variants). No migration needed — absent field reads as `[]`.

## ⚠ Constraint Conflict (decision required)
CLAUDE.md states plainly: **"there is no API server, and we are not adding one"** and
**offline-first is mandatory**. The user leans toward an **external product API** for first-time
barcode lookup. These are in tension:
- A strict reading of "no API server" = *we don't run a backend* — a client→public-DB call
  (Open Food Facts) does not add a server we maintain, so it is arguably permissible.
- BUT it breaks **offline-first** for that one action and adds a third-party dependency.
- Resolution that honors both: external lookup is **best-effort and gracefully degrading** —
  online + found → prefill name; offline or not-found → fall back to manual name entry (the
  current behavior). The network call is never on the write path and never blocks the UI.

## Architectural Decisions (confirmed with human)
1. **Lookup order: library-first, then API fallback.** Always match the local library first
   (offline, instant, compounds over time). Only when unmatched AND online → call the external
   product API (Open Food Facts) to prefill a name for a NEW item. Offline or not-found →
   manual entry (current behavior). Rationale: the library solves the long run; the API solves
   the cold-start (empty library on day one). Network call is best-effort, never blocks the UI,
   never on the write path.
2. **Barcode storage:** `barcodes: string[]` on `Item` (mirrors `aliases[]`; absent ⇒ `[]`).

## Constraints for Spec (binding on product/coding spec)
- Data-layer isolation: all Firestore access stays behind `src/lib/data/` (no direct firebase
  imports in components).
- Offline-first: scanning + matching the existing library must work fully offline; only the
  optional external name-lookup may use the network, and only best-effort.
- **Test runner is Vitest, not Jest.** Pure logic → `*.test.ts`; data-layer → `*.emulator.test.ts`
  (Firestore emulator, needs Java). TDD is the house style already.
- Filipino-first UI copy; tap targets ≥44pt; recognition-over-recall flow.
