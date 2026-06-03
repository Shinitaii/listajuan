# Plan: product-lookup

### Problem
Given a barcode with no library match, suggest a product name best-effort. Must never throw,
never block: offline / not-found / error all return null so the caller falls back to manual entry.

### Solution Approach
Query Open Food Facts v2 product endpoint for `product_name`. Inject `fetch` for testability and
to keep it pure. Guard invalid input before any network call.

### Implementation Steps
1. `lookupProductName(code, deps?={fetch})` → `Promise<string | null>`.
2. Trim code; empty → return null WITHOUT calling fetch.
3. GET `https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name`.
4. Non-ok response, `status !== 1`, missing/blank name, or any thrown error → null.
5. Otherwise return the trimmed `product.product_name`.

### Test Cases
- found → returns the name
- not found (`status: 0`) → null
- network throws (offline) → null
- name missing/blank → null

### Edge Cases
- empty/whitespace code → null, and fetch is NOT called
- non-ok HTTP status → null
