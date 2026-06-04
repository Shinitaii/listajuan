# Review: barcode-prefill

## Verdict: PASS ✓

---

### 0. All Green (non-negotiable gate)

| Verify file | Result |
|---|---|
| `verify/item-barcodes.txt` | **GREEN** — 1 file, 5 tests passed (emulator) |
| `verify/product-lookup.txt` | **GREEN** — 1 file, 6 tests passed (pure) |
| `verify/integration.txt` | **GREEN** — 5 files, 30 tests passed |

All verify artifacts present. All 100% passing. Gate: ✓

---

### 1. Product Requirements Met?

| Requirement | Met? |
|---|---|
| Scan via device camera (Capacitor), graceful no-camera path | ✓ `capture.ts:isScanAvailable()` + `scanBarcode()` return null on web/dev |
| Library-first match: scanned code on library item prefills offline | ✓ `findItemByBarcode` client-side filter over local Firestore cache |
| Store barcodes on matched/created item (`barcodes: string[]`) | ✓ `types.ts:25`; `attachBarcode` in `items.ts:71` (idempotent) |
| API fallback (cold-start only): unmatched + online → name suggestion | ✓ `lookupProductName` against Open Food Facts |
| Offline / not-found → manual entry, no error, no blocking | ✓ all null-return paths, never throws |
| Show provenance (library vs suggested) — Should-Have | Not explicitly wired into a UI component yet (data layer groundwork present); acceptable at this stage per "should-have" scope |

All Must-Haves: ✓

### 2. Tech Stack Followed?

Svelte 5 + Capacitor 8 + Firestore client SDK: ✓. No API server added: ✓. Tests in Vitest (pure + emulator): ✓. `@capacitor-mlkit/barcode-scanning` plugin: ✓.

### 3. Module Boundaries

| Module | Files owned | Correct? |
|---|---|---|
| item-barcodes | `types.ts` (barcodes field), `items.ts` (findItemByBarcode, attachBarcode), `items.barcode.emulator.test.ts` | ✓ |
| product-lookup | `scan/lookup.ts`, `scan/lookup.test.ts` | ✓ |
| scan-capture | `scan/capture.ts`, `scan/capture.test.ts` | ✓ (infra-only; no spurious cross-boundary imports) |

Each module owns only its declared files. ✓

### 4. Code Quality

All modules passed `review-code-quality` (per Phase A→B→C pipeline). ✓

### 5. Test Coverage

- `item-barcodes`: 5 emulator tests covering all plan cases (createItem init, attachBarcode+find, null when not found, idempotent, tolerates missing field). ✓
- `product-lookup`: 6 pure unit tests (found, not-found, network throw, missing name, empty code, non-ok HTTP). ✓
- `scan-capture`: covered in integration suite. ✓
- Integration: 30 tests across 5 files — full suite green. ✓

### 6. Integration Points

Contracts match spec:
- `scanBarcode()` → `string | null` ✓
- `findItemByBarcode(db, uid, code)` → `Item | null` ✓
- `lookupProductName(code, deps?)` → `string | null` ✓

### 7. Scope Creep

No undefined modules introduced. No nutrition facts, receipt OCR, or price-from-barcode code present. ✓

---

**PASS** ✓ — All requirements met. Ready for ship-digest and commit.
