# Plan: item-barcodes

### Problem
Library items need to carry barcodes and be looked up by one, fully offline — the library-first
core. Follows the existing client-side-filter pattern (`searchItems`) at single-user scale.

### Solution Approach
Add `barcodes: string[]` to `Item`. Add `attachBarcode` (idempotent append) and
`findItemByBarcode` (client-side find over the local cache). Treat a missing `barcodes` field
on older docs as `[]`.

### Implementation Steps
1. `types.ts`: add `barcodes: string[]` to `Item`.
2. `items.ts` `createItem`: initialize `barcodes: []`.
3. `items.ts` `attachBarcode(db, uid, itemId, code)`: load item; if code already present, no-op;
   else append and persist. Throw if item missing (mirrors `updateItemMeta`).
4. `items.ts` `findItemByBarcode(db, uid, code)`: load items, return the first whose
   `(barcodes ?? [])` includes the trimmed code, else null.

### Test Cases
- createItem initializes `barcodes` to `[]`
- attachBarcode adds a code; findItemByBarcode then finds that item
- findItemByBarcode returns null when no item carries the code

### Edge Cases
- attachBarcode is idempotent (no duplicate codes)
- findItemByBarcode tolerates items with no `barcodes` field (treats as [])
